import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EnvironmentService } from '../../src/main/services/environment-service'

describe('EnvironmentService', () => {
  let root = ''
  let service: EnvironmentService
  const projectId = 'proj-1'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-env-'))
    await mkdir(join(root, 'projects', projectId), { recursive: true })
    service = new EnvironmentService(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('creates the first environment as default and keeps insertion order', async () => {
    const local = await service.create(projectId, { name: '本地', baseUrl: 'http://localhost:8080' })
    const test = await service.create(projectId, { name: '测试', baseUrl: 'https://test.example.com' })
    expect(local.isDefault).toBe(true)
    expect(test.isDefault).toBe(false)
    expect(await service.list(projectId)).toHaveLength(2)
  })

  it('updates timeout and base url, validates input', async () => {
    const env = await service.create(projectId, { name: '本地', baseUrl: 'http://localhost:8080' })
    const updated = await service.update(projectId, env.id, { timeoutMs: 45000, proxy: 'http://proxy:3128' })
    expect(updated.timeoutMs).toBe(45000)
    expect(updated.proxy).toBe('http://proxy:3128')
    await expect(service.update(projectId, env.id, { timeoutMs: 10 })).rejects.toThrow()
    await expect(service.create(projectId, { name: '本地', baseUrl: 'http://x' })).rejects.toThrow()
  })

  it('switches default and refuses to delete the last environment', async () => {
    const local = await service.create(projectId, { name: '本地', baseUrl: 'http://localhost:8080' })
    const test = await service.create(projectId, { name: '测试', baseUrl: 'https://test.example.com' })
    const list = await service.setDefault(projectId, test.id)
    expect(list.find((item) => item.id === test.id)?.isDefault).toBe(true)
    await service.remove(projectId, local.id)
    await expect(service.remove(projectId, test.id)).rejects.toThrow()
  })
})
