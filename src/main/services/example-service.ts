import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AIMeta, ResponseExample } from '@shared/contract'
import { AppException } from '../errors'
import { exampleFile, examplesDir } from '../storage/paths'
import { ensureDir, readJson, writeJsonAtomic } from '../storage/json-store'

interface StoredExample extends ResponseExample {}

export class ExampleService {
  constructor(private readonly dataDir: string) {}

  async list(projectId: string, interfaceId: string): Promise<ResponseExample[]> {
    let names: string[] = []
    try {
      names = (await fs.readdir(examplesDir(this.dataDir, projectId))).filter((name) => name.endsWith('.json'))
    } catch {
      return []
    }
    const list: ResponseExample[] = []
    for (const name of names) {
      const item = await readJson<StoredExample>(join(examplesDir(this.dataDir, projectId), name))
      if (item && item.apiId === interfaceId) list.push(item)
    }
    return list.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  async save(input: {
    projectId: string
    interfaceId: string
    name: string
    response: { status: number; statusText?: string; headers: Array<[string, string]>; bodyText: string; truncated?: boolean }
    sourceCaseId?: string
  }): Promise<ResponseExample> {
    const name = input.name?.trim()
    if (!name) throw new AppException('VALIDATION', '示例名称不能为空。')
    const success = input.response.status < 400
    const existing = await this.list(input.projectId, input.interfaceId)
    for (const item of existing) {
      if ((item.status < 400) === success) {
        await fs.unlink(exampleFile(this.dataDir, input.projectId, item.id))
      }
    }
    const example: StoredExample = {
      id: randomUUID(),
      projectId: input.projectId,
      apiId: input.interfaceId,
      name,
      status: input.response.status,
      headers: input.response.headers,
      body: input.response.bodyText,
      truncated: Boolean(input.response.truncated),
      sourceCaseId: input.sourceCaseId,
      savedAt: new Date().toISOString()
    }
    await ensureDir(examplesDir(this.dataDir, input.projectId))
    await writeJsonAtomic(exampleFile(this.dataDir, input.projectId, example.id), example)
    return example
  }

  async update(projectId: string, exampleId: string, name: string): Promise<ResponseExample> {
    const item = await readJson<StoredExample>(exampleFile(this.dataDir, projectId, exampleId))
    if (!item) throw new AppException('NOT_FOUND', '响应示例不存在。')
    const next = name?.trim()
    if (!next) throw new AppException('VALIDATION', '示例名称不能为空。')
    item.name = next
    await writeJsonAtomic(exampleFile(this.dataDir, projectId, exampleId), item)
    return item
  }

  async updateFields(
    projectId: string,
    exampleId: string,
    descriptions: Record<string, string>,
    fieldDescriptionMeta?: Record<string, AIMeta>
  ): Promise<ResponseExample> {
    const item = await readJson<StoredExample>(exampleFile(this.dataDir, projectId, exampleId))
    if (!item) throw new AppException('NOT_FOUND', '响应示例不存在。')
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(descriptions)) {
      if (typeof value === 'string' && key.trim() && value.trim()) cleaned[key.trim()] = value.trim()
    }
    item.fieldDescriptions = cleaned
    if (fieldDescriptionMeta !== undefined) {
      const meta: Record<string, AIMeta> = {}
      for (const [key, value] of Object.entries(fieldDescriptionMeta)) {
        if (key.trim() && value) meta[key.trim()] = value
      }
      item.fieldDescriptionMeta = Object.keys(meta).length ? meta : undefined
    }
    await writeJsonAtomic(exampleFile(this.dataDir, projectId, exampleId), item)
    return item
  }

  async remove(projectId: string, exampleId: string): Promise<void> {
    const item = await readJson<StoredExample>(exampleFile(this.dataDir, projectId, exampleId))
    if (!item) throw new AppException('NOT_FOUND', '响应示例不存在。')
    await fs.unlink(exampleFile(this.dataDir, projectId, exampleId))
  }
}
