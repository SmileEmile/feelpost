import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../../src/main/services/project-service'

describe('ProjectService', () => {
  let root = ''
  let service: ProjectService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-test-'))
    await mkdir(join(root, 'source', 'src'), { recursive: true })
    await writeFile(join(root, 'source', 'pom.xml'), '<project/>')
    await writeFile(join(root, 'source', 'src', 'UserController.java'), 'class UserController {}')
    service = new ProjectService(join(root, 'data'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('creates a project with a default environment and reads it back', async () => {
    const created = await service.create({
      name: 'demo',
      sourceDir: join(root, 'source'),
      localEnvUrl: 'http://localhost:8081/api'
    })
    expect(created.name).toBe('demo')
    expect(created.environments).toHaveLength(1)
    expect(created.environments[0].isDefault).toBe(true)
    expect(created.environments[0].baseUrl).toBe('http://localhost:8081/api')
    expect(created.interfaceCount).toBe(0)

    const list = await service.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const fetched = await service.get(created.id)
    expect(fetched.sourceDir).toBe(join(root, 'source'))
  })

  it('records the last scan time', async () => {
    const created = await service.create({ name: 'a', sourceDir: join(root, 'source') })
    expect(created.lastScanAt).toBeNull()
    const at = '2026-11-21T02:00:00.000Z'
    await service.markScanned(created.id, at)
    expect((await service.get(created.id)).lastScanAt).toBe(at)
  })

  it('creates a project without a source directory and sets it later', async () => {
    const created = await service.create({ name: 'draft' })
    expect(created.sourceDir).toBe('')
    const updated = await service.update({
      projectId: created.id,
      patch: { sourceDir: join(root, 'source') }
    })
    expect(updated.sourceDir).toBe(join(root, 'source'))
    const cleared = await service.update({ projectId: created.id, patch: { sourceDir: '' } })
    expect(cleared.sourceDir).toBe('')
  })

  it('detects Maven modules from the root pom', async () => {
    const created = await service.create({ name: 'a', sourceDir: join(root, 'source') })
    await mkdir(join(root, 'source', 'user-service'), { recursive: true })
    await writeFile(join(root, 'source', 'pom.xml'), '<project><modules><module>user-service</module></modules></project>')
    expect(await service.listModules(created.id)).toEqual([{ name: 'user-service', path: 'user-service' }])
  })

  it('stores project-level global params', async () => {
    const created = await service.create({ name: 'a', sourceDir: join(root, 'source') })
    const saved = await service.updateGlobals(created.id, {
      headers: [{ key: 'X-Tenant', value: 'demo', enabled: true }],
      query: [],
      cookies: [],
      body: []
    })
    expect(saved.headers[0].key).toBe('X-Tenant')
    expect((await service.getGlobals(created.id)).headers).toHaveLength(1)
  })

  it('rejects duplicate source directories', async () => {
    await service.create({ name: 'a', sourceDir: join(root, 'source') })
    await expect(service.create({ name: 'b', sourceDir: join(root, 'source') })).rejects.toThrow()
  })

  it('updates metadata and validates directories', async () => {
    const created = await service.create({ name: 'a', sourceDir: join(root, 'source') })
    const updated = await service.update({
      projectId: created.id,
      patch: { name: 'renamed', excludePatterns: ['target', 'custom'] }
    })
    expect(updated.name).toBe('renamed')
    expect(updated.excludePatterns).toEqual(['target', 'custom'])

    const check = await service.validateDirectory(join(root, 'source'))
    expect(check.valid).toBe(true)
    expect(check.hasBuildFile).toBe(true)
    expect(check.controllerCount).toBe(1)

    const missing = await service.validateDirectory(join(root, 'nope'))
    expect(missing.valid).toBe(false)
  })

  it('removes the project directory', async () => {
    const created = await service.create({ name: 'a', sourceDir: join(root, 'source') })
    await service.remove(created.id)
    expect(await service.list()).toHaveLength(0)
    await expect(service.get(created.id)).rejects.toThrow()
  })
})
