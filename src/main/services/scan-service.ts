import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { readJson, writeJsonAtomic } from '../storage/json-store'
import { lastRunFile, snapshotFile } from '../storage/paths'
import { apiFingerprint } from '@core/rules/fingerprint'
import type {
  ScanCandidate,
  ScanResult,
  ScanRunSummary,
  ScanScope,
  ScanSummary
} from '@shared/contract'
import { AppException } from '../errors'
import { ProjectService } from './project-service'
import { CatalogService, type StoredInterface } from './catalog-service'
import { scanEngineInfo } from '../scanner/java-scanner'
import type { ScannedInterface, ScannerResult } from '../scanner/types'

interface ScanSession {
  scanId: string
  projectId: string
  scope: ScanScope
  startedAt: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  cancelRequested: boolean
  result?: ScanResult
  scanned: Map<string, ScannedInterface>
  uncomparedModules: string[]
  worker?: Worker
}

export interface ScanEvents {
  progress: (payload: { scanId: string; phase: string; message: string; percent?: number }) => void
  completed: (payload: { scanId: string; summary: ScanSummary }) => void
  failed: (payload: { scanId: string; error: { code: string; message: string } }) => void
  cancelled: (payload: { scanId: string }) => void
}

function keyOf(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

function now(): string {
  return new Date().toISOString()
}

export class ScanService {
  private readonly sessions = new Map<string, ScanSession>()
  private activeScanId: string | null = null

  constructor(
    private readonly dataDir: string,
    private readonly grammarPath: string,
    private readonly events: ScanEvents
  ) {}

  private projects(): ProjectService {
    return new ProjectService(this.dataDir)
  }

  private catalog(): CatalogService {
    return new CatalogService(this.dataDir)
  }

  async start(projectId: string, scope: ScanScope): Promise<{ scanId: string }> {
    if (this.activeScanId) throw new AppException('CONFLICT', '已有扫描正在进行，请等待完成或取消。')
    if (scope.type === 'directory' && !scope.directory?.trim()) {
      throw new AppException('VALIDATION', '指定目录扫描需要填写目录路径。')
    }
    if (scope.type === 'modules' && (!scope.modules || scope.modules.length === 0)) {
      throw new AppException('VALIDATION', '指定模块扫描需要至少选择一个模块。')
    }
    const project = await this.projects().get(projectId)
    if (!project.sourceDir.trim()) throw new AppException('VALIDATION', '当前项目未选择源码目录，请先选择源码目录。')
    if (scope.type === 'directory' && scope.directory) {
      const absolute = isAbsolute(scope.directory) ? scope.directory : resolve(project.sourceDir, scope.directory)
      const inside = relative(project.sourceDir, absolute)
      if (inside.startsWith('..')) throw new AppException('VALIDATION', '扫描目录必须位于项目源码目录内。')
      scope = { ...scope, directory: absolute }
    }
    if (scope.type === 'modules' && scope.modules) {
      for (const modulePath of scope.modules) {
        const absolute = isAbsolute(modulePath) ? modulePath : resolve(project.sourceDir, modulePath)
        const inside = relative(project.sourceDir, absolute)
        if (inside.startsWith('..')) throw new AppException('VALIDATION', '扫描模块必须位于项目源码目录内。')
      }
    }
    const scanId = randomUUID()
    const session: ScanSession = {
      scanId,
      projectId,
      scope,
      startedAt: now(),
      status: 'running',
      cancelRequested: false,
      scanned: new Map(),
      uncomparedModules: []
    }
    this.sessions.set(scanId, session)
    this.activeScanId = scanId
    void this.run(session, project.sourceDir, project.excludePatterns)
    return { scanId }
  }

  private workerPath(): string {
    const path = join(__dirname, 'scan-worker.js')
    return path.includes('app.asar') ? path.replace('app.asar', 'app.asar.unpacked') : path
  }

  private scanInWorker(
    session: ScanSession,
    target: { directory?: string; label: string },
    sourceDir: string,
    excludePatterns: string[],
    onProgress: (message: string, processed: number, total: number) => void
  ): Promise<ScannerResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath(), {
        workerData: {
          sourceDir,
          scopeDirectory: target.directory,
          excludePatterns,
          grammarPath: this.grammarPath
        }
      })
      session.worker = worker
      let settled = false
      const settle = (callback: () => void): void => {
        if (settled) return
        settled = true
        session.worker = undefined
        void worker.terminate().catch(() => undefined)
        callback()
      }
      worker.on('message', (message: {
        type?: string
        result?: ScannerResult
        message?: string
        processed?: number
        total?: number
      }) => {
        if (message.type === 'progress') {
          onProgress(message.message ?? '', message.processed ?? 0, message.total ?? 0)
        } else if (message.type === 'result' && message.result) {
          settle(() => resolve(message.result as ScannerResult))
        } else if (message.type === 'cancelled') {
          settle(() => resolve({ interfaces: [], fileCount: 0, issues: [] }))
        } else if (message.type === 'error') {
          settle(() => reject(new Error(message.message || '扫描失败。')))
        }
      })
      worker.on('error', (error) => settle(() => reject(error)))
      worker.on('exit', (code) => {
        if (!settled) settle(() => reject(new Error(`扫描 Worker 提前退出，代码 ${code}`)))
      })
    })
  }

  private async run(session: ScanSession, sourceDir: string, excludePatterns: string[]): Promise<void> {
    try {
      const scanTargets: Array<{ directory?: string; label: string }> = session.scope.type === 'directory'
        ? [{ directory: session.scope.directory, label: '指定目录' }]
        : session.scope.type === 'modules'
          ? (session.scope.modules ?? []).map((modulePath) => ({
              directory: isAbsolute(modulePath) ? modulePath : resolve(sourceDir, modulePath),
              label: modulePath
            }))
          : [{ directory: undefined, label: '整个工程' }]

      for (let index = 0; index < scanTargets.length; index += 1) {
        const target = scanTargets[index]
        const scannerResult = await this.scanInWorker(
          session,
          target,
          sourceDir,
          excludePatterns,
          (message, processed, total) => {
            const within = total ? processed / total : 0
            this.events.progress({
              scanId: session.scanId,
              phase: 'parse',
              message: `${target.label} · ${message}`,
              percent: Math.round(((index + within) / scanTargets.length) * 100)
            })
          }
        )
        if (session.cancelRequested) break
        for (const item of scannerResult.interfaces) {
          session.scanned.set(keyOf(item.method, item.path), item)
        }
      }
      if (session.cancelRequested) {
        session.status = 'cancelled'
        this.sessions.delete(session.scanId)
        this.activeScanId = null
        this.events.cancelled({ scanId: session.scanId })
        return
      }
      const existing = await this.catalog().readAll(session.projectId)
      const existingByKey = new Map(existing.map((item) => [keyOf(item.method, item.path), item]))

      const candidates: ScanCandidate[] = []
      const comparedModules = new Set<string>()
      for (const [key, scanned] of session.scanned) {
        comparedModules.add(scanned.module || 'app')
        const current = existingByKey.get(key)
        if (!current || current.status === 'archived') {
          candidates.push({
            candidateId: `new:${key}`,
            kind: 'new',
            method: scanned.method,
            path: scanned.path,
            name: scanned.name,
            interfaceId: current?.id,
            module: scanned.module,
            parseQuality: scanned.parseQuality
          })
        } else if (current.source === 'scan') {
          const nextFingerprint = apiFingerprint({
            method: scanned.method,
            path: scanned.path,
            paramsDigest: scanned.paramsDigest
          })
          const diffs: string[] = []
          if (current.fingerprint !== nextFingerprint) diffs.push('接口定义有变化（参数或请求体）')
          if (!current.manualLayer?.name && current.name !== scanned.name) {
            diffs.push(`接口名称变化：${current.name} → ${scanned.name}`)
          }
          if (diffs.length > 0) {
            candidates.push({
              candidateId: `changed:${current.id}`,
              kind: 'changed',
              method: scanned.method,
              path: scanned.path,
              name: scanned.name,
              interfaceId: current.id,
              module: scanned.module,
              parseQuality: scanned.parseQuality,
              diff: diffs
            })
          }
        }
      }

      if (session.scope.type === 'all') {
        for (const item of existing) {
          if (item.source === 'manual' || item.status === 'archived') continue
          if (session.scanned.has(keyOf(item.method, item.path))) continue
          candidates.push({
            candidateId: `deleted:${item.id}`,
            kind: 'deleted',
            method: item.method,
            path: item.path,
            name: item.name,
            interfaceId: item.id,
            module: item.module
          })
        }
      }

      const allModules = new Set<string>()
      for (const item of existing) {
        if (item.source === 'scan') allModules.add(item.module || 'app')
      }
      for (const item of session.scanned.values()) allModules.add(item.module || 'app')
      const uncomparedModules = session.scope.type === 'all'
        ? []
        : [...allModules].filter((module) => !comparedModules.has(module))

      const counts = {
        newCount: candidates.filter((item) => item.kind === 'new').length,
        changedCount: candidates.filter((item) => item.kind === 'changed').length,
        deletedCount: candidates.filter((item) => item.kind === 'deleted').length,
        uncomparedModules
      }
      session.uncomparedModules = uncomparedModules
      session.result = {
        scanId: session.scanId,
        projectId: session.projectId,
        scope: session.scope,
        summary: counts,
        candidates
      }
      session.status = 'completed'
      this.activeScanId = null
      this.events.completed({ scanId: session.scanId, summary: counts })
    } catch (error) {
      console.error('[scan] failed', error)
      session.status = 'failed'
      this.activeScanId = null
      this.events.failed({
        scanId: session.scanId,
        error: { code: 'PARSE', message: (error as Error).message || '扫描失败。' }
      })
    }
  }

  cancel(scanId: string): { cancelled: boolean } {
    const session = this.sessions.get(scanId)
    if (!session) return { cancelled: false }
    session.cancelRequested = true
    session.worker?.postMessage({ type: 'cancel' })
    return { cancelled: true }
  }

  getResult(scanId: string): ScanResult {
    const session = this.sessions.get(scanId)
    if (!session?.result) throw new AppException('NOT_FOUND', '扫描结果已失效。')
    return session.result
  }

  async apply(scanId: string, candidateIds: string[]): Promise<{ applied: ScanSummary }> {
    const session = this.sessions.get(scanId)
    if (!session?.result) throw new AppException('NOT_FOUND', '扫描结果已失效。')
    if (session.status !== 'completed') throw new AppException('CONFLICT', '扫描尚未完成。')
    const catalog = this.catalog()
    const selected = new Set(candidateIds)
    const counts = {
      newCount: 0,
      changedCount: 0,
      deletedCount: 0,
      uncomparedModules: session.uncomparedModules
    }
    const snapshot = (await readJson<{ entries: Record<string, { apiId: string; fingerprint: string; module: string | null; packageName: string | null; lastSeenAt: string }> }>(snapshotFile(this.dataDir, session.projectId))) ?? { entries: {} }
    const timestamp = now()

    for (const candidate of session.result.candidates) {
      if (!selected.has(candidate.candidateId)) continue
      const scanned = session.scanned.get(keyOf(candidate.method, candidate.path))
      if (candidate.kind === 'deleted' && candidate.interfaceId) {
        const current = await catalog.getStored(session.projectId, candidate.interfaceId)
        current.status = 'archived'
        current.updatedAt = timestamp
        await catalog.write(session.projectId, current)
        counts.deletedCount += 1
        continue
      }
      if (!scanned) continue
      if (candidate.kind === 'new') {
        let item: StoredInterface
        if (candidate.interfaceId) {
          item = await catalog.getStored(session.projectId, candidate.interfaceId)
          item.status = 'registered'
        } else {
          item = {
            id: randomUUID(),
            projectId: session.projectId,
            method: scanned.method,
            path: scanned.path,
            name: scanned.name,
            nameSource: scanned.nameSource,
            summaryText: scanned.summary,
            controller: scanned.controller,
            module: scanned.module,
            packageName: scanned.packageName,
            status: 'registered',
            parseQuality: scanned.parseQuality,
            source: 'scan',
            fingerprint: '',
            paramsDigest: scanned.paramsDigest,
            params: scanned.params,
            body: scanned.body,
            issues: scanned.issues,
            manualLayer: null,
            firstRegisteredAt: timestamp,
            updatedAt: timestamp
          }
        }
        item.method = scanned.method
        item.path = scanned.path
        item.name = scanned.name
        item.nameSource = scanned.nameSource
        item.summaryText = scanned.summary
        item.controller = scanned.controller
        item.module = scanned.module
        item.packageName = scanned.packageName
        item.parseQuality = scanned.parseQuality
        item.params = scanned.params
        item.body = scanned.body
        item.issues = scanned.issues
        item.paramsDigest = scanned.paramsDigest
        item.fingerprint = apiFingerprint({ method: scanned.method, path: scanned.path, paramsDigest: scanned.paramsDigest })
        item.updatedAt = timestamp
        item.changeNote = undefined
        await catalog.write(session.projectId, item)
        snapshot.entries[keyOf(scanned.method, scanned.path)] = {
          apiId: item.id,
          fingerprint: item.fingerprint,
          module: item.module,
          packageName: item.packageName,
          lastSeenAt: timestamp
        }
        counts.newCount += 1
      } else if (candidate.kind === 'changed' && candidate.interfaceId) {
        const item = await catalog.getStored(session.projectId, candidate.interfaceId)
        item.name = scanned.name
        item.nameSource = scanned.nameSource
        item.summaryText = item.manualLayer?.summary || scanned.summary
        item.params = scanned.params
        item.body = scanned.body
        item.paramsDigest = scanned.paramsDigest
        item.fingerprint = apiFingerprint({ method: scanned.method, path: scanned.path, paramsDigest: scanned.paramsDigest })
        item.parseQuality = scanned.parseQuality
        item.issues = scanned.issues
        item.status = 'changed'
        item.changeNote = (candidate.diff ?? []).join('；')
        item.updatedAt = timestamp
        await catalog.write(session.projectId, item)
        snapshot.entries[keyOf(item.method, item.path)] = {
          apiId: item.id,
          fingerprint: item.fingerprint,
          module: item.module,
          packageName: item.packageName,
          lastSeenAt: timestamp
        }
        counts.changedCount += 1
      }
    }

    await writeJsonAtomic(snapshotFile(this.dataDir, session.projectId), snapshot)
    const run: ScanRunSummary = {
      id: randomUUID(),
      scope: session.scope,
      startedAt: session.startedAt,
      finishedAt: timestamp,
      status: 'success',
      summary: counts,
      parserVersion: scanEngineInfo.version
    }
    await writeJsonAtomic(lastRunFile(this.dataDir, session.projectId), run)
    await this.projects().markScanned(session.projectId, timestamp)
    this.sessions.delete(scanId)
    return { applied: counts }
  }

  async lastRun(projectId: string): Promise<ScanRunSummary | null> {
    return (await readJson<ScanRunSummary>(lastRunFile(this.dataDir, projectId))) ?? null
  }
}
