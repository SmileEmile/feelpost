import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type {
  AICaseResult,
  AICaseScenario,
  AIConfig,
  AIConfigPublic,
  AICompletionResult,
  AIContextInput,
  AIFieldDescriptionResult,
  AIHandoffResult,
  AIMeta,
  AIGenerateInput
} from '@shared/contract'
import type { AppError } from '@shared/contract'
import { AppException, toAppError } from '../errors'
import { SettingsService } from './settings-service'
import type { AISecretProvider } from './ai-secret-store'
import { AIContextBuilder, type BuiltAIContext } from './ai-context-builder'
import type { AIProvider, AIProviderMessage, AIProviderResult } from './ai-provider'

export interface AIServiceEvents {
  stream: (payload: { requestId: string; delta: string }) => void
  completed: (payload: { requestId: string; feature: AIContextInput['feature']; result: AICompletionResult; meta: AIMeta }) => void
  failed: (payload: { requestId: string; error: AppError }) => void
  cancelled: (payload: { requestId: string }) => void
}

const PROMPT_VERSION: Record<AIContextInput['feature'], string> = {
  'field-descriptions': 'field-notes.v1',
  cases: 'cases.v1',
  'case-doc': 'case-doc.v4'
}

const SYSTEM_PROMPT = [
  '你是 FeelPost 的接口契约助理。',
  '只处理用户给出的 JSON 上下文；不要编造字段、路径、类型或状态码。',
  '不要执行请求，不要调用工具，不要输出 HTML 或脚本。',
  '只输出要求的 JSON；不要输出 Markdown 代码围栏或额外解释。',
  '所有说明使用中文。'
].join('\n')

const paramRowSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
  description: z.string().optional(),
  kind: z.enum(['text', 'file']).optional(),
  filePath: z.string().optional(),
  fileName: z.string().optional()
})

const caseRequestSchema = z.object({
  requestMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  requestUrl: z.string().optional(),
  pathParams: z.record(z.string()).default({}),
  query: z.array(paramRowSchema).default([]),
  headers: z.array(paramRowSchema).default([]),
  cookies: z.array(paramRowSchema).default([]),
  bodyType: z.enum(['none', 'raw', 'form-data', 'urlencoded', 'binary']),
  bodyFormat: z.enum(['json', 'text']).optional(),
  bodyRaw: z.string().default(''),
  formRows: z.array(paramRowSchema).optional(),
  binaryFilePath: z.string().optional(),
  binaryFileName: z.string().optional()
})

const fieldResultSchema = z.object({
  schemaVersion: z.literal(1),
  fields: z.array(z.object({
    path: z.string().min(1),
    description: z.string().trim().min(1).max(500),
    change: z.enum(['add', 'update', 'same']).optional()
  })).max(200)
})

const caseResultSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    scenario: z.enum(['normal', 'boundary', 'error', 'empty']),
    tags: z.array(z.string()).default([]),
    note: z.string().max(1000).default(''),
    request: caseRequestSchema
  })).max(10)
})

const handoffResultSchema = z.object({
  schemaVersion: z.literal(1),
  fileName: z.string().max(200).optional(),
  markdown: z.string().min(1).max(200000),
  typescript: z.string().max(200000)
})

interface ActiveGeneration {
  controller: AbortController
  cancelled: boolean
  feature: AIContextInput['feature']
}

function now(): string {
  return new Date().toISOString()
}

function isLoopback(urlText: string): boolean {
  try {
    const url = new URL(urlText)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  } catch {
    return false
  }
}

function parseJsonContent(content: string): unknown {
  let text = content.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AppException('AI_INVALID_OUTPUT', 'AI 返回内容不是 JSON。')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AppException('AI_INVALID_OUTPUT', 'AI 返回内容不是合法 JSON。')
  }
}

function resultSchema(feature: AIContextInput['feature']): z.ZodType<unknown> {
  if (feature === 'field-descriptions') return fieldResultSchema
  if (feature === 'cases') return caseResultSchema
  return handoffResultSchema
}

function outputInstruction(feature: AIContextInput['feature']): string {
  if (feature === 'field-descriptions') {
    return '为上下文中实际存在的 JSON 字段补全中文说明。只返回 {"schemaVersion":1,"fields":[{"path":"字段路径","description":"说明","change":"add|update|same"}]}。不得新增字段，不得修改字段路径。'
  }
  if (feature === 'cases') {
    return '根据接口契约、示例和最近用例生成请求候选用例。每个选中场景只生成 1 个候选；不要生成未选中的场景。只返回 {"schemaVersion":1,"cases":[{"name":"...","scenario":"normal|boundary|error|empty","tags":["..."],"note":"...","request":{...RequestDraft 字段...}}]}。不要生成断言，不要自动调用接口。'
  }

  const today = new Date().toLocaleDateString('sv-SE')
  const source = '上下文 cases 中每个用例包含请求快照 request、接口契约 interface 和已保存响应示例 examples。'
  return [
    '你是资深后端接口文档工程师。请根据我提供的接口信息，生成一份可直接交付前端开发和联调使用的中文 Markdown 接口文档。',
    source,
    '只能使用上下文中真实存在的接口、字段、参数、示例值和说明，不得臆造字段、枚举或状态码；不确定的枚举写「枚举待后端确认」。',
    '',
    '【输入数据格式】',
    '接口信息包含：接口中文名、完整 URL、请求参数、请求头、请求 JSON 示例、返回 JSON 示例、字段说明。',
    '如有多个接口，每个接口独立成节；同一接口的多个用例合并到同一个 H1 下，不要重复标题。',
    '',
    '【标题层级】',
    '每个接口/用例章节必须以 `# <接口中文名>接口文档` 作为 H1 标题开头；H1 只用于接口名称，便于后续筛选。',
    '不要额外输出项目总标题或第二个 H1；同一接口的多个用例共用同一个 H1。',
    'H1 下依次使用 `## 1. 接口概述`、`## 2. 请求参数`、`## 3. 响应参数`、`## 4. 数据解读/汇总示例`、`## 5. 状态码说明`、`## 6. 前端使用说明`。',
    '',
    '【输出要求】',
    `1. H1 标题：接口中文名 + 接口文档；更新时间使用 ${today}；fileName 使用「接口方法名 + 接口文档.md」，多个接口时使用「项目名 + 接口文档.md」。`,
    '2. 每个 H1 下写概述块：所属模块、更新时间。',
    '3. ## 1. 接口概述：表格，含接口名称、接口地址（路径）、完整 URL、请求方式、是否需要鉴权、Content-Type、功能说明。',
    '4. ## 2. 请求参数：先给请求头表格与请求头 JSON 示例；再给参数表（参数名/类型/必填/默认值/说明）和请求 JSON 示例。',
    '5. ## 3. 响应参数：先给响应 JSON 示例（过长字段如 base64 用「已省略」标注），再按字段分组列表说明。',
    '6. ## 4. 数据解读/汇总示例：能算的必须算（合计、分页换算、时间跨度等），用表格呈现；不能算写「无」。',
    '7. ## 5. 状态码说明：至少包含 200 和 500，说明与上下文一致。',
    '8. ## 6. 前端使用说明：分点写空态、判空、类型转换、联动、性能等接入建议。',
    '',
    '【字段说明要求】',
    '- 字段按业务含义分组，如标识与基本信息、状态、时间、人员、扩展预留字段；每组一张表。',
    '- 明确类型：string / int / number[] / object[] / null 可能。',
    '- 字符串型数字（如 "4906"）必须标注「字符串类型，计算前需转 Number」。',
    '- 可能为 null 的字段标注「可空」并说明展示时判空。',
    '- 字段名疑似拼写错误（如 provice / leadMoble）标注「疑为拼写错误，按接口实际字段对接」。',
    '- 明显异常的数据（如数据源长期未更新却标「正常」）要提示业务风险。',
    '',
    '【风格】',
    '中文、简洁、表格为主，不写空话；数字必须可追溯；只基于上下文示例描述，不臆造字段或枚举。',
    '',
    '只返回以下 JSON，不要用 ```markdown 包裹整个 Markdown：',
    '{"schemaVersion":1,"fileName":"getDataHealth接口文档.md","markdown":"完整 Markdown 文档","typescript":"可选的 TypeScript 类型或空字符串"}'
  ].join('\n')
}

export class AIService {
  private readonly active = new Map<string, ActiveGeneration>()

  constructor(
    private readonly settings: SettingsService,
    private readonly secrets: AISecretProvider,
    private readonly contextBuilder: AIContextBuilder,
    private readonly provider: AIProvider,
    private readonly events: AIServiceEvents,
    private readonly cacheDir?: string
  ) {}

  async getConfig(): Promise<AIConfigPublic> {
    const prefs = await this.settings.get()
    const key = await this.secrets.get()
    return {
      ...prefs.ai,
      hasApiKey: Boolean(key),
      keyStorageMode: key ? await this.secrets.mode() : 'none'
    }
  }

  async revealApiKey(): Promise<{ apiKey: string }> {
    return { apiKey: await this.secrets.get() }
  }

  async updateConfig(input: AIConfig & { apiKey?: string | null }): Promise<AIConfigPublic> {
    const baseUrl = input.baseUrl.trim()
    const existingKey = await this.secrets.get()
    const keyAfter = input.apiKey === undefined ? existingKey : (input.apiKey ?? '').trim()
    if (input.enabled) {
      if (!baseUrl || !input.model.trim()) throw new AppException('AI_NOT_CONFIGURED', '启用 AI 前请填写 Base URL 与模型名。')
      if (!isLoopback(baseUrl) && !keyAfter) {
        throw new AppException('AI_NOT_CONFIGURED', '云端 AI 需要 API Key；本地 Ollama 可留空。')
      }
    }
    if (input.apiKey !== undefined) {
      if (!input.apiKey?.trim()) await this.secrets.clear()
      else await this.secrets.set(input.apiKey)
    }
    const next = await this.settings.update({
      ai: {
        enabled: input.enabled,
        baseUrl,
        model: input.model.trim(),
        timeoutMs: input.timeoutMs
      }
    })
    return {
      ...next.ai,
      hasApiKey: Boolean(await this.secrets.get()),
      keyStorageMode: (await this.secrets.get()) ? await this.secrets.mode() : 'none'
    }
  }

  private async configured(requireEnabled = true): Promise<{ config: AIConfig; key: string }> {
    const prefs = await this.settings.get()
    if (requireEnabled && !prefs.ai.enabled) throw new AppException('AI_NOT_CONFIGURED', 'AI 未启用，请先在设置中启用 AI。')
    if (!prefs.ai.baseUrl || !prefs.ai.model) throw new AppException('AI_NOT_CONFIGURED', '请先配置 AI Base URL 与模型名。')
    const key = await this.secrets.get()
    if (!key && !isLoopback(prefs.ai.baseUrl)) throw new AppException('AI_NOT_CONFIGURED', '请先配置 AI API Key。')
    return { config: prefs.ai, key }
  }

  async testConnection(): Promise<{ latencyMs: number }> {
    const { config, key } = await this.configured(false)
    const started = Date.now()
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.provider.chat(
          { baseUrl: config.baseUrl, apiKey: key, model: config.model, timeoutMs: config.timeoutMs },
          [{ role: 'user', content: '只回复 OK' }],
          new AbortController().signal,
          () => undefined,
          { stream: false, maxTokens: 32 }
        )
        // A 2xx response proves URL, auth and model are accepted. Some
        // reasoning models return empty content when a tiny token budget is
        // consumed by reasoning; that must not be reported as a connection
        // failure.
        void result
        return { latencyMs: Date.now() - started }
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
    throw lastError instanceof Error ? lastError : new AppException('AI_NETWORK', 'AI 连接失败。')
  }

  async listModels(): Promise<string[]> {
    const { config, key } = await this.configured(false)
    if (!this.provider.listModels) throw new AppException('UNSUPPORTED', '当前 AI 客户端不支持获取模型列表。')
    return this.provider.listModels(
      { baseUrl: config.baseUrl, apiKey: key, model: config.model, timeoutMs: config.timeoutMs },
      new AbortController().signal
    )
  }

  async previewContext(input: AIContextInput): Promise<BuiltAIContext> {
    const prefs = await this.settings.get()
    return this.contextBuilder.build(input, prefs.ai.model || 'unconfigured', PROMPT_VERSION[input.feature])
  }

  private cacheKey(input: AIGenerateInput, model: string, baseUrl: string): string {
    return createHash('sha256')
      .update(`${input.feature}\n${baseUrl}\n${model}\n${PROMPT_VERSION[input.feature]}\n${input.contextHash}`)
      .digest('hex')
  }

  private async readCache(input: AIGenerateInput, model: string, baseUrl: string): Promise<{ result: AICompletionResult; meta: AIMeta } | null> {
    if (!this.cacheDir || input.feature !== 'case-doc') return null
    try {
      const raw = await fs.readFile(join(this.cacheDir, 'ai-cache', `${this.cacheKey(input, model, baseUrl)}.json`), 'utf8')
      const value = JSON.parse(raw) as { result: AICompletionResult; meta: AIMeta }
      if (!value?.result || !value?.meta) return null
      return value
    } catch {
      return null
    }
  }

  private async writeCache(input: AIGenerateInput, model: string, baseUrl: string, result: AICompletionResult, meta: AIMeta): Promise<void> {
    if (!this.cacheDir || input.feature !== 'case-doc') return
    try {
      const dir = join(this.cacheDir, 'ai-cache')
      await fs.mkdir(dir, { recursive: true, mode: 0o700 })
      const file = join(dir, `${this.cacheKey(input, model, baseUrl)}.json`)
      await fs.writeFile(file, JSON.stringify({ result, meta }), { encoding: 'utf8', mode: 0o600 })
      await fs.chmod(file, 0o600).catch(() => undefined)
      const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'))
      if (files.length > 50) {
        const entries = await Promise.all(files.map(async (name) => ({
          name,
          mtime: (await fs.stat(join(dir, name))).mtimeMs
        })))
        entries.sort((a, b) => a.mtime - b.mtime)
        for (const item of entries.slice(0, entries.length - 50)) {
          await fs.unlink(join(dir, item.name)).catch(() => undefined)
        }
      }
    } catch {
      // A cache write failure must never fail a successful generation.
    }
  }

  async generate(input: AIGenerateInput): Promise<{ requestId: string }> {
    const { config, key } = await this.configured()
    if (this.active.size > 0) throw new AppException('CONFLICT', '已有 AI 生成任务进行中，请等待完成或取消。')
    const context = await this.contextBuilder.build(input, config.model, PROMPT_VERSION[input.feature])
    if (context.hash !== input.contextHash) {
      throw new AppException('CONFLICT', 'AI 上下文已变化，请重新预览后再生成。')
    }
    if (input.feature === 'field-descriptions' && context.allowedFieldPaths.length === 0) {
      throw new AppException('VALIDATION', '当前内容没有可描述的 JSON 字段。')
    }
    const cached = await this.readCache(input, config.model, config.baseUrl)
    if (cached) {
      const requestId = randomUUID()
      this.events.completed({
        requestId,
        feature: input.feature,
        result: cached.result,
        meta: { ...cached.meta, cached: true }
      })
      return { requestId }
    }
    const requestId = randomUUID()
    const active: ActiveGeneration = { controller: new AbortController(), cancelled: false, feature: input.feature }
    this.active.set(requestId, active)
    void this.run(requestId, input, context, config, key, active)
    return { requestId }
  }

  cancel(requestId: string): boolean {
    const active = this.active.get(requestId)
    if (!active) return false
    active.cancelled = true
    active.controller.abort()
    return true
  }

  private messages(input: AIGenerateInput, context: BuiltAIContext): AIProviderMessage[] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `功能：${input.feature}`,
          `要求：${outputInstruction(input.feature)}`,
          `上下文（已脱敏，不包含源码）：\n${JSON.stringify(context.preview, null, 2)}`
        ].join('\n\n')
      }
    ]
  }

  private async run(
    requestId: string,
    input: AIGenerateInput,
    context: BuiltAIContext,
    config: AIConfig,
    key: string,
    active: ActiveGeneration
  ): Promise<void> {
    let hadDelta = false
    try {
      const call = async (): Promise<AIProviderResult> => this.provider.chat(
        { baseUrl: config.baseUrl, apiKey: key, model: config.model, timeoutMs: config.timeoutMs },
        this.messages(input, context),
        active.controller.signal,
        (delta) => {
          hadDelta = true
          if (!active.cancelled) this.events.stream({ requestId, delta })
        }
      )
      let response: AIProviderResult
      try {
        response = await call()
      } catch (error) {
        if (!(error instanceof AppException) || !error.retryable || hadDelta || active.cancelled) throw error
        response = await call()
      }
      if (active.cancelled) return
      const parsed = resultSchema(input.feature).parse(parseJsonContent(response.content))
      const result = this.validateResult(input.feature, parsed, context, input)
      const meta: AIMeta = {
        source: 'ai',
        provider: 'openai-compatible',
        model: config.model,
        promptVersion: PROMPT_VERSION[input.feature],
        generatedAt: now(),
        contextHash: context.hash,
        usage: response.usage
      }
      await this.writeCache(input, config.model, config.baseUrl, result, meta)
      this.events.completed({ requestId, feature: input.feature, result, meta })
    } catch (error) {
      if (active.cancelled) {
        this.events.cancelled({ requestId })
      } else {
        this.events.failed({ requestId, error: error instanceof z.ZodError ? {
          code: 'AI_INVALID_OUTPUT',
          message: 'AI 返回结构不符合要求。',
          details: { issues: error.issues.map((issue) => issue.path.join('.')) }
        } : toAppError(error) })
      }
    } finally {
      this.active.delete(requestId)
    }
  }

  private validateResult(feature: AIContextInput['feature'], parsed: unknown, context: BuiltAIContext, input: AIGenerateInput): AICompletionResult {
    if (feature === 'field-descriptions') {
      const result = parsed as AIFieldDescriptionResult
      const allowed = new Set(context.allowedFieldPaths)
      for (const field of result.fields) {
        if (!allowed.has(field.path)) {
          throw new AppException('AI_INVALID_OUTPUT', `AI 返回了上下文中不存在的字段：${field.path}`)
        }
      }
      return result
    }
    if (feature === 'cases') {
      const result = parsed as AICaseResult
      const allowed = new Set(input.feature === 'cases' ? input.scenarios : [])
      const usedScenarios = new Set<AICaseScenario>()
      const cases: typeof result.cases = []
      for (const candidate of result.cases) {
        if (!allowed.has(candidate.scenario) || usedScenarios.has(candidate.scenario)) continue
        usedScenarios.add(candidate.scenario)
        cases.push(candidate)
        if (cases.length >= 8) break
      }
      if (cases.length === 0) {
        throw new AppException('AI_INVALID_OUTPUT', 'AI 没有返回所选场景的用例。')
      }
      return { ...result, cases }
    }
    return parsed as AIHandoffResult
  }
}

