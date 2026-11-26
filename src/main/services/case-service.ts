import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  CaseAIMeta,
  CaseDetail,
  CaseRequestSnapshot,
  CaseSummary,
  CreateCaseInput,
  Environment,
  HttpMethod,
  InterfaceStatus,
  RequestDraft,
  UpdateCaseInput
} from '@shared/contract'
import { AppException } from '../errors'
import { caseFile, casesDir } from '../storage/paths'
import { ensureDir, readJson, writeJsonAtomic } from '../storage/json-store'
import { ProjectService } from './project-service'
import { CatalogService, type StoredInterface } from './catalog-service'

interface StoredCase {
  id: string
  projectId: string
  apiId: string
  interfaceName: string
  interfaceFingerprint: string
  name: string
  tags: string[]
  note: string
  envId: string
  envName: string
  baseUrl: string
  method: HttpMethod
  path: string
  requestSnapshot: CaseRequestSnapshot
  aiMeta?: CaseAIMeta
  savedAt: string
  updatedAt: string
}

function now(): string {
  return new Date().toISOString()
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return []
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
}

function requestTarget(item: StoredInterface, draft: RequestDraft): { method: StoredInterface['method']; path: string } {
  return {
    method: draft.requestMethod ?? item.method,
    path: draft.requestUrl?.trim() || item.path
  }
}

function snapshotOf(item: StoredInterface, env: Environment, draft: RequestDraft): CaseRequestSnapshot {
  const target = requestTarget(item, draft)
  return {
    ...draft,
    method: target.method,
    path: target.path,
    baseUrl: env.baseUrl,
    envName: env.name
  }
}

export class CaseService {
  private readonly projects: ProjectService
  private readonly catalog: CatalogService

  constructor(private readonly dataDir: string) {
    this.projects = new ProjectService(dataDir)
    this.catalog = new CatalogService(dataDir)
  }

  private async readStored(projectId: string, caseId: string): Promise<StoredCase> {
    const item = await readJson<StoredCase>(caseFile(this.dataDir, projectId, caseId))
    if (!item) throw new AppException('NOT_FOUND', '用例不存在或已被删除。')
    return item
  }

  private async currentInterface(projectId: string, apiId: string): Promise<StoredInterface | null> {
    try {
      return await this.catalog.getStored(projectId, apiId)
    } catch {
      return null
    }
  }

  private summarize(stored: StoredCase, current: StoredInterface | null, environments: Environment[]): CaseSummary {
    return {
      id: stored.id,
      name: stored.name,
      apiId: stored.apiId,
      method: stored.method,
      path: stored.path,
      interfaceName: stored.interfaceName,
      envId: stored.envId,
      envName: stored.envName,
      tags: stored.tags,
      savedAt: stored.savedAt,
      updatedAt: stored.updatedAt,
      interfaceExists: current !== null,
      interfaceChanged: current !== null && current.fingerprint !== stored.interfaceFingerprint,
      interfaceStatus: (current?.status ?? null) as InterfaceStatus | null,
      envExists: environments.some((env) => env.id === stored.envId),
      aiMeta: stored.aiMeta
    }
  }

  async list(projectId: string, filter?: { tag?: string; keyword?: string }): Promise<CaseSummary[]> {
    const project = await this.projects.get(projectId)
    let names: string[] = []
    try {
      names = (await fs.readdir(casesDir(this.dataDir, projectId))).filter((name) => name.endsWith('.json'))
    } catch {
      return []
    }
    const summaries: CaseSummary[] = []
    for (const name of names) {
      const stored = await readJson<StoredCase>(join(casesDir(this.dataDir, projectId), name))
      if (!stored) continue
      const current = await this.currentInterface(projectId, stored.apiId)
      summaries.push(this.summarize(stored, current, project.environments))
    }
    const keyword = filter?.keyword?.trim().toLowerCase()
    return summaries
      .filter((item) => {
        if (filter?.tag && !item.tags.includes(filter.tag)) return false
        if (!keyword) return true
        return `${item.name} ${item.interfaceName} ${item.method} ${item.path} ${item.tags.join(' ')}`.toLowerCase().includes(keyword)
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(projectId: string, caseId: string): Promise<CaseDetail> {
    const stored = await this.readStored(projectId, caseId)
    const project = await this.projects.get(projectId)
    const current = await this.currentInterface(projectId, stored.apiId)
    return {
      ...this.summarize(stored, current, project.environments),
      note: stored.note,
      baseUrl: stored.baseUrl,
      requestSnapshot: stored.requestSnapshot
    }
  }

  async create(input: CreateCaseInput): Promise<CaseDetail> {
    const name = input.name?.trim()
    if (!name) throw new AppException('VALIDATION', '用例名称不能为空。')
    const project = await this.projects.get(input.projectId)
    const env = project.environments.find((item) => item.id === input.envId)
    if (!env) throw new AppException('NOT_FOUND', '保存请求时使用的环境已不存在。')
    const item = await this.catalog.getStored(input.projectId, input.interfaceId)
    if (item.status === 'archived') throw new AppException('UNSUPPORTED', '归档接口不能保存用例。')

    const timestamp = now()
    const target = requestTarget(item, input.draft)
    const stored: StoredCase = {
      id: randomUUID(),
      projectId: input.projectId,
      apiId: item.id,
      interfaceName: item.manualLayer?.name || item.name,
      interfaceFingerprint: item.fingerprint,
      name,
      tags: normalizeTags(input.tags),
      note: input.note?.trim() ?? '',
      envId: env.id,
      envName: env.name,
      baseUrl: env.baseUrl,
      method: target.method,
      path: target.path,
      requestSnapshot: snapshotOf(item, env, input.draft),
      aiMeta: input.aiMeta,
      savedAt: timestamp,
      updatedAt: timestamp
    }
    await ensureDir(casesDir(this.dataDir, input.projectId))
    await writeJsonAtomic(caseFile(this.dataDir, input.projectId, stored.id), stored)
    return this.get(input.projectId, stored.id)
  }

  async update(input: UpdateCaseInput): Promise<CaseDetail> {
    const stored = await this.readStored(input.projectId, input.caseId)
    if (input.patch.name !== undefined) {
      const name = input.patch.name.trim()
      if (!name) throw new AppException('VALIDATION', '用例名称不能为空。')
      stored.name = name
    }
    if (input.patch.tags !== undefined) stored.tags = normalizeTags(input.patch.tags)
    if (input.patch.note !== undefined) stored.note = input.patch.note.trim()
    stored.updatedAt = now()
    await writeJsonAtomic(caseFile(this.dataDir, input.projectId, stored.id), stored)
    return this.get(input.projectId, stored.id)
  }

  async duplicate(projectId: string, caseId: string, name?: string): Promise<CaseDetail> {
    const source = await this.readStored(projectId, caseId)
    const timestamp = now()
    const copy: StoredCase = {
      ...source,
      id: randomUUID(),
      name: name?.trim() || `${source.name} 副本`,
      savedAt: timestamp,
      updatedAt: timestamp
    }
    await writeJsonAtomic(caseFile(this.dataDir, projectId, copy.id), copy)
    return this.get(projectId, copy.id)
  }

  async remove(projectId: string, caseId: string): Promise<void> {
    await this.readStored(projectId, caseId)
    await fs.unlink(caseFile(this.dataDir, projectId, caseId))
  }

  async removeTags(projectId: string, tags: string[]): Promise<number> {
    const targets = new Set(tags.map((tag) => tag.trim()).filter(Boolean))
    if (targets.size === 0) throw new AppException('VALIDATION', '请选择要删除的标签。')
    let names: string[] = []
    try {
      names = (await fs.readdir(casesDir(this.dataDir, projectId))).filter((name) => name.endsWith('.json'))
    } catch {
      return 0
    }
    let deleted = 0
    for (const name of names) {
      const stored = await readJson<StoredCase>(join(casesDir(this.dataDir, projectId), name))
      if (!stored) continue
      if (!stored.tags.some((tag) => targets.has(tag))) continue
      await fs.unlink(caseFile(this.dataDir, projectId, stored.id))
      deleted += 1
    }
    return deleted
  }
}
