import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RequestDraft } from '../../src/shared/contract'
import { ProjectService } from '../../src/main/services/project-service'
import { CatalogService } from '../../src/main/services/catalog-service'
import { ExampleService } from '../../src/main/services/example-service'
import { CaseService } from '../../src/main/services/case-service'
import { AIContextBuilder } from '../../src/main/services/ai-context-builder'

describe('AIContextBuilder', () => {
  let root = ''
  let projectId = ''
  let envId = ''
  let interfaceId = ''
  let exampleId = ''
  let builder: AIContextBuilder
  let cases: CaseService

  const draft: RequestDraft = {
    pathParams: {},
    query: [{ key: 'token', value: 'query-secret', enabled: true }],
    headers: [{ key: 'Authorization', value: 'Bearer secret', enabled: true }],
    cookies: [{ key: 'session', value: 'cookie-secret', enabled: true }],
    bodyType: 'raw',
    bodyFormat: 'json',
    bodyRaw: JSON.stringify({ name: 'alice', profile: { age: 28 } }),
    formRows: []
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-ai-context-'))
    const projects = new ProjectService(root)
    const catalog = new CatalogService(root)
    const examples = new ExampleService(root)
    cases = new CaseService(root)
    const project = await projects.create({ name: 'AI demo', localEnvUrl: 'http://localhost:8080' })
    projectId = project.id
    envId = project.environments[0].id
    const created = await catalog.createManual({ projectId, method: 'POST', path: '/users', name: '创建用户' })
    interfaceId = created.id
    await catalog.updateManual(projectId, interfaceId, { overrides: [] }, draft)
    const example = await examples.save({
      projectId,
      interfaceId,
      name: '成功示例',
      response: {
        status: 200,
        headers: [['content-type', 'application/json'], ['set-cookie', 'session=abc']],
        bodyText: JSON.stringify({ id: 1, name: 'alice' })
      }
    })
    exampleId = example.id
    builder = new AIContextBuilder(projects, catalog, examples, cases)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('redacts credentials and produces a stable context hash', async () => {
    const first = await builder.build({ feature: 'field-descriptions', projectId, interfaceId, target: 'request' }, 'model', 'field-notes.v1')
    const second = await builder.build({ feature: 'field-descriptions', projectId, interfaceId, target: 'request' }, 'model', 'field-notes.v1')
    const payload = first.preview as { request: RequestDraft }
    expect(payload.request.headers[0].value).toBe('***')
    expect(payload.request.cookies[0].value).toBe('***')
    expect(payload.request.query[0].value).toBe('***')
    expect(first.redactions).toContain('request.headers.Authorization')
    expect(first.allowedFieldPaths).toContain('profile.age')
    expect(first.hash).toBe(second.hash)
  })

  it('uses the selected response example and redacts set-cookie', async () => {
    const context = await builder.build(
      { feature: 'field-descriptions', projectId, interfaceId, target: 'response', exampleId },
      'model',
      'field-notes.v1'
    )
    const payload = context.preview as { example: { headers: Array<[string, string]> } }
    expect(payload.example.headers.find(([key]) => key === 'set-cookie')?.[1]).toBe('***')
    expect(context.allowedFieldPaths).toEqual(expect.arrayContaining(['id', 'name']))
  })

  it('includes only the three most recent cases for case generation', async () => {
    for (let i = 0; i < 4; i += 1) {
      await cases.create({
        projectId,
        interfaceId,
        envId,
        name: `用例 ${i}`,
        tags: ['AI'],
        note: '',
        draft
      })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const context = await builder.build(
      { feature: 'cases', projectId, interfaceId, scenarios: ['normal', 'error'] },
      'model',
      'cases.v1'
    )
    const payload = context.preview as { recentCases: Array<{ name: string }> }
    expect(payload.recentCases).toHaveLength(3)
    expect(payload.recentCases[0].name).toBe('用例 3')
  })
})
