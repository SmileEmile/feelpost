import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Environment, EnvironmentInput } from '@shared/contract'
import { AppException } from '../errors'
import { projectDir } from '../storage/paths'
import { readJson, writeJsonAtomic } from '../storage/json-store'

const EMPTY_PARAMS = { headers: [], query: [], cookies: [], body: [] }

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim()
  if (!value) throw new AppException('VALIDATION', '前置 URL 不能为空。')
  const normalized = /^https?:\/\//i.test(value) ? value : `http://${value}`
  try {
    const url = new URL(normalized)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
  } catch {
    throw new AppException('VALIDATION', '前置 URL 不合法，请使用 http:// 或 https:// 开头的地址。')
  }
  return normalized
}

export class EnvironmentService {
  constructor(private readonly dataDir: string) {}

  private file(projectId: string): string {
    return join(projectDir(this.dataDir, projectId), 'environments.json')
  }

  async list(projectId: string): Promise<Environment[]> {
    return (await readJson<Environment[]>(this.file(projectId))) ?? []
  }

  private async save(projectId: string, list: Environment[]): Promise<void> {
    await writeJsonAtomic(this.file(projectId), list)
  }

  async create(projectId: string, input: EnvironmentInput): Promise<Environment> {
    const name = input.name?.trim()
    if (!name) throw new AppException('VALIDATION', '环境名称不能为空。')
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const list = await this.list(projectId)
    if (list.some((env) => env.name === name)) throw new AppException('CONFLICT', '同名环境已存在。')
    const env: Environment = {
      id: randomUUID(),
      name,
      baseUrl,
      params: { ...EMPTY_PARAMS },
      verifyTls: true,
      proxy: '',
      noProxy: [],
      timeoutMs: input.timeoutMs ?? 30000,
      isDefault: list.length === 0
    }
    list.push(env)
    await this.save(projectId, list)
    return env
  }

  async update(projectId: string, envId: string, patch: Partial<Environment>): Promise<Environment> {
    const list = await this.list(projectId)
    const env = list.find((item) => item.id === envId)
    if (!env) throw new AppException('NOT_FOUND', '环境不存在。')
    if (patch.baseUrl !== undefined) {
      patch = { ...patch, baseUrl: normalizeBaseUrl(patch.baseUrl) }
    }
    if (patch.timeoutMs !== undefined && (!Number.isFinite(patch.timeoutMs) || patch.timeoutMs < 1000)) {
      throw new AppException('VALIDATION', '超时时间需大于 1000ms。')
    }
    Object.assign(env, patch, { id: env.id, isDefault: env.isDefault })
    if (patch.isDefault) {
      list.forEach((item) => {
        item.isDefault = item.id === env.id
      })
    }
    await this.save(projectId, list)
    return env
  }

  async remove(projectId: string, envId: string): Promise<void> {
    const list = await this.list(projectId)
    if (list.length <= 1) throw new AppException('CONFLICT', '项目至少保留一个环境。')
    const target = list.find((item) => item.id === envId)
    if (!target) throw new AppException('NOT_FOUND', '环境不存在。')
    const next = list.filter((item) => item.id !== envId)
    if (target.isDefault && next.length > 0) next[0].isDefault = true
    await this.save(projectId, next)
  }

  async setDefault(projectId: string, envId: string): Promise<Environment[]> {
    const list = await this.list(projectId)
    if (!list.some((item) => item.id === envId)) throw new AppException('NOT_FOUND', '环境不存在。')
    list.forEach((item) => {
      item.isDefault = item.id === envId
    })
    await this.save(projectId, list)
    return list
  }
}
