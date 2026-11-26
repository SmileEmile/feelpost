import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../../src/main/services/project-service'
import { CatalogService } from '../../src/main/services/catalog-service'
import { RequestService } from '../../src/main/services/request-service'
import type { RequestDraft } from '../../src/shared/contract'

interface Received {
  method: string
  url: string
  contentType: string
  body: string
}

function draft(overrides: Partial<RequestDraft>): RequestDraft {
  return {
    pathParams: {},
    query: [],
    headers: [],
    cookies: [],
    bodyType: 'none',
    bodyFormat: 'json',
    bodyRaw: '',
    formRows: [],
    ...overrides
  }
}

describe('RequestService body formats', () => {
  let root = ''
  let server: Server
  let received: Received
  let projectId = ''
  let envId = ''
  let interfaceId = ''
  let requests: RequestService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-request-'))
    await mkdir(join(root, 'source', 'src'), { recursive: true })
    await writeFile(join(root, 'source', 'pom.xml'), '<project/>')
    await writeFile(join(root, 'source', 'src', 'Demo.java'), 'class Demo {}')

    received = { method: '', url: '', contentType: '', body: '' }
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        received = {
          method: req.method ?? '',
          url: req.url ?? '',
          contentType: String(req.headers['content-type'] ?? ''),
          body: Buffer.concat(chunks).toString('utf8')
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const dataDir = join(root, 'data')
    const projects = new ProjectService(dataDir)
    const project = await projects.create({
      name: 'demo',
      sourceDir: join(root, 'source'),
      localEnvUrl: `127.0.0.1:${port}`
    })
    projectId = project.id
    envId = project.environments[0].id
    const catalog = new CatalogService(dataDir)
    interfaceId = (await catalog.createManual({ projectId, method: 'POST', path: '/demo', name: 'demo' })).id
    requests = new RequestService(dataDir)
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('sends a raw JSON body with the right content type', async () => {
    const result = await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'raw-1',
      draft: draft({ bodyType: 'raw', bodyFormat: 'json', bodyRaw: '{"a":1}' })
    })
    expect(result.status).toBe(200)
    expect(received.contentType).toBe('application/json')
    expect(JSON.parse(received.body)).toEqual({ a: 1 })
  })

  it('honors request method and absolute URL overrides', async () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'override-1',
      draft: draft({
        requestMethod: 'GET',
        requestUrl: `http://127.0.0.1:${port}/direct/path?from=absolute`,
        bodyType: 'none'
      })
    })
    expect(received.method).toBe('GET')
    expect(received.url).toBe('/direct/path?from=absolute')
  })

  it('sends form-data as multipart with a boundary', async () => {
    const result = await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'form-1',
      draft: draft({
        bodyType: 'form-data',
        formRows: [
          { key: 'name', value: 'alice', enabled: true },
          { key: 'age', value: '18', enabled: true }
        ]
      })
    })
    expect(result.status).toBe(200)
    expect(received.contentType).toContain('multipart/form-data; boundary=')
    expect(received.body).toContain('name="name"')
    expect(received.body).toContain('alice')
  })

  it('uploads a multipart file and a binary file', async () => {
    const filePath = join(root, 'upload.txt')
    await writeFile(filePath, 'file-content-123')

    await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'file-1',
      draft: draft({
        bodyType: 'form-data',
        formRows: [{ key: 'file', value: '', enabled: true, kind: 'file', filePath, fileName: 'upload.txt' }]
      })
    })
    expect(received.body).toContain('filename="upload.txt"')
    expect(received.body).toContain('file-content-123')

    await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'binary-1',
      draft: draft({ bodyType: 'binary', binaryFilePath: filePath, binaryFileName: 'upload.txt' })
    })
    expect(received.body).toBe('file-content-123')
    expect(received.contentType).toBe('text/plain')
  })

  it('sends urlencoded rows without a body for none', async () => {
    await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'url-1',
      draft: draft({
        bodyType: 'urlencoded',
        formRows: [{ key: 'a', value: 'hello world', enabled: true }]
      })
    })
    expect(received.contentType).toBe('application/x-www-form-urlencoded')
    expect(received.body).toBe('a=hello%20world')

    await requests.send({
      projectId,
      envId,
      interfaceId,
      clientRequestId: 'none-1',
      draft: draft({ bodyType: 'none' })
    })
    expect(received.contentType).toBe('')
    expect(received.body).toBe('')
  })
})
