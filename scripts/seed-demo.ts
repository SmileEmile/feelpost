import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { CatalogService } from '../src/main/services/catalog-service'
import { EnvironmentService } from '../src/main/services/environment-service'
import { ExampleService } from '../src/main/services/example-service'
import { CaseService } from '../src/main/services/case-service'
import { ScanService } from '../src/main/services/scan-service'
import type { InterfaceDetail, RequestDraft } from '../src/shared/contract'

const root = resolve(__dirname, '..')
const dataDir = resolve(root, '.demo-data')
const sourceDir = resolve(root, 'examples/screenshot-demo')
const grammarPath = resolve(root, 'resources/grammars/java.wasm')
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
process.env.FEELPOST_SCAN_WORKER = resolve(root, 'out/main/scan-worker.js')

async function main(): Promise<void> {
  await rm(dataDir, { recursive: true, force: true })
  const projects = new ProjectService(dataDir)
  const catalog = new CatalogService(dataDir)
  const environments = new EnvironmentService(dataDir)
  const examples = new ExampleService(dataDir)
  const cases = new CaseService(dataDir)

  const project = await projects.create({
    name: '零售业务中台',
    sourceDir,
    description: '官网截图示例：用户、订单、告警与外部合作方接口。',
    localEnvUrl: 'http://localhost:8080'
  })
  console.log(`Project: ${project.id}`)

  const scan = new ScanService(dataDir, grammarPath, {
    progress: () => undefined,
    completed: () => undefined,
    failed: (payload) => console.error('scan failed', payload),
    cancelled: () => undefined
  })
  const started = await scan.start(project.id, { type: 'all' })
  let result
  for (let i = 0; i < 80; i += 1) {
    await sleep(150)
    try {
      result = scan.getResult(started.scanId)
      break
    } catch {
      // still running
    }
  }
  if (!result) throw new Error('扫描超时')
  await scan.apply(started.scanId, result.candidates.map((item) => item.candidateId))
  console.log(`Scanned: ${result.candidates.length} candidates`)

  const local = (await environments.list(project.id)).find((env) => env.isDefault)!
  await environments.create(project.id, { name: '测试环境', baseUrl: 'https://api.demo.feelpost.dev', timeoutMs: 30000 })
  await environments.create(project.id, { name: '预发布', baseUrl: 'https://staging.demo.feelpost.dev', timeoutMs: 30000 })
  await environments.update(project.id, local.id, {
    params: {
      headers: [{ key: 'X-Client', value: 'feelpost-demo', enabled: true, description: '客户端标识' }],
      query: [],
      cookies: [],
      body: []
    }
  })
  await projects.updateGlobals(project.id, {
    headers: [{ key: 'X-Tenant', value: 'demo', enabled: true, description: '租户标识' }],
    query: [],
    cookies: [],
    body: []
  })

  const external = await catalog.createDirectory({ projectId: project.id, name: '外部系统', description: '合作方回调与开放平台接口' })
  const open = await catalog.createDirectory({ projectId: project.id, name: '开放平台', description: '非源码扫描的手工接口', parentId: external.id })
  const manualOne = await catalog.createManual({
    projectId: project.id,
    method: 'GET',
    path: '/external/partner/health',
    name: '合作方健康检查',
    summary: '检查合作方回调通道是否可用。',
    directoryId: external.id
  })
  const manualTwo = await catalog.createManual({
    projectId: project.id,
    method: 'POST',
    path: '/external/partner/notify',
    name: '合作方事件回调',
    summary: '接收合作方订单状态变更事件。',
    directoryId: external.id
  })
  const manualThree = await catalog.createManual({
    projectId: project.id,
    method: 'GET',
    path: '/external/openapi/config',
    name: '开放平台配置',
    summary: '返回开放平台当前启用的能力与限流配置。',
    directoryId: open.id
  })
  console.log('Manual:', manualOne.id, manualTwo.id, manualThree.id)

  const tree = await catalog.list(project.id)
  const interfaces = tree.modules.flatMap((module) => module.packages.flatMap((pkg) => pkg.interfaces))
  const find = (method: string, path: string): InterfaceDetail | undefined => {
    const item = interfaces.find((candidate) => candidate.method === method && candidate.path === path)
    return item as InterfaceDetail | undefined
  }

  const userDetail = find('GET', '/api/users/{id}')
  if (userDetail) {
    const example = await examples.save({
      projectId: project.id,
      interfaceId: userDetail.id,
      name: '成功示例',
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        bodyText: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            id: 1001,
            name: '林晓',
            phone: '138****2048',
            department: '华东运营中心',
            enabled: true,
            createdAt: '2026-11-26 10:24:18'
          }
        }, null, 2)
      }
    })
    await examples.updateFields(project.id, example.id, {
      'data.id': '用户 ID',
      'data.name': '用户姓名',
      'data.phone': '手机号（已脱敏）',
      'data.department': '所属部门',
      'data.enabled': '是否启用',
      'data.createdAt': '创建时间'
    })
  }

  const orderList = find('GET', '/api/orders')
  if (orderList) {
    await examples.save({
      projectId: project.id,
      interfaceId: orderList.id,
      name: '订单列表示例',
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        bodyText: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            total: 128,
            page: 1,
            size: 20,
            list: [
              { orderNo: 'SO202611260001', customerId: 'C-2088', status: 'PAID', amount: 399.00, createdAt: '2026-11-26 09:30:12' },
              { orderNo: 'SO202611260002', customerId: 'C-2091', status: 'SHIPPED', amount: 1299.00, createdAt: '2026-11-26 09:42:03' }
            ]
          }
        }, null, 2)
      }
    })
  }

  const draft = (extra: Partial<RequestDraft>): RequestDraft => ({
    pathParams: {},
    query: [],
    headers: [],
    cookies: [],
    bodyType: 'none',
    bodyFormat: 'json',
    bodyRaw: '',
    formRows: [],
    ...extra
  })
  if (userDetail) {
    await cases.create({
      projectId: project.id,
      interfaceId: userDetail.id,
      envId: local.id,
      name: '查询用户详情 · 正常',
      tags: ['冒烟', '用户'],
      note: '普通用户详情，验证基础字段返回。',
      draft: draft({ pathParams: { id: '1001' } })
    })
  }
  if (orderList) {
    await cases.create({
      projectId: project.id,
      interfaceId: orderList.id,
      envId: local.id,
      name: '订单列表 · 已支付',
      tags: ['核心链路', '订单'],
      note: '按已支付状态筛选订单，分页取第一页。',
      draft: draft({ query: [{ key: 'status', value: 'PAID', enabled: true }, { key: 'page', value: '1', enabled: true }, { key: 'size', value: '20', enabled: true }] })
    })
  }

  console.log(`Demo ready: ${dataDir}`)
  console.log('Run: FEELPOST_DATA_DIR=.demo-data npm run dev')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
