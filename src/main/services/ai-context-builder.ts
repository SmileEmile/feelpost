import { createHash } from 'node:crypto'
import type {
  AIContextInput,
  AIContextPreview,
  CaseDetail,
  InterfaceDetail,
  ParamRow,
  RequestDraft,
  ResponseExample
} from '@shared/contract'
import { AppException } from '../errors'
import { ProjectService } from './project-service'
import { CatalogService } from './catalog-service'
import { ExampleService } from './example-service'
import { CaseService } from './case-service'

const MAX_CONTEXT_CHARS = 48000
const MAX_BODY_CHARS = 12000
const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-auth-token', 'token', 'x-api-key', 'api-key'
])
const SENSITIVE_QUERY = new Set(['token', 'access_token', 'api_key', 'key', 'signature'])

export interface BuiltAIContext extends AIContextPreview {
  allowedFieldPaths: string[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectPaths(value: unknown, prefix = '', result: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (value.length && isRecord(value[0])) collectPaths(value[0], `${prefix}[]`, result)
    return result
  }
  if (!isRecord(value)) return result
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key
    result.push(next)
    if (Array.isArray(child)) {
      if (child.length && isRecord(child[0])) collectPaths(child[0], `${next}[]`, result)
    } else if (isRecord(child)) {
      collectPaths(child, next, result)
    }
  }
  return result
}

function redactRows(rows: ParamRow[] | undefined, location: 'header' | 'cookie' | 'query', prefix: string, redactions: string[]): void {
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    const lower = key.toLowerCase()
    const sensitive = location === 'header'
      ? SENSITIVE_HEADERS.has(lower)
      : location === 'query'
        ? SENSITIVE_QUERY.has(lower)
        : true
    if (sensitive) {
      row.value = '***'
      redactions.push(`${prefix}.${key}`)
    }
  }
}

function redactDraft(draft: RequestDraft | undefined, prefix: string, redactions: string[]): RequestDraft | undefined {
  if (!draft) return undefined
  const copy = clone(draft)
  redactRows(copy.headers, 'header', `${prefix}.headers`, redactions)
  redactRows(copy.cookies, 'cookie', `${prefix}.cookies`, redactions)
  redactRows(copy.query, 'query', `${prefix}.query`, redactions)
  for (const key of Object.keys(copy.pathParams ?? {})) {
    if (SENSITIVE_QUERY.has(key.toLowerCase())) {
      copy.pathParams[key] = '***'
      redactions.push(`${prefix}.pathParams.${key}`)
    }
  }
  if (copy.requestUrl) {
    try {
      const base = 'http://redacted.local'
      const url = new URL(copy.requestUrl, base)
      for (const key of Array.from(url.searchParams.keys())) {
        if (SENSITIVE_QUERY.has(key.toLowerCase())) {
          url.searchParams.set(key, '***')
          redactions.push(`${prefix}.requestUrl.${key}`)
        }
      }
      copy.requestUrl = copy.requestUrl.startsWith('http')
        ? url.toString()
        : `${url.pathname}${url.search}${url.hash}`
    } catch {
      // ignore invalid URL
    }
  }
  if (typeof copy.bodyRaw === 'string' && copy.bodyRaw.length > MAX_BODY_CHARS) {
    copy.bodyRaw = `${copy.bodyRaw.slice(0, MAX_BODY_CHARS)}\n…（已截断）`
  }
  return copy
}

function redactExample(example: ResponseExample, prefix: string, redactions: string[]): ResponseExample {
  const copy = clone(example)
  if (Array.isArray(copy.headers)) {
    copy.headers = copy.headers.map(([key, value]) => {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        redactions.push(`${prefix}.headers.${key}`)
        return [key, '***']
      }
      return [key, value]
    })
  }
  if (copy.body.length > MAX_BODY_CHARS) copy.body = `${copy.body.slice(0, MAX_BODY_CHARS)}\n…（已截断）`
  return copy
}

function interfaceContract(detail: InterfaceDetail): Record<string, unknown> {
  return {
    id: detail.id,
    method: detail.method,
    path: detail.path,
    name: detail.name,
    summary: detail.summaryText,
    module: detail.module,
    controller: detail.controller,
    params: detail.params,
    body: detail.body
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export class AIContextBuilder {
  constructor(
    private readonly projects: ProjectService,
    private readonly catalog: CatalogService,
    private readonly examples: ExampleService,
    private readonly cases: CaseService
  ) {}

  private async interfaceDetail(projectId: string, interfaceId: string): Promise<InterfaceDetail> {
    return this.catalog.get(projectId, interfaceId)
  }

  private async example(projectId: string, interfaceId: string, exampleId?: string): Promise<ResponseExample> {
    const list = await this.examples.list(projectId, interfaceId)
    const example = exampleId ? list.find((item) => item.id === exampleId) : list[0]
    if (!example) throw new AppException('NOT_FOUND', '没有可用于 AI 的响应示例。')
    return example
  }

  private async recentCases(projectId: string, interfaceId: string): Promise<CaseDetail[]> {
    const list = await this.cases.list(projectId)
    // Do not feed previously generated AI cases back into the next generation;
    // otherwise repeated runs keep expanding the candidate set.
    const selected = list
      .filter((item) => item.apiId === interfaceId && !item.aiMeta)
      .slice(0, 3)
    const result: CaseDetail[] = []
    for (const item of selected) {
      try {
        result.push(await this.cases.get(projectId, item.id))
      } catch {
        // Ignore a case that disappeared while building context.
      }
    }
    return result
  }

  async build(input: AIContextInput, model: string, promptVersion: string): Promise<BuiltAIContext> {
    await this.projects.get(input.projectId)
    const redactions: string[] = []
    let payload: Record<string, unknown>
    let allowedFieldPaths: string[] = []

    if (input.feature === 'field-descriptions') {
      const detail = await this.interfaceDetail(input.projectId, input.interfaceId)
      if (input.target === 'request') {
        const draft = input.draft ?? detail.requestDraft
        const redacted = redactDraft(draft, 'request', redactions)
        payload = {
          feature: input.feature,
          target: 'request',
          interface: interfaceContract(detail),
          request: redacted ?? null
        }
        if (draft?.bodyRaw) {
          try { allowedFieldPaths = collectPaths(JSON.parse(draft.bodyRaw)) } catch { allowedFieldPaths = [] }
        }
      } else {
        const example = await this.example(input.projectId, input.interfaceId, input.exampleId)
        const redacted = redactExample(example, 'example', redactions)
        payload = {
          feature: input.feature,
          target: 'response',
          interface: interfaceContract(detail),
          example: {
            id: redacted.id,
            name: redacted.name,
            status: redacted.status,
            headers: redacted.headers,
            body: redacted.body
          }
        }
        try { allowedFieldPaths = collectPaths(JSON.parse(redacted.body)) } catch { allowedFieldPaths = [] }
      }
    } else if (input.feature === 'cases') {
      const detail = await this.interfaceDetail(input.projectId, input.interfaceId)
      const examples = await this.examples.list(input.projectId, input.interfaceId)
      const recent = await this.recentCases(input.projectId, input.interfaceId)
      payload = {
        feature: input.feature,
        scenarios: input.scenarios,
        interface: interfaceContract(detail),
        examples: examples.slice(0, 2).map((item, index) => redactExample(item, `examples[${index}]`, redactions)),
        recentCases: recent.map((item, index) => {
          const snapshot = redactDraft(item.requestSnapshot, `recentCases[${index}].request`, redactions)
          return { name: item.name, tags: item.tags, note: item.note, request: snapshot }
        })
      }
    } else {
      const ids = [...new Set(input.caseIds)].filter(Boolean)
      if (ids.length === 0) throw new AppException('VALIDATION', '请至少选择一个用例。')
      if (ids.length > 50) throw new AppException('VALIDATION', 'AI 用例文档一次最多选择 50 个用例。')
      const entries = []
      for (const caseId of ids) {
        const item = await this.cases.get(input.projectId, caseId)
        const detail = await this.interfaceDetail(input.projectId, item.apiId)
        const examples = await this.examples.list(input.projectId, item.apiId)
        entries.push({
          name: item.name,
          tags: item.tags,
          note: item.note,
          request: redactDraft(item.requestSnapshot, `cases[${caseId}].request`, redactions),
          interface: interfaceContract(detail),
          examples: examples.slice(0, 2).map((example, index) => redactExample(example, `cases[${caseId}].examples[${index}]`, redactions))
        })
      }
      payload = { feature: input.feature, cases: entries }
    }

    let serialized = stable(payload)
    let truncated = serialized.length > MAX_CONTEXT_CHARS
    if (truncated) {
      // Preserve the contract and drop the largest optional response bodies.
      for (const entry of (payload.interfaces as Array<{ examples?: ResponseExample[] }> | undefined) ?? []) {
        for (const example of entry.examples ?? []) example.body = `${example.body.slice(0, 2000)}\n…（已截断）`
      }
      for (const entry of (payload.cases as Array<{
        request?: { bodyRaw?: string }
        examples?: ResponseExample[]
      }> | undefined) ?? []) {
        if (typeof entry.request?.bodyRaw === 'string' && entry.request.bodyRaw.length > 4000) {
          entry.request.bodyRaw = `${entry.request.bodyRaw.slice(0, 4000)}\n…（已截断）`
        }
        for (const example of entry.examples ?? []) {
          if (example.body.length > 2000) example.body = `${example.body.slice(0, 2000)}\n…（已截断）`
        }
      }
      serialized = stable(payload)
    }
    if (serialized.length > MAX_CONTEXT_CHARS) {
      throw new AppException('VALIDATION', 'AI 上下文过大，请缩小接口范围或减少示例内容。')
    }

    const inputForHash = { ...(input as unknown as Record<string, unknown>) }
    delete inputForHash.contextHash
    delete inputForHash.draft
    const hash = createHash('sha256').update(stable({ input: inputForHash, model, promptVersion, payload })).digest('hex')
    return {
      hash,
      feature: input.feature,
      estimatedTokens: Math.ceil(serialized.length / 4),
      preview: payload,
      redactions: [...new Set(redactions)],
      truncated,
      allowedFieldPaths: [...new Set(allowedFieldPaths)]
    }
  }
}
