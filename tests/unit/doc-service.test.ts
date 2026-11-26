import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../../src/main/services/project-service'
import { CatalogService } from '../../src/main/services/catalog-service'
import { CaseService } from '../../src/main/services/case-service'
import { ExampleService } from '../../src/main/services/example-service'
import { DocService } from '../../src/main/services/doc-service'
import type { RequestDraft } from '../../src/shared/contract'

describe('DocService', () => {
  let root = ''
  let projectId = ''
  let envId = ''
  let interfaceId = ''
  let docs: DocService
  let catalogService: CatalogService
  let caseAId = ''

  const draft: RequestDraft = {
    pathParams: { id: '7' },
    query: [{ key: 'page', value: '1', enabled: true, description: '页码' }],
    headers: [{ key: 'X-Tenant', value: 'demo', enabled: true }],
    cookies: [],
    bodyType: 'raw',
    bodyFormat: 'json',
    bodyRaw: '{"name":"alice"}',
    formRows: []
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-doc-'))
    await mkdir(join(root, 'source', 'src'), { recursive: true })
    await writeFile(join(root, 'source', 'pom.xml'), '<project/>')
    const dataDir = join(root, 'data')
    const projects = new ProjectService(dataDir)
    const project = await projects.create({
      name: 'demo',
      sourceDir: join(root, 'source'),
      localEnvUrl: 'http://localhost:8080'
    })
    projectId = project.id
    envId = project.environments[0].id
    const catalog = new CatalogService(dataDir)
    catalogService = catalog
    interfaceId = (await catalog.createManual({ projectId, method: 'POST', path: '/user/{id}', name: '保存用户' })).id
    const stored = await catalog.getStored(projectId, interfaceId)
    stored.body = {
      type: 'json',
      fields: [{ location: 'body', path: 'name', name: 'name', type: 'String', required: true, description: '用户名称' }]
    }
    await catalog.write(projectId, stored)
    const exampleService = new ExampleService(dataDir)
    const successExample = await exampleService.save({
      projectId,
      interfaceId,
      name: '成功示例',
      response: { status: 200, headers: [], bodyText: '{"ok":true}', truncated: false }
    })
    await exampleService.updateFields(projectId, successExample.id, { ok: '成功标记' })
    const cases = new CaseService(dataDir)
    const caseA = await cases.create({ projectId, interfaceId, envId, name: 'A 用例', tags: ['A'], draft })
    caseAId = caseA.id
    await cases.create({ projectId, interfaceId, envId, name: 'B 用例', tags: ['B'], draft })
    docs = new DocService(dataDir)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('builds the six-block interface markdown', async () => {
    const doc = await docs.buildInterface(projectId, interfaceId, envId)
    expect(doc.fileName.endsWith('.md')).toBe(true)
    for (const title of ['## 1. 接口清单', '## 2. 方法 + URL', '## 3. 参数表', '## 4. 请求示例', '## 5. 响应示例', '## 6. 字段说明']) {
      expect(doc.markdown).toContain(title)
    }
    expect(doc.markdown).toContain('# 保存用户')
    expect(doc.markdown).toContain('POST /user/{id}')
    expect(doc.markdown).toContain('成功示例')
    expect(doc.markdown).toContain('http://localhost:8080')
  })

  it('exports only cases matching selected tags', async () => {
    const doc = await docs.buildCases(projectId, ['A'])
    expect(doc.markdown).toContain('A 用例')
    expect(doc.markdown).not.toContain('B 用例')
    expect(doc.markdown).toContain('# 用例汇总 · demo')
  })

  it('builds a project document grouped by interface with manual interfaces', async () => {
    const doc = await docs.buildProject(projectId, 'active', true, envId)
    expect(doc.markdown).toContain('# demo 接口文档')
    expect(doc.markdown).toContain('## 环境与全局参数')
    expect(doc.markdown).toContain('## 保存用户')
    expect(doc.markdown).toContain('### 参数表')
    expect(doc.markdown).toContain('### 请求示例')
    expect(doc.markdown).toContain('### 响应示例')
    expect(doc.markdown).not.toContain('### 字段说明')
    expect(doc.markdown).not.toContain('## 1. 接口清单')
    expect(doc.markdown).toContain('成功示例')
    expect(doc.markdown).toContain('成功标记')

    const withoutManual = await docs.buildProject(projectId, 'active', false, envId)
    expect(withoutManual.markdown).toContain('没有接口')
  })

  it('filters project documents by name, method, path and status', async () => {
    const matched = await docs.buildProject(projectId, 'active', true, envId, { name: '保存' })
    expect(matched.markdown).toContain('保存用户')
    expect(matched.markdown).not.toContain('没有接口')

    const none = await docs.buildProject(projectId, 'active', true, envId, { method: 'GET' })
    expect(none.markdown).toContain('没有接口')
  })

  it('returns project document pages without repeating the project header', async () => {
    for (let i = 0; i < 12; i += 1) {
      await catalogService.createManual({
        projectId,
        method: 'GET',
        path: `/page/${i}`,
        name: `分页接口 ${i}`
      })
    }
    const first = await docs.buildProject(projectId, 'active', true, envId, undefined, { limit: 10, offset: 0 })
    expect(first.total).toBe(13)
    expect(first.hasMore).toBe(true)
    expect(first.offset).toBe(0)
    expect(first.markdown).toContain('# demo 接口文档')

    const second = await docs.buildProject(projectId, 'active', true, envId, undefined, { limit: 10, offset: 10 })
    expect(second.hasMore).toBe(false)
    expect(second.nextOffset).toBe(13)
    expect(second.markdown).not.toContain('# demo 接口文档')
    expect(second.markdown).toContain('分页接口')
  })

  it('does not prefix an environment URL for absolute interface paths', async () => {
    const absolute = await catalogService.createManual({
      projectId,
      method: 'GET',
      path: 'https://example.com/direct',
      name: '绝对地址接口'
    })
    expect(absolute.path).toBe('https://example.com/direct')
    const doc = await docs.buildInterface(projectId, absolute.id, envId)
    expect(doc.markdown).toContain('https://example.com/direct')
    expect(doc.markdown).not.toContain('http://localhost:8080/https://example.com/direct')
  })

  it('builds a markdown file for a single case', async () => {
    const doc = await docs.buildCase(projectId, caseAId)
    expect(doc.markdown).toContain('# A 用例')
    expect(doc.markdown).toContain('### 请求参数')
    expect(doc.markdown).toContain('用户名称')
    expect(doc.markdown).toContain('成功示例')
    expect(doc.markdown).toContain('成功标记')
    expect(doc.markdown).toContain('A 用例')
    expect(doc.fileName).toContain('A 用例')
  })
})
