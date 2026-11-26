import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExampleService } from '../../src/main/services/example-service'

describe('ExampleService', () => {
  let root = ''
  let service: ExampleService
  const projectId = 'proj-1'
  const interfaceId = 'iface-1'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-example-'))
    service = new ExampleService(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('persists AI metadata alongside field descriptions', async () => {
    const example = await service.save({
      projectId,
      interfaceId,
      name: '字段示例',
      response: { status: 200, headers: [], bodyText: '{"name":"alice"}', truncated: false }
    })
    const meta = {
      source: 'ai' as const,
      provider: 'openai-compatible' as const,
      model: 'demo',
      promptVersion: 'field-notes.v1',
      generatedAt: new Date().toISOString(),
      contextHash: 'hash',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    }
    const updated = await service.updateFields(projectId, example.id, { name: '用户姓名' }, { name: meta })
    expect(updated.fieldDescriptions?.name).toBe('用户姓名')
    expect(updated.fieldDescriptionMeta?.name.model).toBe('demo')
  })

  it('keeps one success and one failure example per interface', async () => {
    const save = (status: number, name: string) =>
      service.save({
        projectId,
        interfaceId,
        name,
        response: { status, headers: [], bodyText: '{}', truncated: false }
      })

    await save(200, '成功示例 1')
    await save(200, '成功示例 2')
    expect(await service.list(projectId, interfaceId)).toHaveLength(1)

    await save(500, '失败示例')
    expect(await service.list(projectId, interfaceId)).toHaveLength(2)

    await save(500, '失败示例 2')
    expect(await service.list(projectId, interfaceId)).toHaveLength(2)
  })

  it('saves, lists, renames and deletes response examples', async () => {
    const saved = await service.save({
      projectId,
      interfaceId,
      name: '成功响应',
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        bodyText: '{"ok":true}',
        truncated: false
      }
    })
    expect(saved.id).toBeTruthy()

    const list = await service.list(projectId, interfaceId)
    expect(list).toHaveLength(1)
    expect(list[0].body).toBe('{"ok":true}')

    const renamed = await service.update(projectId, saved.id, '成功响应 V2')
    expect(renamed.name).toBe('成功响应 V2')

    const withFields = await service.updateFields(projectId, saved.id, { 'data.id': '用户 ID', ' ': '忽略' })
    expect(withFields.fieldDescriptions).toEqual({ 'data.id': '用户 ID' })
    expect((await service.list(projectId, interfaceId))[0].fieldDescriptions?.['data.id']).toBe('用户 ID')

    await service.remove(projectId, saved.id)
    expect(await service.list(projectId, interfaceId)).toHaveLength(0)
  })
})
