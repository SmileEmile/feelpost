import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogService, type StoredInterface } from '../../src/main/services/catalog-service'
import { ProjectService } from '../../src/main/services/project-service'

function makeInterface(overrides: Partial<StoredInterface> = {}): StoredInterface {
  const timestamp = new Date().toISOString()
  return {
    id: 'iface-1',
    projectId: 'proj-1',
    method: 'GET',
    path: '/users/{id}',
    name: 'getUser',
    summaryText: '查询用户',
    controller: 'UserController',
    module: 'user-service',
    packageName: 'com.demo.user',
    status: 'registered',
    parseQuality: 'full',
    source: 'scan',
    fingerprint: 'abc',
    paramsDigest: 'digest',
    params: {
      path: [{ location: 'path', path: 'id', name: 'id', type: 'Long', required: true, description: '' }],
      query: [],
      headers: [],
      cookies: []
    },
    body: null,
    issues: [],
    manualLayer: null,
    firstRegisteredAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

describe('CatalogService', () => {
  let root = ''
  let service: CatalogService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-catalog-'))
    await mkdir(join(root, 'projects', 'proj-1'), { recursive: true })
    service = new CatalogService(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists modules, packages and manual interfaces', async () => {
    await service.write('proj-1', makeInterface())
    await service.write('proj-1', makeInterface({ id: 'iface-2', method: 'POST', path: '/users', name: 'createUser' }))
    const manual = await service.createManual({ projectId: 'proj-1', method: 'GET', path: '/health', name: '健康检查' })
    expect(manual.source).toBe('manual')

    const tree = await service.list('proj-1')
    expect(tree.modules).toHaveLength(1)
    expect(tree.modules[0].name).toBe('user-service')
    expect(tree.modules[0].packages[0].interfaces).toHaveLength(2)
    expect(tree.manual).toHaveLength(1)
  })

  it('applies persisted package display aliases without changing package identity', async () => {
    const projects = new ProjectService(root)
    const project = await projects.create({ name: 'alias-demo' })
    await service.write(project.id, makeInterface({ projectId: project.id }))
    await projects.updatePackageAlias(project.id, 'user-service::com.demo.user', '用户服务')
    const tree = await service.list(project.id)
    expect(tree.modules[0].packages[0].name).toBe('com.demo.user')
    expect(tree.modules[0].packages[0].displayName).toBe('用户服务')
  })

  it('groups manual interfaces under a manual directory', async () => {
    const directory = await service.createDirectory({ projectId: 'proj-1', name: '内部工具', description: '手工整理' })
    const item = await service.createManual({
      projectId: 'proj-1',
      method: 'GET',
      path: '/health',
      name: '健康检查',
      directoryId: directory.id
    })
    expect(item.manualDirectoryId).toBe(directory.id)
    const tree = await service.list('proj-1')
    expect(tree.manualDirectories).toHaveLength(1)
    expect(tree.manualDirectories[0].interfaces[0].name).toBe('健康检查')
    expect(tree.manual).toHaveLength(0)
  })

  it('updates method and path from the saved request draft', async () => {
    const created = await service.createManual({ projectId: 'proj-1', method: 'GET', path: '/old', name: '旧接口' })
    const updated = await service.updateManual('proj-1', created.id, { overrides: [] }, {
      requestMethod: 'POST',
      requestUrl: '/new',
      pathParams: {},
      query: [],
      headers: [],
      cookies: [],
      bodyType: 'none',
      bodyFormat: 'json',
      bodyRaw: '',
      formRows: []
    })
    expect(updated.method).toBe('POST')
    expect(updated.path).toBe('/new')
    const tree = await service.list('proj-1')
    expect(tree.manual[0].method).toBe('POST')
    expect(tree.manual[0].path).toBe('/new')
  })

  it('moves, clones and deletes manual interfaces', async () => {
    const directory = await service.createDirectory({ projectId: 'proj-1', name: '内部工具' })
    const created = await service.createManual({ projectId: 'proj-1', method: 'GET', path: '/health', name: '健康检查' })

    const moved = await service.moveInterface({ projectId: 'proj-1', interfaceId: created.id, directoryId: directory.id })
    expect(moved.manualDirectoryId).toBe(directory.id)
    expect((await service.list('proj-1')).manualDirectories[0].interfaces).toHaveLength(1)

    const cloned = await service.cloneInterface({ projectId: 'proj-1', interfaceId: created.id })
    expect(cloned.id).not.toBe(created.id)
    expect(cloned.name).toContain('副本')
    expect(cloned.manualDirectoryId).toBe(directory.id)

    await service.deleteInterface('proj-1', created.id)
    const tree = await service.list('proj-1')
    expect(tree.manualDirectories[0].interfaces.map((item) => item.id)).toEqual([cloned.id])
  })

  it('nests manual directories and reparents children when the parent is deleted', async () => {
    const parent = await service.createDirectory({ projectId: 'proj-1', name: '外部接口' })
    const child = await service.createDirectory({ projectId: 'proj-1', name: '内部工具', parentId: parent.id })
    expect(child.parentId).toBe(parent.id)
    let tree = await service.list('proj-1')
    expect(tree.manualDirectories.find((item) => item.id === child.id)?.parentId).toBe(parent.id)

    await service.deleteDirectory('proj-1', parent.id)
    tree = await service.list('proj-1')
    expect(tree.manualDirectories).toHaveLength(1)
    expect(tree.manualDirectories[0].parentId).toBeNull()
  })

  it('moves directories and rejects cycles', async () => {
    const parent = await service.createDirectory({ projectId: 'proj-1', name: '外部接口' })
    const child = await service.createDirectory({ projectId: 'proj-1', name: '内部工具', parentId: parent.id })
    await expect(service.moveDirectory({ projectId: 'proj-1', directoryId: parent.id, parentId: child.id }))
      .rejects.toThrow()
    const moved = await service.moveDirectory({ projectId: 'proj-1', directoryId: child.id, parentId: null })
    expect(moved.parentId).toBeNull()
  })

  it('copies, edits and deletes manual directories without deleting interfaces', async () => {
    const directory = await service.createDirectory({ projectId: 'proj-1', name: '内部工具' })
    await service.createManual({
      projectId: 'proj-1',
      method: 'GET',
      path: '/health',
      name: '健康检查',
      directoryId: directory.id
    })

    const copy = await service.copyDirectory({ projectId: 'proj-1', directoryId: directory.id })
    expect(copy.name).toContain('副本')
    let tree = await service.list('proj-1')
    expect(tree.manualDirectories).toHaveLength(2)
    expect(tree.manualDirectories.find((item) => item.id === copy.id)?.interfaces).toHaveLength(1)

    const edited = await service.updateDirectory({ projectId: 'proj-1', directoryId: copy.id, name: '复制目录' })
    expect(edited.name).toBe('复制目录')

    await service.deleteDirectory('proj-1', copy.id)
    tree = await service.list('proj-1')
    expect(tree.manualDirectories).toHaveLength(1)
    expect(tree.manual).toHaveLength(1)
  })

  it('applies field overrides and keeps them after scans', async () => {
    await service.write('proj-1', makeInterface())
    const updated = await service.updateManual('proj-1', 'iface-1', {
      overrides: [{ location: 'path', key: 'id', values: { description: '人工说明', required: false } }],
      summary: '人工摘要'
    })
    expect(updated.params.path[0].description).toBe('人工说明')
    expect(updated.params.path[0].required).toBe(false)
    expect(updated.summaryText).toBe('人工摘要')

    const reread = await service.get('proj-1', 'iface-1')
    expect(reread.params.path[0].description).toBe('人工说明')
  })

  it('applies a manual interface name and exposes it in the tree', async () => {
    await service.write('proj-1', makeInterface())
    const updated = await service.updateManual('proj-1', 'iface-1', {
      overrides: [],
      name: '用户详情',
      summary: '按 ID 查询用户'
    })
    expect(updated.name).toBe('用户详情')
    expect(updated.nameOverridden).toBe(true)
    expect(updated.summaryText).toBe('按 ID 查询用户')

    const tree = await service.list('proj-1')
    const item = tree.modules[0].packages[0].interfaces[0]
    expect(item.name).toBe('用户详情')
    expect(item.nameOverridden).toBe(true)
  })

  it('persists the request draft with interface info without overwriting it later', async () => {
    await service.write('proj-1', makeInterface())
    const requestDraft = {
      pathParams: { id: '7' },
      query: [{ key: 'keyword', value: 'abc', enabled: true, description: '关键词' }],
      headers: [],
      cookies: [],
      bodyType: 'raw' as const,
      bodyFormat: 'json' as const,
      bodyRaw: '{"a":1}',
      formRows: []
    }
    const updated = await service.updateManual(
      'proj-1',
      'iface-1',
      { overrides: [], name: '用户详情', summary: '按 ID 查询' },
      requestDraft
    )
    expect(updated.requestDraft).toEqual(requestDraft)

    await service.updateManual('proj-1', 'iface-1', { overrides: [], summary: '只改说明' })
    expect((await service.get('proj-1', 'iface-1')).requestDraft).toEqual(requestDraft)
  })

  it('confirms changed interfaces and restores archived ones', async () => {
    await service.write('proj-1', makeInterface({ status: 'changed', changeNote: '参数变化' }))
    const confirmed = await service.confirmChange('proj-1', 'iface-1')
    expect(confirmed.status).toBe('registered')

    await service.write('proj-1', makeInterface({ status: 'archived' }))
    const restored = await service.restore('proj-1', 'iface-1')
    expect(restored.status).toBe('registered')
  })
})
