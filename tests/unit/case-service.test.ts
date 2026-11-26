import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../../src/main/services/project-service'
import { CatalogService } from '../../src/main/services/catalog-service'
import { CaseService } from '../../src/main/services/case-service'
import type { RequestDraft } from '../../src/shared/contract'

describe('CaseService', () => {
  let root = ''
  let projectId = ''
  let envId = ''
  let interfaceId = ''
  let cases: CaseService
  let catalog: CatalogService

  const draft: RequestDraft = {
    pathParams: { id: '7' },
    query: [{ key: 'page', value: '1', enabled: true, description: '页码' }],
    headers: [{ key: 'X-Tenant', value: 'demo', enabled: true }],
    cookies: [],
    bodyType: 'raw',
    bodyFormat: 'json',
    bodyRaw: '{"a":1}',
    formRows: []
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-case-'))
    await mkdir(join(root, 'source', 'src'), { recursive: true })
    await writeFile(join(root, 'source', 'pom.xml'), '<project/>')
    await writeFile(join(root, 'source', 'src', 'Demo.java'), 'class Demo {}')
    const dataDir = join(root, 'data')
    const projects = new ProjectService(dataDir)
    const project = await projects.create({
      name: 'demo',
      sourceDir: join(root, 'source'),
      localEnvUrl: 'http://localhost:8080/api'
    })
    projectId = project.id
    envId = project.environments[0].id
    catalog = new CatalogService(dataDir)
    interfaceId = (
      await catalog.createManual({ projectId, method: 'POST', path: '/user/{id}', name: '保存用户' })
    ).id
    cases = new CaseService(dataDir)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('freezes the request snapshot and supports metadata edits/duplicate/delete', async () => {
    const created = await cases.create({
      projectId,
      interfaceId,
      envId,
      name: '查询用户',
      tags: ['冒烟', '回归'],
      note: '冻结快照',
      draft
    })
    expect(created.requestSnapshot).toMatchObject({
      method: 'POST',
      path: '/user/{id}',
      baseUrl: 'http://localhost:8080/api',
      envName: '本地',
      bodyRaw: '{"a":1}'
    })
    expect(created.tags).toEqual(['冒烟', '回归'])
    expect(created.interfaceExists).toBe(true)
    expect(created.interfaceChanged).toBe(false)

    const updated = await cases.update({
      projectId,
      caseId: created.id,
      patch: { name: '查询用户 V2', tags: ['回归'], note: '改备注' }
    })
    expect(updated.name).toBe('查询用户 V2')
    expect(updated.tags).toEqual(['回归'])

    const copy = await cases.duplicate(projectId, created.id)
    expect(copy.id).not.toBe(created.id)
    expect(copy.name).toContain('副本')
    expect(copy.requestSnapshot).toEqual(created.requestSnapshot)

    expect(await cases.list(projectId)).toHaveLength(2)
    await cases.remove(projectId, created.id)
    expect(await cases.list(projectId)).toHaveLength(1)
  })

  it('stores AI origin metadata on imported cases', async () => {
    const created = await cases.create({
      projectId,
      interfaceId,
      envId,
      name: 'AI 正常',
      tags: ['AI', '冒烟'],
      draft,
      aiMeta: {
        source: 'ai',
        provider: 'openai-compatible',
        model: 'demo',
        promptVersion: 'cases.v1',
        generatedAt: new Date().toISOString(),
        contextHash: 'hash',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        scenario: 'normal'
      }
    })
    expect(created.aiMeta?.scenario).toBe('normal')
    expect((await cases.list(projectId))[0].aiMeta?.model).toBe('demo')
  })

  it('deletes cases that contain the selected tags', async () => {
    await cases.create({ projectId, interfaceId, envId, name: 'A', tags: ['冒烟', '回归'], draft })
    await cases.create({ projectId, interfaceId, envId, name: 'B', tags: ['冒烟'], draft })
    const deleted = await cases.removeTags(projectId, ['冒烟'])
    expect(deleted).toBe(2)
    const list = await cases.list(projectId)
    expect(list).toHaveLength(0)
  })

  it('freezes request method and absolute URL overrides', async () => {
    const created = await cases.create({
      projectId,
      interfaceId,
      envId,
      name: '绝对地址用例',
      draft: { ...draft, requestMethod: 'GET', requestUrl: 'https://example.com/direct?id=7' }
    })
    expect(created.method).toBe('GET')
    expect(created.path).toBe('https://example.com/direct?id=7')
    expect(created.requestSnapshot.method).toBe('GET')
    expect(created.requestSnapshot.path).toBe('https://example.com/direct?id=7')
  })

  it('marks a case when its interface definition changes', async () => {
    await cases.create({ projectId, interfaceId, envId, name: '旧快照', draft })
    const stored = await catalog.getStored(projectId, interfaceId)
    stored.fingerprint = 'changed-fingerprint'
    await catalog.write(projectId, stored)

    const [summary] = await cases.list(projectId)
    expect(summary.interfaceChanged).toBe(true)
  })
})
