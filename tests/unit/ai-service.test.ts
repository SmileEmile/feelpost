import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AIContextInput, AICompletedPayload, AIFailedPayload } from '../../src/shared/contract'
import type { AISecretProvider, KeyStorageMode } from '../../src/main/services/ai-secret-store'
import type { AIProvider, AIProviderConfig, AIProviderMessage, AIProviderResult } from '../../src/main/services/ai-provider'
import { SettingsService } from '../../src/main/services/settings-service'
import { ProjectService } from '../../src/main/services/project-service'
import { CatalogService } from '../../src/main/services/catalog-service'
import { ExampleService } from '../../src/main/services/example-service'
import { CaseService } from '../../src/main/services/case-service'
import { AIContextBuilder } from '../../src/main/services/ai-context-builder'
import { AIService } from '../../src/main/services/ai-service'

class MemorySecrets implements AISecretProvider {
  private value = 'demo-key'
  async get(): Promise<string> { return this.value }
  async mode(): Promise<KeyStorageMode> { return 'session' }
  async set(value: string): Promise<KeyStorageMode> { this.value = value; return 'session' }
  async clear(): Promise<KeyStorageMode> { this.value = ''; return 'none' }
}

class FakeProvider implements AIProvider {
  calls = 0
  failures = 0
  async listModels(): Promise<string[]> { return ['demo', 'demo-2'] }
  content = JSON.stringify({
    schemaVersion: 1,
    fields: [{ path: 'name', description: '用户姓名', change: 'add' }]
  })
  async chat(
    _config: AIProviderConfig,
    _messages: AIProviderMessage[],
    _signal: AbortSignal,
    onDelta: (delta: string) => void
  ): Promise<AIProviderResult> {
    this.calls += 1
    if (this.failures > 0) {
      this.failures -= 1
      throw new Error('temporary network failure')
    }
    onDelta(this.content)
    return {
      content: this.content,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    }
  }
}

describe('AIService', () => {
  let root = ''
  let service: AIService
  let provider: FakeProvider
  let input: AIContextInput
  let caseId = ''
  let projectId = ''
  let interfaceId = ''
  let exampleService: ExampleService
  let completed: AICompletedPayload | null
  let failed: AIFailedPayload | null

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-ai-service-'))
    const projects = new ProjectService(root)
    const catalog = new CatalogService(root)
    const examples = new ExampleService(root)
    const cases = new CaseService(root)
    const settings = new SettingsService(root)
    await settings.update({
      ai: { enabled: true, baseUrl: 'http://127.0.0.1:11434/v1', model: 'demo', timeoutMs: 60000 }
    })
    const project = await projects.create({ name: 'AI service', localEnvUrl: 'http://localhost:8080' })
    projectId = project.id
    exampleService = examples
    const item = await catalog.createManual({ projectId: project.id, method: 'POST', path: '/users', name: '创建用户' })
    interfaceId = item.id
    await catalog.updateManual(project.id, item.id, { overrides: [] }, {
      pathParams: {},
      query: [],
      headers: [],
      cookies: [],
      bodyType: 'raw',
      bodyFormat: 'json',
      bodyRaw: '{"name":"alice"}',
      formRows: []
    })
    const createdCase = await cases.create({
      projectId: project.id,
      interfaceId: item.id,
      envId: project.environments[0].id,
      name: '缓存用例',
      draft: {
        pathParams: {},
        query: [],
        headers: [{ key: 'X-Test', value: '1', enabled: true }],
        cookies: [],
        bodyType: 'raw',
        bodyFormat: 'json',
        bodyRaw: '{"name":"alice"}',
        formRows: []
      }
    })
    caseId = createdCase.id
    input = { feature: 'field-descriptions', projectId: project.id, interfaceId: item.id, target: 'request' }
    provider = new FakeProvider()
    completed = null
    failed = null
    service = new AIService(settings, new MemorySecrets(), new AIContextBuilder(projects, catalog, examples, cases), provider, {
      stream: () => undefined,
      completed: (payload) => { completed = payload },
      failed: (payload) => { failed = payload },
      cancelled: () => undefined
    }, root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function generateAndWait(): Promise<void> {
    const preview = await service.previewContext(input)
    await service.generate({ ...input, contextHash: preview.hash })
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        if (completed || failed) {
          clearInterval(timer)
          resolve()
        }
      }, 5)
      setTimeout(() => { clearInterval(timer); reject(new Error('timeout')) }, 1000)
    })
  }

  it('generates validated field suggestions with AI metadata', async () => {
    await generateAndWait()
    expect(failed).toBeNull()
    expect(completed?.result).toMatchObject({ schemaVersion: 1 })
    expect(completed?.meta.model).toBe('demo')
    expect(completed?.meta.promptVersion).toBe('field-notes.v1')
    expect(completed?.meta.usage?.totalTokens).toBe(15)
  })

  it('reuses the persistent cache when case parameters and examples are unchanged', async () => {
    provider.content = JSON.stringify({ schemaVersion: 1, markdown: '# 用例文档', typescript: '' })
    input = { feature: 'case-doc', projectId: input.projectId, caseIds: [caseId] }
    await generateAndWait()
    expect(provider.calls).toBe(1)
    expect(completed?.meta.cached).toBeUndefined()

    completed = null
    failed = null
    await generateAndWait()
    expect(provider.calls).toBe(1)
    const cachedResult = completed as AICompletedPayload | null
    expect(cachedResult?.meta.cached).toBe(true)
    expect((cachedResult?.result as { markdown: string }).markdown).toContain('用例文档')
  })

  it('invalidates the cache when a saved response example changes', async () => {
    provider.content = JSON.stringify({ schemaVersion: 1, markdown: '# 用例文档', typescript: '' })
    input = { feature: 'case-doc', projectId, caseIds: [caseId] }
    await generateAndWait()
    expect(provider.calls).toBe(1)

    await exampleService.save({
      projectId,
      interfaceId,
      name: '变更示例',
      response: { status: 200, headers: [], bodyText: '{"changed":true}', truncated: false }
    })
    completed = null
    failed = null
    await generateAndWait()
    expect(provider.calls).toBe(2)
    const refreshed = completed as AICompletedPayload | null
    expect(refreshed?.meta.cached).toBeUndefined()
  })

  it('treats an empty 2xx test response as a successful connection', async () => {
    provider.content = ''
    const result = await service.testConnection()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(provider.calls).toBe(1)
  })

  it('retries a failed connection test once', async () => {
    provider.failures = 1
    const result = await service.testConnection()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(provider.calls).toBe(2)
  })

  it('lists models from the configured provider', async () => {
    await expect(service.listModels()).resolves.toEqual(['demo', 'demo-2'])
  })

  it('persists AI config and can reveal the session key', async () => {
    const next = await service.updateConfig({
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'demo-2',
      timeoutMs: 45000,
      apiKey: 'new-key'
    })
    expect(next.enabled).toBe(true)
    expect(next.model).toBe('demo-2')
    expect(next.hasApiKey).toBe(true)
    expect(next.keyStorageMode).toBe('session')
    expect(await service.revealApiKey()).toEqual({ apiKey: 'new-key' })
    expect((await new SettingsService(root).get()).ai.model).toBe('demo-2')
  })

  it('tests a connection without requiring AI to be enabled', async () => {
    const settings = new SettingsService(root)
    await settings.update({
      ai: { enabled: false, baseUrl: 'http://127.0.0.1:11434/v1', model: 'demo', timeoutMs: 60000 }
    })
    const result = await service.testConnection()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects a field path that was not present in context', async () => {
    provider.content = JSON.stringify({
      schemaVersion: 1,
      fields: [{ path: 'missing', description: '不存在', change: 'add' }]
    })
    await generateAndWait()
    expect(completed).toBeNull()
    expect(failed?.error.code).toBe('AI_INVALID_OUTPUT')
  })
})
