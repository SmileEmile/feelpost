import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  BodyDefinition,
  CatalogTree,
  HttpMethod,
  InterfaceDetail,
  InterfaceParams,
  InterfaceStatus,
  InterfaceSummary,
  ManualDirectory,
  ManualOverride,
  ParamField,
  ParseQuality,
  RequestDraft
} from '@shared/contract'
import { apiFingerprint } from '@core/rules/fingerprint'
import { confirmChange, restoreArchived } from '@core/rules/state'
import { AppException } from '../errors'
import { interfaceFile, interfacesDir, projectDir } from '../storage/paths'
import { ensureDir, readJson, writeJsonAtomic } from '../storage/json-store'
import { ProjectService } from './project-service'

export interface StoredInterface {
  id: string
  projectId: string
  method: HttpMethod
  path: string
  name: string
  nameSource?: 'annotation' | 'javadoc' | 'method'
  summaryText: string
  controller: string | null
  module: string | null
  packageName: string | null
  status: InterfaceStatus
  parseQuality: ParseQuality
  source: 'scan' | 'manual'
  fingerprint: string
  paramsDigest: string
  params: InterfaceParams
  body: BodyDefinition | null
  issues: string[]
  manualLayer: { overrides: ManualOverride[]; name?: string; summary?: string; updatedAt?: string } | null
  requestDraft?: RequestDraft
  changeNote?: string
  manualDirectoryId?: string | null
  firstRegisteredAt: string
  updatedAt: string
}

function now(): string {
  return new Date().toISOString()
}

function summaryOf(item: StoredInterface): InterfaceSummary {
  return {
    id: item.id,
    method: item.method,
    path: item.path,
    name: item.manualLayer?.name || item.name,
    status: item.status,
    parseQuality: item.parseQuality,
    source: item.source,
    module: item.module,
    packageName: item.packageName,
    nameOverridden: Boolean(item.manualLayer?.name),
    nameSource: item.nameSource ?? 'method',
    manualDirectoryId: item.manualDirectoryId ?? null
  }
}

function applyOverride(field: ParamField, overrides: ManualOverride[], location: ParamField['location']): ParamField {
  const override = overrides.find((item) => item.location === location && item.key === field.path)
  if (!override) return field
  return {
    ...field,
    type: override.values.type ?? field.type,
    required: override.values.required ?? field.required,
    description: override.values.description ?? field.description,
    name: override.values.name ?? field.name
  }
}

function mergeParams(params: InterfaceParams, overrides: ManualOverride[]): InterfaceParams {
  return {
    path: params.path.map((field) => applyOverride(field, overrides, 'path')),
    query: params.query.map((field) => applyOverride(field, overrides, 'query')),
    headers: params.headers.map((field) => applyOverride(field, overrides, 'header')),
    cookies: params.cookies.map((field) => applyOverride(field, overrides, 'cookie'))
  }
}

function mergeBody(body: BodyDefinition | null, overrides: ManualOverride[]): BodyDefinition | null {
  if (!body) return null
  return { ...body, fields: body.fields.map((field) => applyOverride(field, overrides, 'body')) }
}

export class CatalogService {
  constructor(private readonly dataDir: string) {}

  private directoriesFile(projectId: string): string {
    return join(projectDir(this.dataDir, projectId), 'manual-directories.json')
  }

  async listDirectories(projectId: string): Promise<ManualDirectory[]> {
    return (await readJson<ManualDirectory[]>(this.directoriesFile(projectId))) ?? []
  }

  async createDirectory(input: { projectId: string; name: string; description?: string; parentId?: string | null }): Promise<ManualDirectory> {
    const name = input.name?.trim()
    if (!name) throw new AppException('VALIDATION', '目录名称不能为空。')
    const directories = await this.listDirectories(input.projectId)
    const parentId = input.parentId?.trim() || null
    if (parentId && !directories.some((item) => item.id === parentId)) {
      throw new AppException('NOT_FOUND', '上级目录不存在。')
    }
    if (directories.some((item) => item.name === name && (item.parentId ?? null) === parentId)) {
      throw new AppException('CONFLICT', '同级目录已存在同名目录。')
    }
    const directory: ManualDirectory = {
      id: randomUUID(),
      name,
      description: input.description?.trim() ?? '',
      parentId,
      createdAt: now()
    }
    directories.push(directory)
    await writeJsonAtomic(this.directoriesFile(input.projectId), directories)
    return directory
  }

  async updateDirectory(input: { projectId: string; directoryId: string; name?: string; description?: string }): Promise<ManualDirectory> {
    const directories = await this.listDirectories(input.projectId)
    const directory = directories.find((item) => item.id === input.directoryId)
    if (!directory) throw new AppException('NOT_FOUND', '目录不存在。')
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new AppException('VALIDATION', '目录名称不能为空。')
      if (directories.some((item) => item.id !== directory.id && item.name === name && (item.parentId ?? null) === (directory.parentId ?? null))) {
        throw new AppException('CONFLICT', '同级目录已存在同名目录。')
      }
      directory.name = name
    }
    if (input.description !== undefined) directory.description = input.description.trim()
    await writeJsonAtomic(this.directoriesFile(input.projectId), directories)
    return directory
  }

  async moveDirectory(input: { projectId: string; directoryId: string; parentId?: string | null }): Promise<ManualDirectory> {
    const directories = await this.listDirectories(input.projectId)
    const directory = directories.find((item) => item.id === input.directoryId)
    if (!directory) throw new AppException('NOT_FOUND', '目录不存在。')
    const parentId = input.parentId?.trim() || null
    if (parentId && !directories.some((item) => item.id === parentId)) {
      throw new AppException('NOT_FOUND', '目标上级目录不存在。')
    }
    const blocked = new Set<string>([directory.id])
    let changed = true
    while (changed) {
      changed = false
      for (const item of directories) {
        if (item.parentId && blocked.has(item.parentId) && !blocked.has(item.id)) {
          blocked.add(item.id)
          changed = true
        }
      }
    }
    if (parentId && blocked.has(parentId)) throw new AppException('VALIDATION', '不能移动到自身或其子目录下。')
    if (directories.some((item) => item.id !== directory.id && item.name === directory.name && (item.parentId ?? null) === parentId)) {
      throw new AppException('CONFLICT', '目标目录下已存在同名目录。')
    }
    directory.parentId = parentId
    await writeJsonAtomic(this.directoriesFile(input.projectId), directories)
    return directory
  }

  async deleteDirectory(projectId: string, directoryId: string): Promise<void> {
    const directories = await this.listDirectories(projectId)
    const target = directories.find((item) => item.id === directoryId)
    if (!target) throw new AppException('NOT_FOUND', '目录不存在。')
    const parentId = target.parentId ?? null
    const nextDirectories = directories
      .filter((item) => item.id !== directoryId)
      .map((item) => item.parentId === directoryId ? { ...item, parentId } : item)
    await writeJsonAtomic(this.directoriesFile(projectId), nextDirectories)
    const items = await this.readAll(projectId)
    const timestamp = now()
    for (const item of items) {
      if (item.manualDirectoryId !== directoryId) continue
      item.manualDirectoryId = null
      item.updatedAt = timestamp
      await this.write(projectId, item)
    }
  }

  async copyDirectory(input: { projectId: string; directoryId: string; name?: string }): Promise<ManualDirectory> {
    const directories = await this.listDirectories(input.projectId)
    const source = directories.find((item) => item.id === input.directoryId)
    if (!source) throw new AppException('NOT_FOUND', '目录不存在。')
    let name = input.name?.trim() || `${source.name} 副本`
    let suffix = 2
    while (directories.some((item) => item.name === name)) {
      name = `${input.name?.trim() || `${source.name} 副本`} ${suffix}`
      suffix += 1
    }
    const timestamp = now()
    const directory: ManualDirectory = {
      id: randomUUID(),
      name,
      description: source.description,
      createdAt: timestamp
    }
    directories.push(directory)
    await writeJsonAtomic(this.directoriesFile(input.projectId), directories)

    const items = (await this.readAll(input.projectId)).filter((item) => item.manualDirectoryId === source.id)
    for (const item of items) {
      const copy: StoredInterface = {
        ...item,
        id: randomUUID(),
        manualDirectoryId: directory.id,
        manualLayer: item.manualLayer ? JSON.parse(JSON.stringify(item.manualLayer)) as StoredInterface['manualLayer'] : null,
        requestDraft: item.requestDraft ? JSON.parse(JSON.stringify(item.requestDraft)) as StoredInterface['requestDraft'] : undefined,
        firstRegisteredAt: timestamp,
        updatedAt: timestamp
      }
      await this.write(input.projectId, copy)
    }
    return directory
  }

  async moveInterface(input: { projectId: string; interfaceId: string; directoryId?: string | null }): Promise<InterfaceDetail> {
    const item = await this.getStored(input.projectId, input.interfaceId)
    if (item.source !== 'manual') throw new AppException('UNSUPPORTED', '仅手工接口支持移动到目录。')
    if (input.directoryId) {
      const directories = await this.listDirectories(input.projectId)
      if (!directories.some((directory) => directory.id === input.directoryId)) {
        throw new AppException('NOT_FOUND', '目录不存在。')
      }
    }
    item.manualDirectoryId = input.directoryId ?? null
    item.updatedAt = now()
    await this.write(input.projectId, item)
    return this.get(input.projectId, item.id)
  }

  async cloneInterface(input: { projectId: string; interfaceId: string }): Promise<InterfaceDetail> {
    const source = await this.getStored(input.projectId, input.interfaceId)
    const timestamp = now()
    const copy: StoredInterface = {
      ...source,
      id: randomUUID(),
      name: `${source.manualLayer?.name || source.name} 副本`,
      source: 'manual',
      controller: null,
      module: null,
      packageName: null,
      status: 'registered',
      manualLayer: source.manualLayer ? JSON.parse(JSON.stringify(source.manualLayer)) as StoredInterface['manualLayer'] : null,
      requestDraft: source.requestDraft ? JSON.parse(JSON.stringify(source.requestDraft)) as StoredInterface['requestDraft'] : undefined,
      manualDirectoryId: source.manualDirectoryId ?? null,
      firstRegisteredAt: timestamp,
      updatedAt: timestamp
    }
    await this.write(input.projectId, copy)
    return this.get(input.projectId, copy.id)
  }

  async deleteInterface(projectId: string, interfaceId: string): Promise<void> {
    await this.getStored(projectId, interfaceId)
    await fs.unlink(interfaceFile(this.dataDir, projectId, interfaceId))
  }

  async readAll(projectId: string): Promise<StoredInterface[]> {
    const dir = interfacesDir(this.dataDir, projectId)
    let names: string[] = []
    try {
      names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'))
    } catch {
      return []
    }
    const items: StoredInterface[] = []
    for (const name of names) {
      const item = await readJson<StoredInterface>(join(dir, name))
      if (item) items.push(item)
    }
    return items
  }

  async getStored(projectId: string, interfaceId: string): Promise<StoredInterface> {
    const item = await readJson<StoredInterface>(interfaceFile(this.dataDir, projectId, interfaceId))
    if (!item) throw new AppException('NOT_FOUND', '接口不存在。')
    return item
  }

  async write(projectId: string, item: StoredInterface): Promise<void> {
    await ensureDir(interfacesDir(this.dataDir, projectId))
    await writeJsonAtomic(interfaceFile(this.dataDir, projectId, item.id), item)
  }

  async list(projectId: string): Promise<CatalogTree> {
    const items = await this.readAll(projectId)
    const directories = await this.listDirectories(projectId)
    let packageAliases: Record<string, string> = {}
    try {
      packageAliases = (await new ProjectService(this.dataDir).get(projectId)).packageAliases ?? {}
    } catch {
      // Catalog tests and stale partial projects may not have project.json yet.
    }
    const modules = new Map<string, Map<string, InterfaceSummary[]>>()
    const manual: InterfaceSummary[] = []
    const manualByDirectory = new Map<string, InterfaceSummary[]>()
    for (const item of items) {
      if (item.source === 'manual') {
        if (item.manualDirectoryId && directories.some((directory) => directory.id === item.manualDirectoryId)) {
          const list = manualByDirectory.get(item.manualDirectoryId) ?? []
          list.push(summaryOf(item))
          manualByDirectory.set(item.manualDirectoryId, list)
        } else {
          manual.push(summaryOf(item))
        }
        continue
      }
      const moduleName = item.module || 'app'
      const packageName = item.packageName || '未分组'
      if (!modules.has(moduleName)) modules.set(moduleName, new Map())
      const packages = modules.get(moduleName) as Map<string, InterfaceSummary[]>
      if (!packages.has(packageName)) packages.set(packageName, [])
      ;(packages.get(packageName) as InterfaceSummary[]).push(summaryOf(item))
    }
    const result: CatalogTree = {
      modules: [],
      manual: manual.sort((a, b) => a.path.localeCompare(b.path)),
      manualDirectories: directories.map((directory) => ({
        ...directory,
        interfaces: (manualByDirectory.get(directory.id) ?? []).sort((a, b) => a.path.localeCompare(b.path))
      }))
    }
    for (const [name, packages] of [...modules.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const packageList = [...packages.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([packageName, list]) => ({
          name: packageName,
          displayName: packageAliases[`${name}::${packageName}`] || undefined,
          interfaces: list.sort((a, b) => a.path.localeCompare(b.path))
        }))
      result.modules.push({
        name,
        packages: packageList,
        interfaceCount: packageList.reduce((count, item) => count + item.interfaces.length, 0)
      })
    }
    return result
  }

  async get(projectId: string, interfaceId: string): Promise<InterfaceDetail> {
    const item = await this.getStored(projectId, interfaceId)
    const overrides = item.manualLayer?.overrides ?? []
    return {
      ...summaryOf(item),
      summaryText: item.manualLayer?.summary || item.summaryText,
      controller: item.controller,
      params: mergeParams(item.params, overrides),
      body: mergeBody(item.body, overrides),
      issues: item.issues,
      manualLayer: item.manualLayer,
      requestDraft: item.requestDraft,
      changeNote: item.changeNote
    }
  }

  async updateManual(
    projectId: string,
    interfaceId: string,
    manualLayer: { overrides: ManualOverride[]; name?: string; summary?: string },
    requestDraft?: RequestDraft
  ): Promise<InterfaceDetail> {
    const item = await this.getStored(projectId, interfaceId)
    item.manualLayer = {
      overrides: manualLayer.overrides ?? [],
      name: manualLayer.name?.trim() || undefined,
      summary: manualLayer.summary,
      updatedAt: now()
    }
    if (requestDraft !== undefined) {
      item.requestDraft = requestDraft
      const nextMethod = requestDraft.requestMethod ?? item.method
      const rawPath = requestDraft.requestUrl?.trim()
      const nextPath = rawPath
        ? (/^https?:\/\//i.test(rawPath) ? rawPath : rawPath.startsWith('/') ? rawPath : `/${rawPath}`)
        : item.path
      if (nextMethod !== item.method || nextPath !== item.path) {
        const all = await this.readAll(projectId)
        if (all.some((other) => other.id !== item.id && other.method === nextMethod && other.path === nextPath)) {
          throw new AppException('CONFLICT', '同方法同路径的接口已存在。')
        }
        item.method = nextMethod
        item.path = nextPath
      }
    }
    item.updatedAt = now()
    await this.write(projectId, item)
    return this.get(projectId, interfaceId)
  }

  async confirmChange(projectId: string, interfaceId: string): Promise<InterfaceSummary> {
    const item = await this.getStored(projectId, interfaceId)
    item.status = confirmChange(item.status)
    item.changeNote = undefined
    item.updatedAt = now()
    await this.write(projectId, item)
    return summaryOf(item)
  }

  async restore(projectId: string, interfaceId: string): Promise<InterfaceSummary> {
    const item = await this.getStored(projectId, interfaceId)
    item.status = restoreArchived(item.status)
    item.updatedAt = now()
    await this.write(projectId, item)
    return summaryOf(item)
  }

  async createManual(input: {
    projectId: string
    method: HttpMethod
    path: string
    name: string
    summary?: string
    directoryId?: string
  }): Promise<InterfaceDetail> {
    const rawPath = input.path.trim()
    const path = /^https?:\/\//i.test(rawPath)
      ? rawPath
      : rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    if (input.directoryId) {
      const directories = await this.listDirectories(input.projectId)
      if (!directories.some((directory) => directory.id === input.directoryId)) {
        throw new AppException('NOT_FOUND', '目录不存在。')
      }
    }
    const existing = await this.readAll(input.projectId)
    if (existing.some((item) => item.method === input.method && item.path === path)) {
      throw new AppException('CONFLICT', '同方法同路径的接口已存在。')
    }
    const timestamp = now()
    const item: StoredInterface = {
      id: randomUUID(),
      projectId: input.projectId,
      method: input.method,
      path,
      name: input.name,
      summaryText: input.summary || '',
      controller: null,
      module: null,
      packageName: null,
      status: 'registered',
      parseQuality: 'full',
      source: 'manual',
      fingerprint: apiFingerprint({ method: input.method, path, paramsDigest: '' }),
      paramsDigest: '',
      params: { path: [], query: [], headers: [], cookies: [] },
      body: null,
      issues: [],
      manualLayer: null,
      manualDirectoryId: input.directoryId ?? null,
      firstRegisteredAt: timestamp,
      updatedAt: timestamp
    }
    await this.write(input.projectId, item)
    return this.get(input.projectId, item.id)
  }
}
