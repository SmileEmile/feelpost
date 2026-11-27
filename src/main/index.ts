import { promises as fs } from 'node:fs'
import http from 'node:http'
import { join } from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import log from 'electron-log/main'
import { registerIpc } from './ipc/register'
import { SettingsService } from './services/settings-service'

const isSmoke = process.env.FEELPOST_SMOKE === '1'
const smokeServer =
  isSmoke && process.env.FEELPOST_SMOKE_HTTP === '1'
    ? http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ code: 0, message: 'ok', url: req.url, method: req.method }))
      })
    : null
if (smokeServer) smokeServer.listen(18081, '127.0.0.1')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#eef1f6',
    title: 'FeelPost',
    autoHideMenuBar: process.platform !== 'darwin',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 20 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    if (!isSmoke) {
      win.center()
      win.show()
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('did-finish-load', () => {
    if (!isSmoke) return
    setTimeout(async () => {
      try {
        const source = process.env.FEELPOST_SMOKE_SOURCE
        const script = source
          ? `(async () => {
              const api = window.feelpost
              const created = await api.project.create({ name: 'smoke-project', sourceDir: ${JSON.stringify(source)}, localEnvUrl: 'http://localhost:8080' })
              if (!created.ok) return { step: 'create', error: created.error }
              const projectId = created.data.id
              let scanError = null
              api.scan.onFailed((payload) => { scanError = payload.error })
              const started = await api.scan.start({ projectId, scope: { type: 'all' } })
              if (!started.ok) return { step: 'scan.start', error: started.error }
              const scanId = started.data.scanId
              let result = null
              for (let i = 0; i < 60; i += 1) {
                await new Promise((resolve) => setTimeout(resolve, 250))
                const current = await api.scan.getResult(scanId)
                if (current.ok) { result = current.data; break }
              }
              if (!result) return { step: 'scan.result', error: scanError ?? 'timeout' }
              const candidateIds = result.candidates.map((item) => item.candidateId)
              const applied = await api.scan.apply({ scanId, candidateIds })
              const tree = await api.catalog.list(projectId)
              const envList = await api.env.list(projectId)
              let httpStatus = null
              let httpBody = null
              if (envList.ok && envList.data.length > 0 && tree.ok) {
                const env = envList.data[0]
                await api.env.update(projectId, env.id, { baseUrl: 'http://127.0.0.1:18081' })
                const first = tree.data.modules[0]?.packages[0]?.interfaces.find((item) => item.method === 'GET')
                if (first) {
                  const detail = await api.catalog.get(projectId, first.id)
                  if (detail.ok) {
                    const sent = await api.request.send({
                      projectId,
                      envId: env.id,
                      interfaceId: first.id,
                      clientRequestId: 'smoke-request',
                      draft: {
                        pathParams: Object.fromEntries(detail.data.params.path.map((field) => [field.name, '42'])),
                        query: [{ key: 'keyword', value: 'alice', enabled: true }],
                        headers: [],
                        cookies: [],
                        bodyType: 'none',
                        bodyFormat: 'json',
                        bodyRaw: '',
                        formRows: []
                      }
                    })
                    if (sent.ok) { httpStatus = sent.data.status; httpBody = sent.data.bodyText.slice(0, 100) }
                    else httpBody = sent.error.message
                  }
                }
              }
              return {
                hasApp: !!document.querySelector('.app'),
                candidates: result.candidates.map((item) => item.method + ' ' + item.path),
                candidateNames: result.candidates.slice(0, 8).map((item) => item.name),
                applied: applied.ok ? applied.data.applied : applied.error,
                tree: tree.ok ? tree.data.modules.map((module) => module.name) : tree.error,
                httpStatus,
                httpBody
              }
            })()`
          : `({ hasApi: typeof window.feelpost, hasApp: !!document.querySelector('.app'), text: (document.body.innerText || '').slice(0, 120) })`
        if (process.env.FEELPOST_SMOKE_UI === 'create') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const create = document.querySelector('.project.new')
              if (create) { create.click(); await new Promise((resolve) => setTimeout(resolve, 350)) }
              const submit = document.querySelector('.modal .btn.primary')
              if (submit) { submit.click(); await new Promise((resolve) => setTimeout(resolve, 350)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'delete') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const remove = document.querySelector('.project-delete')
              if (remove) { remove.click(); await new Promise((resolve) => setTimeout(resolve, 400)) }
            })()`
          )
        }


        if (process.env.FEELPOST_SMOKE_UI === 'casedetail') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const railCase = Array.from(document.querySelectorAll('.rail-btn')).find((button) => button.textContent?.includes('用例'))
              if (railCase) { railCase.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const caseName = document.querySelector('.case-name')
              if (caseName) { caseName.click(); await new Promise((resolve) => setTimeout(resolve, 600)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'examples') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const api = window.feelpost
              const projects = await api.project.list()
              if (!projects.ok || projects.data.length === 0) return
              const projectId = projects.data[0].id
              const tree = await api.catalog.list(projectId)
              if (!tree.ok) return
              const iface = tree.data.modules[0]?.packages[0]?.interfaces[0]
              if (!iface) return
              await api.example.save({
                projectId,
                interfaceId: iface.id,
                name: '成功示例',
                response: {
                  status: 200,
                  headers: [['content-type', 'application/json']],
                  bodyText: JSON.stringify({ code: 200, data: { list: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: '记录 ' + (i + 1) })) } }),
                  truncated: false
                }
              })
              await api.example.save({
                projectId,
                interfaceId: iface.id,
                name: '失败示例',
                response: {
                  status: 500,
                  headers: [['content-type', 'application/json']],
                  bodyText: '{"code":500,"message":"server error"}',
                  truncated: false
                }
              })
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const item = document.querySelector('.tree-item')
              if (item) { item.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const examplesTab = Array.from(document.querySelectorAll('.resp-tab')).find((button) => (button.textContent || '').startsWith('响应示例'))
              if (examplesTab) { examplesTab.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
            })()`
          )
        }











        if (process.env.FEELPOST_SMOKE_UI === 'docs') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const railDoc = Array.from(document.querySelectorAll('.rail-btn')).find((button) => button.textContent?.includes('文档'))
              if (railDoc) { railDoc.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'cases') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const api = window.feelpost
              const projects = await api.project.list()
              if (!projects.ok || projects.data.length === 0) return
              const projectId = projects.data[0].id
              const tree = await api.catalog.list(projectId)
              if (!tree.ok) return
              const iface = tree.data.modules[0]?.packages[0]?.interfaces[0] || tree.data.manual[0]
              const envs = await api.env.list(projectId)
              if (!iface || !envs.ok || envs.data.length === 0) return
              await api.case.create({
                projectId,
                interfaceId: iface.id,
                envId: envs.data[0].id,
                name: iface.name + ' · 冒烟',
                tags: ['冒烟'],
                note: '界面验证用例',
                draft: {
                  pathParams: Object.fromEntries((iface.method === 'GET' ? [] : [])),
                  query: [],
                  headers: [],
                  cookies: [],
                  bodyType: 'none',
                  bodyFormat: 'json',
                  bodyRaw: '',
                  formRows: []
                }
              })
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const railCase = Array.from(document.querySelectorAll('.rail-btn')).find((button) => button.textContent?.includes('用例'))
              if (railCase) { railCase.click(); await new Promise((resolve) => setTimeout(resolve, 600)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'field-save') {
          const fieldSaveResult = await win.webContents.executeJavaScript(
            `(async () => {
              const api = window.feelpost
              const projects = await api.project.list()
              if (!projects.ok || !projects.data.length) return { step: 'project' }
              const projectId = projects.data[0].id
              const tree = await api.catalog.list(projectId)
              const iface = tree.ok ? (tree.data.modules[0]?.packages[0]?.interfaces[0] || tree.data.manual[0]) : null
              if (!iface) return { step: 'iface' }
              const saved = await api.example.save({
                projectId,
                interfaceId: iface.id,
                name: '字段保存验证',
                response: { status: 200, headers: [], bodyText: '{"code":200,"data":{"name":"alice"}}' }
              })
              if (!saved.ok) return { step: 'example', error: saved.error }
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const item = document.querySelector('.tree-item')
              if (item) { item.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const exampleTab = Array.from(document.querySelectorAll('.resp-tab')).find((button) => (button.textContent || '').startsWith('响应示例'))
              if (exampleTab) { exampleTab.click(); await new Promise((resolve) => setTimeout(resolve, 350)) }
              const fieldButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '字段描述')
              if (fieldButton) { fieldButton.click(); await new Promise((resolve) => setTimeout(resolve, 350)) }
              const input = document.querySelector('.field-desc-table input')
              if (input) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                setter?.call(input, '保存验证说明')
                input.dispatchEvent(new Event('input', { bubbles: true }))
                input.dispatchEvent(new Event('change', { bubbles: true }))
              }
              await new Promise((resolve) => setTimeout(resolve, 150))
              const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存字段描述')
              if (saveButton) { saveButton.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const mainSave = document.querySelector('.save-main')
              if (mainSave) { mainSave.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const examples = await api.example.list(projectId, iface.id)
              const fieldButtonAgain = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').startsWith('字段描述'))
              if (fieldButtonAgain) { fieldButtonAgain.click(); await new Promise((resolve) => setTimeout(resolve, 350)) }
              const reopened = document.querySelector('.field-desc-table input')
              return { step: 'result', hasInput: !!input, reopened: reopened ? reopened.value : null, examples: examples.ok ? examples.data.map((e) => ({ name: e.name, fields: e.fieldDescriptions })) : examples.error }
            })()`
          )
          console.log('FEELPOST_FIELD_SAVE_RESULT ' + JSON.stringify(fieldSaveResult))
        }
        if (process.env.FEELPOST_SMOKE_UI === 'aicase') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const item = document.querySelector('.tree-item')
              if (item) { item.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const aiCase = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('AI 用例'))
              if (aiCase) { aiCase.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'aifield') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const items = document.querySelectorAll('.tree-item')
              const item = items[1] ?? items[0]
              if (item) { item.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const bodyTab = Array.from(document.querySelectorAll('.tab')).find((button) => (button.textContent || '').startsWith('Body'))
              if (bodyTab) { bodyTab.click(); await new Promise((resolve) => setTimeout(resolve, 300)) }
              const fieldButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '字段说明')
              if (fieldButton) { fieldButton.click(); await new Promise((resolve) => setTimeout(resolve, 300)) }
              const aiButton = document.querySelector('.ai-action')
              if (aiButton) { aiButton.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'envs') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const railEnv = Array.from(document.querySelectorAll('.rail-btn')).find((button) => button.textContent?.includes('环境'))
              if (railEnv) { railEnv.click(); await new Promise((resolve) => setTimeout(resolve, 600)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'settings') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
              const railSettings = Array.from(document.querySelectorAll('.rail-btn')).find((button) => button.textContent?.includes('设置'))
              if (railSettings) { railSettings.click(); await new Promise((resolve) => setTimeout(resolve, 600)) }
            })()`
          )
        }
        if (process.env.FEELPOST_SMOKE_UI === 'workspace') {
          await win.webContents.executeJavaScript(
            `(async () => {
              const card = document.querySelector('.project')
              if (card) { card.click(); await new Promise((resolve) => setTimeout(resolve, 1000)) }
              const items = document.querySelectorAll('.tree-item')
              const item = items[1] ?? items[0]
              if (item) { item.click(); await new Promise((resolve) => setTimeout(resolve, 500)) }
              const targetTab = Array.from(document.querySelectorAll('.tab')).find((button) => (button.textContent || '').startsWith('Body'))
              if (targetTab) { targetTab.click(); await new Promise((resolve) => setTimeout(resolve, 400)) }
              const sendButton = Array.from(document.querySelectorAll('.api-head .btn')).find((button) => button.textContent === '发送')
              if (sendButton) { sendButton.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
            })()`
          )
        }
        const snapshot = await win.webContents.executeJavaScript(script)
        console.log('FEELPOST_SMOKE_RESULT ' + JSON.stringify(snapshot))
        if (process.env.FEELPOST_SMOKE_SHOT) {
          const image = await win.webContents.capturePage()
          await fs.writeFile(process.env.FEELPOST_SMOKE_SHOT, image.toPNG())
          console.log('FEELPOST_SMOKE_SHOT_SAVED')
        }
      } catch (error) {
        console.error('FEELPOST_SMOKE_ERROR', error)
      }
      console.log('FEELPOST_SMOKE_READY')
      setTimeout(() => app.quit(), 200)
    }, 600)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const dataDir = process.env.FEELPOST_DATA_DIR || join(app.getPath('documents'), 'feelpost')
  log.initialize()
  log.transports.file.resolvePathFn = () =>
    join(process.env.FEELPOST_LOG_DIR || join(app.getPath('userData'), 'logs'), 'main.log')
  log.info('FeelPost starting', { dataDir })
  // Windows/Linux do not need the default Electron File/Edit/View menu.
  // Keep the native application menu on macOS for standard app shortcuts.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  const grammarPath = app.isPackaged
    ? join(process.resourcesPath, 'grammars', 'java.wasm')
    : join(process.cwd(), 'resources', 'grammars', 'java.wasm')
  if (isSmoke && process.env.FEELPOST_SMOKE_ONBOARDING !== '1') await new SettingsService(dataDir).update({ onboardingCompleted: true })
  registerIpc({ dataDir, version: app.getVersion(), grammarPath })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  smokeServer?.close()
})
