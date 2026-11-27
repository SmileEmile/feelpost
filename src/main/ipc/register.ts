import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Result } from '@shared/contract'
import { AppException, toAppError } from '../errors'
import { ProjectService } from '../services/project-service'
import { SettingsService } from '../services/settings-service'
import { CatalogService } from '../services/catalog-service'
import { ScanService } from '../services/scan-service'
import { EnvironmentService } from '../services/environment-service'
import { RequestService } from '../services/request-service'
import { CaseService } from '../services/case-service'
import { ExampleService } from '../services/example-service'
import { DocService, type BuiltDoc } from '../services/doc-service'
import { AISecretStore } from '../services/ai-secret-store'
import { AIContextBuilder } from '../services/ai-context-builder'
import { OpenAICompatibleProvider } from '../services/ai-provider'
import { AIService } from '../services/ai-service'
import { UpdateService } from '../services/update-service'

interface Options {
  dataDir: string
  version: string
  grammarPath: string
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  sourceDir: z.string().trim().optional(),
  description: z.string().optional(),
  localEnvUrl: z.string().trim().optional()
})

const updateProjectSchema = z.object({
  projectId: z.string().min(1),
  patch: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    sourceDir: z.string().optional(),
    excludePatterns: z.array(z.string()).optional()
  })
})

const scanScopeSchema = z.object({
  type: z.enum(['all', 'directory', 'modules']),
  directory: z.string().optional(),
  modules: z.array(z.string()).optional()
})

const manualOverrideSchema = z.object({
  location: z.enum(['path', 'query', 'header', 'cookie', 'body']),
  key: z.string(),
  values: z.object({
    type: z.string().optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
    name: z.string().optional()
  })
})

const paramRowSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
  description: z.string().optional(),
  kind: z.enum(['text', 'file']).optional(),
  filePath: z.string().optional(),
  fileName: z.string().optional()
})

const draftSchema = z.object({
  requestMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  requestUrl: z.string().optional(),
  pathParams: z.record(z.string()),
  query: z.array(paramRowSchema),
  headers: z.array(paramRowSchema),
  cookies: z.array(paramRowSchema),
  bodyType: z.enum(['none', 'raw', 'form-data', 'urlencoded', 'binary']),
  bodyFormat: z.enum(['json', 'text']).default('json'),
  bodyRaw: z.string(),
  formRows: z.array(paramRowSchema).default([]),
  binaryFilePath: z.string().optional(),
  binaryFileName: z.string().optional(),
  fieldDescriptions: z.record(z.string()).optional()
})

const aiConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string(),
  model: z.string(),
  timeoutMs: z.number().int().min(10000).max(180000),
  apiKey: z.string().nullable().optional()
})

const aiMetaSchema = z.object({
  source: z.literal('ai'),
  provider: z.literal('openai-compatible'),
  model: z.string(),
  promptVersion: z.string(),
  generatedAt: z.string(),
  contextHash: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number()
  }).optional()
})

const aiCaseScenarioSchema = z.enum(['normal', 'boundary', 'error', 'empty'])

const aiContextSchema = z.discriminatedUnion('feature', [
  z.object({
    feature: z.literal('field-descriptions'),
    projectId: z.string().min(1),
    interfaceId: z.string().min(1),
    target: z.enum(['request', 'response']),
    exampleId: z.string().optional(),
    draft: draftSchema.optional()
  }),
  z.object({
    feature: z.literal('cases'),
    projectId: z.string().min(1),
    interfaceId: z.string().min(1),
    scenarios: z.array(aiCaseScenarioSchema).min(1).max(4)
  }),
  z.object({
    feature: z.literal('case-doc'),
    projectId: z.string().min(1),
    caseIds: z.array(z.string().min(1)).min(1).max(50)
  })
])

const aiGenerateSchema = aiContextSchema.and(z.object({ contextHash: z.string().min(1) }))

const aiCaseCandidateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scenario: aiCaseScenarioSchema,
  tags: z.array(z.string()).default([]),
  note: z.string().max(1000).default(''),
  request: draftSchema
})


const aiImportCasesSchema = z.object({
  projectId: z.string().min(1),
  interfaceId: z.string().min(1),
  envId: z.string().min(1),
  cases: z.array(aiCaseCandidateSchema).min(1).max(20),
  meta: aiMetaSchema
})

const envParamsSchema = z.object({
  headers: z.array(paramRowSchema),
  query: z.array(paramRowSchema),
  cookies: z.array(paramRowSchema),
  body: z.array(paramRowSchema)
})

const envPatchSchema = z.object({
  name: z.string().optional(),
  baseUrl: z.string().optional(),
  timeoutMs: z.number().optional(),
  verifyTls: z.boolean().optional(),
  proxy: z.string().optional(),
  noProxy: z.array(z.string()).optional(),
  params: envParamsSchema.optional(),
  isDefault: z.boolean().optional()
})

const settingsPatchSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  debugLogging: z.boolean().optional(),
  zoomFactor: z.number().min(0.5).max(2).optional(),
  lastProjectId: z.string().nullable().optional(),
  lastEnvByProject: z.record(z.string()).optional(),
  onboardingCompleted: z.boolean().optional()
})

function validate<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'payload'
      return `${path}: ${issue.message}`
    })
    throw new AppException('VALIDATION', `请求参数不合法：${issues.join('；')}`, {
      fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      issues
    })
  }
  return parsed.data
}

function handle<TPayload, TResult>(
  channel: string,
  handler: (payload: TPayload, event: Electron.IpcMainInvokeEvent) => Promise<TResult>
): void {
  ipcMain.handle(channel, async (event, payload): Promise<Result<TResult>> => {
    try {
      return { ok: true, data: await handler(payload as TPayload, event) }
    } catch (error) {
      return { ok: false, error: toAppError(error) }
    }
  })
}

export function registerIpc(options: Options): void {
  const projects = new ProjectService(options.dataDir)
  const settings = new SettingsService(options.dataDir)
  const catalog = new CatalogService(options.dataDir)
  const environments = new EnvironmentService(options.dataDir)
  const requests = new RequestService(options.dataDir)
  const cases = new CaseService(options.dataDir)
  const examples = new ExampleService(options.dataDir)
  const docs = new DocService(options.dataDir)
  const ai = new AIService(
    settings,
    new AISecretStore(options.dataDir),
    new AIContextBuilder(projects, catalog, examples, cases),
    new OpenAICompatibleProvider(),
    {
      stream: (payload) => broadcast('ai:stream', payload),
      completed: (payload) => broadcast('ai:completed', payload),
      failed: (payload) => broadcast('ai:failed', payload),
      cancelled: (payload) => broadcast('ai:cancelled', payload)
    },
    options.dataDir
  )
  const scan = new ScanService(options.dataDir, options.grammarPath, {
    progress: (payload) => broadcast('scan:progress', payload),
    completed: (payload) => broadcast('scan:completed', payload),
    failed: (payload) => broadcast('scan:failed', payload),
    cancelled: (payload) => broadcast('scan:cancelled', payload)
  })

  const updates = new UpdateService(options.version)
  handle('app:checkUpdate', async () => updates.check())

  handle('app:getInfo', async () => ({
    version: options.version,
    platform: process.platform,
    dataDir: options.dataDir,
    contractVersion: 1
  }))

  handle('app:setZoomFactor', async (payload: { factor: number }, event) => {
    if (!Number.isFinite(payload?.factor) || payload.factor < 0.5 || payload.factor > 2) {
      throw new AppException('VALIDATION', '缩放比例需在 50% 到 200% 之间。')
    }
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.setZoomFactor(payload.factor)
  })
  handle('settings:get', async () => settings.get())
  handle('settings:update', async (payload) => settings.update(validate(settingsPatchSchema, payload)))

  handle('ai:getConfig', async () => ai.getConfig())
  handle('ai:revealApiKey', async () => ai.revealApiKey())
  handle('ai:updateConfig', async (payload) => ai.updateConfig(validate(aiConfigSchema, payload)))
  handle('ai:testConnection', async () => ai.testConnection())
  handle('ai:listModels', async () => ai.listModels())
  handle('ai:previewContext', async (payload) => ai.previewContext(validate(aiContextSchema, payload)))
  handle('ai:generate', async (payload) => ai.generate(validate(aiGenerateSchema, payload)))
  handle('ai:cancel', async (payload) => {
    const input = validate(z.object({ requestId: z.string().min(1) }), payload)
    return { cancelled: ai.cancel(input.requestId) }
  })
  handle('ai:importCases', async (payload) => {
    const input = validate(aiImportCasesSchema, payload)
    const project = await projects.get(input.projectId)
    if (!project.environments.some((env) => env.id === input.envId)) {
      throw new AppException('NOT_FOUND', '导入用例使用的环境不存在。')
    }
    const created = []
    for (const candidate of input.cases) {
      created.push(await cases.create({
        projectId: input.projectId,
        interfaceId: input.interfaceId,
        envId: input.envId,
        name: candidate.name,
        tags: [...new Set([...(candidate.tags ?? []), 'AI'])],
        note: candidate.note,
        draft: candidate.request,
        aiMeta: { ...input.meta, scenario: candidate.scenario }
      }))
    }
    return created
  })

  handle('dialog:chooseDirectory', async (_payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return { path: result.filePaths[0] }
  })

  handle('project:list', async () => projects.list())
  handle('project:get', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return projects.get(payload.projectId)
  })
  handle('project:create', async (payload) => projects.create(validate(createProjectSchema, payload)))
  handle('project:update', async (payload) => projects.update(validate(updateProjectSchema, payload)))
  handle('project:delete', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    await projects.remove(payload.projectId)
  })
  handle('project:validateDirectory', async (payload: { path: string }) => {
    if (!payload?.path) throw new AppException('VALIDATION', '缺少目录路径。')
    return projects.validateDirectory(payload.path)
  })
  handle('project:listModules', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return projects.listModules(payload.projectId)
  })
  handle('project:getGlobals', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return projects.getGlobals(payload.projectId)
  })
  handle('project:updateGlobals', async (payload) => {
    const input = validate(
      z.object({ projectId: z.string().min(1), params: envParamsSchema }),
      payload
    )
    return projects.updateGlobals(input.projectId, input.params)
  })

  handle('dialog:chooseFile', async (_payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    return { path: filePath, name: basename(filePath) }
  })

  handle('shell:openExternal', async (payload) => {
    const { url } = z.object({ url: z.string().url() }).parse(payload)
    if (!/^https?:\/\//i.test(url)) throw new AppException('VALIDATION', '仅支持打开 http/https 链接。')
    await shell.openExternal(url)
  })

  handle('shell:openPath', async (payload: { path: string }) => {
    if (!payload?.path) throw new AppException('VALIDATION', '缺少目录路径。')
    const dataDir = resolve(options.dataDir)
    const logsDir = resolve(join(options.dataDir, 'logs'))
    const target = resolve(payload.path)
    if (target !== dataDir && target !== logsDir) throw new AppException('VALIDATION', '只能打开数据目录或日志目录。')
    await fs.mkdir(target, { recursive: true })
    const error = await shell.openPath(target)
    if (error) throw new AppException('IO', error)
  })

  handle('scan:start', async (payload) => {
    const input = validate(
      z.object({ projectId: z.string().min(1), scope: scanScopeSchema }),
      payload
    )
    return scan.start(input.projectId, input.scope)
  })
  handle('scan:cancel', async (payload: { scanId: string }) => {
    if (!payload?.scanId) throw new AppException('VALIDATION', '缺少扫描 ID。')
    return scan.cancel(payload.scanId)
  })
  handle('scan:getResult', async (payload: { scanId: string }) => {
    if (!payload?.scanId) throw new AppException('VALIDATION', '缺少扫描 ID。')
    return scan.getResult(payload.scanId)
  })
  handle('scan:apply', async (payload) => {
    const input = validate(
      z.object({ scanId: z.string().min(1), candidateIds: z.array(z.string()) }),
      payload
    )
    return scan.apply(input.scanId, input.candidateIds)
  })
  handle('scan:getLastRun', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return scan.lastRun(payload.projectId)
  })

  handle('catalog:list', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return catalog.list(payload.projectId)
  })
  handle('catalog:get', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    return catalog.get(payload.projectId, payload.interfaceId)
  })
  handle('catalog:updateManual', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        interfaceId: z.string().min(1),
        manualLayer: z.object({
          overrides: z.array(manualOverrideSchema),
          name: z.string().optional(),
          summary: z.string().optional()
        }),
        requestDraft: draftSchema.optional()
      }),
      payload
    )
    return catalog.updateManual(input.projectId, input.interfaceId, input.manualLayer, input.requestDraft)
  })
  handle('catalog:confirmChange', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    return catalog.confirmChange(payload.projectId, payload.interfaceId)
  })
  handle('catalog:restore', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    return catalog.restore(payload.projectId, payload.interfaceId)
  })
  handle('catalog:createManual', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        path: z.string().min(1),
        name: z.string().min(1),
        summary: z.string().optional(),
        directoryId: z.string().optional()
      }),
      payload
    )
    return catalog.createManual(input)
  })
  handle('catalog:createDirectory', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        parentId: z.string().nullable().optional()
      }),
      payload
    )
    return catalog.createDirectory(input)
  })
  handle('catalog:updateDirectory', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        directoryId: z.string().min(1),
        name: z.string().optional(),
        description: z.string().optional()
      }),
      payload
    )
    return catalog.updateDirectory(input)
  })
  handle('catalog:deleteDirectory', async (payload: { projectId: string; directoryId: string }) => {
    if (!payload?.projectId || !payload?.directoryId) throw new AppException('VALIDATION', '缺少项目或目录 ID。')
    await catalog.deleteDirectory(payload.projectId, payload.directoryId)
  })
  handle('catalog:copyDirectory', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        directoryId: z.string().min(1),
        name: z.string().optional()
      }),
      payload
    )
    return catalog.copyDirectory(input)
  })
  handle('catalog:moveInterface', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        interfaceId: z.string().min(1),
        directoryId: z.string().nullable().optional()
      }),
      payload
    )
    return catalog.moveInterface(input)
  })
  handle('catalog:cloneInterface', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    return catalog.cloneInterface(payload)
  })
  handle('catalog:deleteInterface', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    await catalog.deleteInterface(payload.projectId, payload.interfaceId)
  })
  handle('catalog:renamePackage', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        packageName: z.string().min(1),
        label: z.string().max(120).nullable()
      }),
      payload
    )
    await projects.updatePackageAlias(input.projectId, input.packageName, input.label)
  })

  handle('case:list', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        filter: z.object({ tag: z.string().optional(), keyword: z.string().optional() }).optional()
      }),
      payload
    )
    return cases.list(input.projectId, input.filter)
  })
  handle('case:get', async (payload: { projectId: string; caseId: string }) => {
    if (!payload?.projectId || !payload?.caseId) throw new AppException('VALIDATION', '缺少项目或用例 ID。')
    return cases.get(payload.projectId, payload.caseId)
  })
  handle('case:create', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        interfaceId: z.string().min(1),
        envId: z.string().min(1),
        name: z.string().min(1),
        tags: z.array(z.string()).optional(),
        note: z.string().optional(),
        draft: draftSchema,
        aiMeta: aiMetaSchema.optional()
      }),
      payload
    )
    return cases.create(input)
  })
  handle('case:update', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        caseId: z.string().min(1),
        patch: z.object({
          name: z.string().optional(),
          tags: z.array(z.string()).optional(),
          note: z.string().optional()
        })
      }),
      payload
    )
    return cases.update(input)
  })
  handle('case:duplicate', async (payload: { projectId: string; caseId: string; name?: string }) => {
    if (!payload?.projectId || !payload?.caseId) throw new AppException('VALIDATION', '缺少项目或用例 ID。')
    return cases.duplicate(payload.projectId, payload.caseId, payload.name)
  })
  handle('case:delete', async (payload: { projectId: string; caseId: string }) => {
    if (!payload?.projectId || !payload?.caseId) throw new AppException('VALIDATION', '缺少项目或用例 ID。')
    await cases.remove(payload.projectId, payload.caseId)
  })
  handle('case:removeTags', async (payload) => {
    const input = validate(
      z.object({ projectId: z.string().min(1), tags: z.array(z.string().min(1)).min(1) }),
      payload
    )
    return { deleted: await cases.removeTags(input.projectId, input.tags) }
  })

  handle('example:list', async (payload: { projectId: string; interfaceId: string }) => {
    if (!payload?.projectId || !payload?.interfaceId) throw new AppException('VALIDATION', '缺少项目或接口 ID。')
    return examples.list(payload.projectId, payload.interfaceId)
  })
  handle('example:save', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        interfaceId: z.string().min(1),
        name: z.string().min(1),
        response: z.object({
          status: z.number(),
          statusText: z.string().optional(),
          headers: z.array(z.tuple([z.string(), z.string()])),
          bodyText: z.string(),
          truncated: z.boolean().optional()
        }),
        sourceCaseId: z.string().optional()
      }),
      payload
    )
    return examples.save(input)
  })
  handle('example:update', async (payload: { projectId: string; exampleId: string; name: string }) => {
    if (!payload?.projectId || !payload?.exampleId) throw new AppException('VALIDATION', '缺少项目或示例 ID。')
    return examples.update(payload.projectId, payload.exampleId, payload.name)
  })
  handle('example:updateFields', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        exampleId: z.string().min(1),
        descriptions: z.record(z.string()),
        fieldDescriptionMeta: z.record(aiMetaSchema).optional().catch(undefined)
      }),
      payload
    )
    return examples.updateFields(input.projectId, input.exampleId, input.descriptions, input.fieldDescriptionMeta as Record<string, import('@shared/contract').AIMeta> | undefined)
  })
  handle('example:delete', async (payload: { projectId: string; exampleId: string }) => {
    if (!payload?.projectId || !payload?.exampleId) throw new AppException('VALIDATION', '缺少项目或示例 ID。')
    await examples.remove(payload.projectId, payload.exampleId)
  })

  handle('doc:previewProject', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        scope: z.enum(['active', 'all']),
        includeManual: z.boolean(),
        envId: z.string().optional(),
        filter: z.object({
          name: z.string().optional(),
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
          path: z.string().optional(),
          status: z.enum(['registered', 'changed', 'archived']).optional(),
          module: z.string().optional()
        }).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional()
      }),
      payload
    )
    const doc = await docs.buildProject(
      input.projectId,
      input.scope,
      input.includeManual,
      input.envId,
      input.filter,
      { limit: input.limit, offset: input.offset }
    )
    return {
      markdown: doc.markdown,
      total: doc.total ?? 0,
      offset: doc.offset ?? 0,
      hasMore: doc.hasMore ?? false,
      nextOffset: doc.nextOffset ?? 0
    }
  })
  handle('doc:exportProject', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        scope: z.enum(['active', 'all']),
        includeManual: z.boolean(),
        envId: z.string().optional(),
        filter: z.object({
          name: z.string().optional(),
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
          path: z.string().optional(),
          status: z.enum(['registered', 'changed', 'archived']).optional(),
          module: z.string().optional()
        }).optional()
      }),
      payload
    )
    return saveMarkdown(await docs.buildProject(input.projectId, input.scope, input.includeManual, input.envId, input.filter))
  })
  handle('doc:exportInterface', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        interfaceId: z.string().min(1),
        envId: z.string().optional()
      }),
      payload
    )
    return saveMarkdown(await docs.buildInterface(input.projectId, input.interfaceId, input.envId))
  })
  handle('doc:exportCase', async (payload) => {
    const input = validate(
      z.object({ projectId: z.string().min(1), caseId: z.string().min(1) }),
      payload
    )
    return saveMarkdown(await docs.buildCase(input.projectId, input.caseId))
  })
  handle('doc:saveMarkdown', async (payload) => {
    const input = validate(
      z.object({
        markdown: z.string().min(1).max(500000),
        suggestedName: z.string().min(1).max(200)
      }),
      payload
    )
    return saveMarkdown({ markdown: input.markdown, fileName: input.suggestedName.endsWith('.md') ? input.suggestedName : `${input.suggestedName}.md` })
  })
  handle('doc:exportCases', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        tags: z.array(z.string()).optional(),
        caseIds: z.array(z.string()).optional()
      }),
      payload
    )
    if (input.caseIds?.length === 1) return saveMarkdown(await docs.buildCase(input.projectId, input.caseIds[0]))
    return saveMarkdown(await docs.buildCases(input.projectId, input.tags, input.caseIds))
  })

  handle('env:list', async (payload: { projectId: string }) => {
    if (!payload?.projectId) throw new AppException('VALIDATION', '缺少项目 ID。')
    return environments.list(payload.projectId)
  })
  handle('env:create', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        input: z.object({ name: z.string().min(1), baseUrl: z.string().min(1), timeoutMs: z.number().optional() })
      }),
      payload
    )
    return environments.create(input.projectId, input.input)
  })
  handle('env:update', async (payload) => {
    const input = validate(
      z.object({ projectId: z.string().min(1), envId: z.string().min(1), patch: envPatchSchema }),
      payload
    )
    return environments.update(input.projectId, input.envId, input.patch)
  })
  handle('env:remove', async (payload: { projectId: string; envId: string }) => {
    if (!payload?.projectId || !payload?.envId) throw new AppException('VALIDATION', '缺少项目或环境 ID。')
    await environments.remove(payload.projectId, payload.envId)
  })
  handle('env:setDefault', async (payload: { projectId: string; envId: string }) => {
    if (!payload?.projectId || !payload?.envId) throw new AppException('VALIDATION', '缺少项目或环境 ID。')
    return environments.setDefault(payload.projectId, payload.envId)
  })
  handle('env:preview', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        envId: z.string().min(1),
        interfaceId: z.string().min(1),
        draft: draftSchema
      }),
      payload
    )
    return requests.preview(input.projectId, input.envId, input.interfaceId, input.draft)
  })
  handle('request:send', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        envId: z.string().min(1),
        interfaceId: z.string().min(1),
        draft: draftSchema,
        clientRequestId: z.string().min(1)
      }),
      payload
    )
    return requests.send(input)
  })
  handle('request:cancel', async (payload: { clientRequestId: string }) => {
    if (!payload?.clientRequestId) throw new AppException('VALIDATION', '缺少请求 ID。')
    return requests.cancel(payload.clientRequestId)
  })
  handle('request:buildCurl', async (payload) => {
    const input = validate(
      z.object({
        projectId: z.string().min(1),
        envId: z.string().min(1),
        interfaceId: z.string().min(1),
        draft: draftSchema
      }),
      payload
    )
    return requests.buildCurl(input.projectId, input.envId, input.interfaceId, input.draft)
  })
}

async function saveMarkdown(doc: BuiltDoc): Promise<{ saved: boolean; path?: string }> {
  const options = {
    title: '导出 Markdown',
    defaultPath: join(app.getPath('documents'), doc.fileName),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const win = BrowserWindow.getFocusedWindow()
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false }
  await fs.writeFile(result.filePath, doc.markdown, 'utf8')
  return { saved: true, path: result.filePath }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}
