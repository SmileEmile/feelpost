import type {
  CaseDetail,
  Environment,
  EnvironmentParams,
  InterfaceDetail,
  ParamField,
  ParamRow,
  ProjectDetail,
  ResponseExample
} from '@shared/contract'
import { mergeParams, type EffectiveParams, type SourcedRow } from '@core/rules/merge'
import { AppException } from '../errors'
import { ProjectService } from './project-service'
import { CatalogService } from './catalog-service'
import { ExampleService } from './example-service'
import { CaseService } from './case-service'

interface BuiltDoc {
  markdown: string
  fileName: string
  total?: number
  offset?: number
  hasMore?: boolean
  nextOffset?: number
}

function cell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
}

function fence(body: string, lang = ''): string {
  let marker = '```'
  while (body.includes(marker)) marker += '`'
  return `${marker}${lang}\n${body}\n${marker}`
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'FeelPost'
}

function statusLabel(status: string): string {
  if (status === 'registered') return '已注册'
  if (status === 'changed') return '已变更'
  return '已归档'
}

function indexField(field: ParamField, prefix: string): string {
  return prefix ? `${prefix}.${field.name}` : field.name
}

function flattenFields(fields: ParamField[], prefix = ''): ParamField[] {
  const result: ParamField[] = []
  for (const field of fields) {
    const path = indexField(field, prefix)
    result.push({ ...field, path })
    if (field.children?.length) result.push(...flattenFields(field.children, path))
  }
  return result
}

function paramTable(fields: ParamField[]): string {
  if (fields.length === 0) return '_无_'
  const rows = fields.map((field) => `| ${cell(field.path)} | ${cell(field.type)} | ${field.required ? '是' : '否'} | ${cell(field.description || '')} |`)
  return ['| 参数名 | 类型 | 必填 | 说明 |', '| --- | --- | --- | --- |', ...rows].join('\n')
}

function sourceLabel(source: SourcedRow['source']): string {
  if (source === 'global') return '全局'
  if (source === 'env') return '环境'
  if (source === 'interface') return '接口'
  return '自动'
}

function sourcedTable(rows: SourcedRow[], empty = '_无_'): string {
  if (rows.length === 0) return empty
  return [
    '| 参数名 | 参数值 | 来源 |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${cell(row.key)} | ${cell(row.value)} | ${sourceLabel(row.source)} |`)
  ].join('\n')
}

function environmentParamsTable(params: EnvironmentParams): string {
  const rows: Array<[string, string, string]> = []
  for (const row of params.headers) if (row.enabled && row.key.trim()) rows.push(['Header', row.key, row.value])
  for (const row of params.query) if (row.enabled && row.key.trim()) rows.push(['Query', row.key, row.value])
  for (const row of params.cookies) if (row.enabled && row.key.trim()) rows.push(['Cookie', row.key, row.value])
  for (const row of params.body) if (row.enabled && row.key.trim()) rows.push(['Body', row.key, row.value])
  if (rows.length === 0) return '_无_'
  return ['| 类型 | 参数名 | 参数值 |', '| --- | --- | --- |', ...rows.map(([type, key, value]) => `| ${type} | ${cell(key)} | ${cell(value)} |`)].join('\n')
}

function effectiveFor(detail: InterfaceDetail, project: ProjectDetail, env?: Environment): EffectiveParams {
  const draft = detail.requestDraft
  return mergeParams({
    global: project.globalParams,
    env: env?.params ?? { headers: [], query: [], cookies: [], body: [] },
    draft: {
      query: draft?.query ?? detail.params.query.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true })),
      headers: draft?.headers ?? detail.params.headers.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true })),
      cookies: draft?.cookies ?? detail.params.cookies.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true })),
      bodyRaw: requestBody(detail)
    }
  })
}

function sampleValue(field: ParamField): unknown {
  if (field.children?.length) {
    return Object.fromEntries(field.children.map((child) => [child.name, sampleValue(child)]))
  }
  if (['Integer', 'int', 'Long', 'long', 'Double', 'double', 'Float', 'float'].includes(field.type)) return 0
  if (['Boolean', 'boolean'].includes(field.type)) return false
  if (field.type === 'Array' || field.type.startsWith('List<')) return []
  return ''
}

function sampleBody(fields: ParamField[]): string {
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field.name, sampleValue(field)])), null, 2)
}

function bodyMarkdown(body: { type: string; fields: ParamField[] } | null): string {
  if (!body) return '_无请求体_'
  return paramTable(flattenFields(body.fields))
}

function prettyBody(text: string): { text: string; language: string } {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), language: 'json' }
  } catch {
    return { text, language: 'text' }
  }
}

function responseFieldTable(example: ResponseExample): string {
  const rows = Object.entries(example.fieldDescriptions ?? {}).filter(([, value]) => value.trim())
  if (rows.length === 0) return ''
  return [
    '| 字段 | 说明 |',
    '| --- | --- |',
    ...rows.map(([field, description]) => `| ${cell(field)} | ${cell(description)} |`)
  ].join('\n')
}

function responseExampleBlock(example: ResponseExample, level: number): string {
  const content = prettyBody(example.body)
  const heading = '#'.repeat(level)
  const noteHeading = '#'.repeat(level + 1)
  const notes = responseFieldTable(example)
  return [
    `${heading} ${example.name}（${example.status}）`,
    '',
    fence(content.text, content.language),
    notes ? `\n${noteHeading} 字段描述\n\n${notes}` : ''
  ].join('\n')
}

function draftQuery(detail: InterfaceDetail): ParamRow[] {
  return detail.requestDraft?.query ?? detail.params.query.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true }))
}

function draftHeaders(detail: InterfaceDetail): ParamRow[] {
  return detail.requestDraft?.headers ?? detail.params.headers.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true }))
}

function draftCookies(detail: InterfaceDetail): ParamRow[] {
  return detail.requestDraft?.cookies ?? detail.params.cookies.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true }))
}

function requestBody(detail: InterfaceDetail): string {
  const draft = detail.requestDraft
  if (draft) {
    if (draft.bodyType === 'none') return ''
    if (draft.bodyType === 'raw') return draft.bodyRaw
    if (draft.bodyType === 'urlencoded') {
      return (draft.formRows ?? []).filter((row) => row.enabled && row.key.trim()).map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&')
    }
    if (draft.bodyType === 'form-data') {
      return (draft.formRows ?? []).filter((row) => row.enabled && row.key.trim()).map((row) => `${row.key}=${row.value}`).join('\n')
    }
  }
  if (!detail.body) return ''
  return sampleBody(detail.body.fields)
}

function isAbsoluteHttp(value: string): boolean {
  return /^\/?https?:\/\//i.test(value.trim())
}

function normalizeHttpPath(value: string): string {
  return value.trim().replace(/^\/(?=https?:\/\/)/i, '')
}

function requestMethodOf(detail: InterfaceDetail): string {
  return detail.requestDraft?.requestMethod ?? detail.method
}

function requestUrlOf(detail: InterfaceDetail): string {
  return detail.requestDraft?.requestUrl?.trim() || detail.path
}

function curlFor(detail: InterfaceDetail, baseUrl: string, effective?: EffectiveParams): string {
  const draft = detail.requestDraft
  const pathParams = draft?.pathParams ?? {}
  const target = requestUrlOf(detail)
  const absolute = isAbsoluteHttp(target)
  const path = (absolute ? normalizeHttpPath(target) : target).replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(pathParams[key] ?? `<${key}>`))
  const query = new URLSearchParams()
  if (effective) {
    for (const row of effective.query) if (row.enabled && row.key.trim()) query.append(row.key, row.value)
  } else {
    for (const row of draftQuery(detail)) if (row.enabled && row.key.trim()) query.append(row.key, row.value)
  }
  const url = absolute
    ? `${path}${query.toString() ? `${path.includes('?') ? '&' : '?'}${query.toString()}` : ''}`
    : `${baseUrl.replace(/\/+$/, '')}${path}${query.toString() ? `?${query.toString()}` : ''}`
  const lines = [`curl -X ${requestMethodOf(detail)} '${url}'`]
  const headers = effective?.headers ?? draftHeaders(detail).map((row) => ({ ...row, source: 'interface' as const, overrides: 0 }))
  for (const row of headers) if (row.enabled && row.key.trim()) lines.push(`  -H '${row.key}: ${row.value}'`)
  const cookies = (effective?.cookies ?? draftCookies(detail).map((row) => ({ ...row, source: 'interface' as const, overrides: 0 }))).filter((row) => row.enabled && row.key.trim())
  if (cookies.length > 0) lines.push(`  -H 'Cookie: ${cookies.map((row) => `${row.key}=${row.value}`).join('; ')}'`)
  const body = effective?.bodyText || requestBody(detail)
  if (body) lines.push(`  --data-raw '${body.replace(/'/g, `'\\''`)}'`)
  return lines.join(' \\\n')
}

function caseParams(title: string, rows: ParamRow[]): string {
  const visible = rows.filter((row) => row.enabled && row.key.trim())
  if (visible.length === 0) return `### ${title}\n\n_无_`
  return `### ${title}\n\n| 参数名 | 参数值 |\n| --- | --- |\n${visible.map((row) => `| ${cell(row.key)} | ${cell(row.value)} |`).join('\n')}`
}

export class DocService {
  private readonly projects: ProjectService
  private readonly catalog: CatalogService
  private readonly examples: ExampleService
  private readonly cases: CaseService

  constructor(dataDir: string) {
    this.projects = new ProjectService(dataDir)
    this.catalog = new CatalogService(dataDir)
    this.examples = new ExampleService(dataDir)
    this.cases = new CaseService(dataDir)
  }

  async buildInterface(projectId: string, interfaceId: string, envId?: string): Promise<BuiltDoc> {
    const project = await this.projects.get(projectId)
    const detail = await this.catalog.get(projectId, interfaceId)
    const env = project.environments.find((item) => item.id === envId)
      ?? project.environments.find((item) => item.isDefault)
      ?? project.environments[0]
    const baseUrl = env?.baseUrl ?? ''
    const examples = await this.examples.list(projectId, interfaceId)
    const effective = effectiveFor(detail, project, env)
    const fields = detail.body ? flattenFields(detail.body.fields) : []
    const body = requestBody(detail)
    const bodyExample = detail.requestDraft ? body : (detail.body ? sampleBody(detail.body.fields) : '')

    const responseSections = examples.length
      ? examples.map((example) => responseExampleBlock(example, 3)).join('\n\n')
      : '_暂无已保存的响应示例。_'

    const markdown = [
      `# ${detail.name}`,
      '',
      `> 状态：${statusLabel(detail.status)} · 解析完整度：${detail.parseQuality === 'full' ? '完整' : '部分解析'}`,
      `> 模块：${detail.module || '未分组'} · 控制器：${detail.controller || '手工接口'}`,
      '',
      '## 1. 接口清单',
      '',
      '| 名称 | 方法 | 路径 | 状态 |',
      '| --- | --- | --- | --- |',
      `| ${cell(detail.name)} | ${requestMethodOf(detail)} | ${cell(isAbsoluteHttp(requestUrlOf(detail)) ? normalizeHttpPath(requestUrlOf(detail)) : requestUrlOf(detail))} | ${statusLabel(detail.status)} |`,
      '',
      '## 2. 方法 + URL',
      '',
      `\`${requestMethodOf(detail)} ${isAbsoluteHttp(requestUrlOf(detail)) ? normalizeHttpPath(requestUrlOf(detail)) : requestUrlOf(detail)}\``,
      '',
      isAbsoluteHttp(requestUrlOf(detail))
        ? `完整地址：\`${normalizeHttpPath(requestUrlOf(detail))}\``
        : baseUrl ? `完整地址：\`${baseUrl.replace(/\/+$/, '')}${requestUrlOf(detail)}\`` : '_未配置环境地址_',
      env ? `环境：${env.name}` : '',
      '',
      '## 3. 参数表',
      '',
      '### Path 参数',
      '',
      paramTable(detail.params.path),
      '',
      '### Query 参数',
      '',
      paramTable(detail.params.query),
      '',
      '### Header 参数',
      '',
      paramTable(detail.params.headers),
      '',
      '### Cookie 参数',
      '',
      paramTable(detail.params.cookies),
      '',
      '### 请求体字段',
      '',
      bodyMarkdown(detail.body),
      '',
      '## 4. 请求示例',
      '',
      fence(curlFor(detail, baseUrl, effective), 'bash'),
      bodyExample ? `\n${fence(bodyExample, 'json')}` : '',
      '',
      '## 5. 响应示例',
      '',
      responseSections,
      '',
      '## 6. 字段说明',
      '',
      fields.length
        ? ['| 字段 | 类型 | 必填 | 说明 |', '| --- | --- | --- | --- |', ...fields.map((field) => `| ${cell(field.path)} | ${cell(field.type)} | ${field.required ? '是' : '否'} | ${cell(field.description || '')} |`)].join('\n')
        : '_该接口没有请求体字段说明。_',
      '',
      detail.summaryText ? `> 接口说明：${detail.summaryText}` : '',
      ''
    ].join('\n')

    return {
      markdown: markdown.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
      fileName: `${safeFileName(project.name)}-${safeFileName(detail.name)}.md`
    }
  }

  async buildProject(
    projectId: string,
    scope: 'active' | 'all',
    includeManual: boolean,
    envId?: string,
    filter?: { name?: string; method?: string; path?: string; status?: string; module?: string },
    pagination?: { limit?: number; offset?: number }
  ): Promise<BuiltDoc> {
    const project = await this.projects.get(projectId)
    const env = project.environments.find((item) => item.id === envId)
      ?? project.environments.find((item) => item.isDefault)
      ?? project.environments[0]
    const baseUrl = env?.baseUrl ?? ''
    const stored = await this.catalog.readAll(projectId)
    const selected = stored
      .filter((item) => includeManual || item.source !== 'manual')
      .filter((item) => scope === 'all' || item.status !== 'archived')
      .sort((a, b) => `${a.module || ''}/${a.path}`.localeCompare(`${b.module || ''}/${b.path}`))

    const entries: Array<{ detail: InterfaceDetail; examples: Awaited<ReturnType<ExampleService['list']>>; effective: EffectiveParams }> = []
    for (const item of selected) {
      const detail = await this.catalog.get(projectId, item.id)
      entries.push({
        detail,
        examples: await this.examples.list(projectId, item.id),
        effective: effectiveFor(detail, project, env)
      })
    }
    const filteredEntries = entries.filter(({ detail }) => {
      if (filter?.name && !detail.name.toLowerCase().includes(filter.name.toLowerCase())) return false
      if (filter?.method && detail.method !== filter.method) return false
      if (filter?.path && !detail.path.toLowerCase().includes(filter.path.toLowerCase())) return false
      if (filter?.status && detail.status !== filter.status) return false
      if (filter?.module && (detail.module || '') !== filter.module) return false
      return true
    })
    entries.splice(0, entries.length, ...filteredEntries)

    const total = entries.length
    const offset = Math.max(0, pagination?.offset ?? 0)
    const limit = pagination?.limit && pagination.limit > 0
      ? Math.min(100, Math.max(1, pagination.limit))
      : Math.max(1, total)
    const pageEntries = entries.slice(offset, offset + limit)
    const hasMore = offset + pageEntries.length < total
    const nextOffset = offset + pageEntries.length

    if (entries.length === 0) {
      const empty = [
        `# ${project.name} 接口文档`,
        '',
        '_当前筛选条件下没有接口。_',
        '',
        ''
      ].join('\n')
      return {
        markdown: empty,
        fileName: `${safeFileName(project.name)}-接口文档.md`,
        total,
        offset,
        hasMore: false,
        nextOffset: offset
      }
    }

    const environmentSection = [
      '## 环境与全局参数',
      '',
      '| 配置 | 值 |',
      '| --- | --- |',
      `| 当前环境 | ${cell(env?.name ?? '未配置')} |`,
      `| Base URL | ${cell(baseUrl || '未配置')} |`,
      `| TLS 校验 | ${env?.verifyTls === false ? '关闭' : '开启'} |`,
      `| 代理 | ${cell(env?.proxy || '未配置')} |`,
      `| 超时 | ${env ? `${env.timeoutMs} ms` : '未配置'} |`,
      '',
      '### 全局参数',
      '',
      environmentParamsTable(project.globalParams),
      '',
      '### 环境参数',
      '',
      environmentParamsTable(env?.params ?? { headers: [], query: [], cookies: [], body: [] })
    ]

    const interfaceSections = pageEntries.map(({ detail, examples, effective }) => {
      const target = requestUrlOf(detail)
      const absolute = isAbsoluteHttp(target)
      const fullUrl = absolute
        ? normalizeHttpPath(target)
        : baseUrl ? `${baseUrl.replace(/\/+$/, '')}${target}` : target
      const body = effective.bodyText || requestBody(detail)
      const responseSections = examples.length
        ? examples.map((example) => responseExampleBlock(example, 4)).join('\n\n')
        : '_该接口还没有保存响应示例。_'
      return [
        `## ${detail.name}`,
        '',
        `- 请求：\`${requestMethodOf(detail)} ${absolute ? normalizeHttpPath(target) : target}\``,
        `- 完整地址：\`${fullUrl}\``,
        `- 状态：${statusLabel(detail.status)} · 模块：${detail.module || '未分组'} · 控制器：${detail.controller || '手工接口'}`,
        detail.summaryText ? `- 说明：${detail.summaryText}` : '',
        '',
        '### 参数表',
        '',
        '#### Path',
        paramTable(detail.params.path),
        '',
        '#### Query（生效）',
        sourcedTable(effective.query),
        '',
        '#### Header（生效）',
        sourcedTable(effective.headers),
        '',
        '#### Cookie（生效）',
        sourcedTable(effective.cookies),
        '',
        '#### 请求体字段',
        bodyMarkdown(detail.body),
        '',
        '### 请求示例',
        '',
        fence(curlFor(detail, baseUrl, effective), 'bash'),
        body ? `\n${fence(body, 'json')}` : '',
        '',
        '### 响应示例',
        '',
        responseSections
      ].join('\n')
    })

    const pageMarkdown = offset === 0
      ? [
          `# ${project.name} 接口文档`,
          '',
          `> 导出时间：${new Date().toLocaleString()} · 环境：${env?.name ?? '未配置'} · 范围：${scope === 'all' ? '全部接口' : '仅已注册与已变更'} · 手工接口：${includeManual ? '包含' : '不包含'} · 接口数：${total}`,
          '',
          ...environmentSection,
          '',
          ...(pageEntries.length > 0 ? interfaceSections : ['_当前筛选条件下没有接口。_']),
          ''
        ]
      : interfaceSections
    const markdown = [
      ...pageMarkdown,
      ''
    ].join('\n')

    return {
      markdown: markdown.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
      fileName: `${safeFileName(project.name)}-接口文档.md`,
      total,
      offset,
      hasMore,
      nextOffset
    }
  }

  private async interfaceInfo(projectId: string, apiId: string): Promise<{ detail: InterfaceDetail | null; examples: ResponseExample[] }> {
    let detail: InterfaceDetail | null = null
    try {
      detail = await this.catalog.get(projectId, apiId)
    } catch {
      detail = null
    }
    const examples = await this.examples.list(projectId, apiId)
    return { detail, examples }
  }

  private caseSection(item: CaseDetail, detail: InterfaceDetail | null, examples: ResponseExample[]): string {
    const snapshot = item.requestSnapshot
    const body = snapshot.bodyType === 'raw'
      ? snapshot.bodyRaw
      : (snapshot.formRows ?? []).filter((row) => row.enabled && row.key.trim()).map((row) => `${row.key}=${row.value}`).join('\n')
    const fields = detail?.body ? flattenFields(detail.body.fields) : []
    const fieldTable = fields.length
      ? ['| 字段 | 类型 | 必填 | 说明 |', '| --- | --- | --- | --- |', ...fields.map((field) => `| ${cell(field.path)} | ${cell(field.type)} | ${field.required ? '是' : '否'} | ${cell(field.description || '')} |`)].join('\n')
      : '_该接口没有请求体字段说明。_'
    const responseSections = examples.length
      ? examples.map((example) => responseExampleBlock(example, 4)).join('\n\n')
      : '_该接口还没有保存响应示例。_'
    return [
      `## ${item.name}`,
      '',
      `- 接口：${item.interfaceName}`,
      `- 请求：\`${item.method} ${normalizeHttpPath(item.path)}\``,
      `- 环境：${item.envName}（${item.baseUrl}）`,
      `- 标签：${item.tags.length ? item.tags.map((tag) => `#${tag}`).join(' ') : '无'}`,
      `- 保存时间：${new Date(item.savedAt).toLocaleString()}`,
      item.note ? `- 备注：${item.note}` : '',
      '',
      '### 请求参数',
      '',
      caseParams('Path', Object.entries(snapshot.pathParams).map(([key, value]) => ({ key, value, enabled: true }))),
      '',
      caseParams('Query', snapshot.query),
      '',
      caseParams('Headers', snapshot.headers),
      '',
      caseParams('Cookies', snapshot.cookies),
      '',
      '### 请求体',
      '',
      body ? fence(body, snapshot.bodyType === 'raw' ? 'json' : 'text') : '_无_',
      '',
      '### 请求体字段说明',
      '',
      fieldTable,
      '',
      '### 响应示例',
      '',
      responseSections,
      ''
    ].join('\n')
  }

  async buildCase(projectId: string, caseId: string): Promise<BuiltDoc> {
    const project = await this.projects.get(projectId)
    const item = await this.cases.get(projectId, caseId)
    const info = await this.interfaceInfo(projectId, item.apiId)
    const markdown = [
      `# ${item.name}`,
      '',
      `> 导出时间：${new Date().toLocaleString()} · 接口：${item.interfaceName}`,
      '',
      this.caseSection(item, info.detail, info.examples).replace(/^## [^\n]+\n\n/, ''),
      ''
    ].join('\n')

    return {
      markdown: markdown.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
      fileName: `${safeFileName(project.name)}-${safeFileName(item.name)}.md`
    }
  }

  async buildCases(projectId: string, tags?: string[], caseIds?: string[]): Promise<BuiltDoc> {
    const project = await this.projects.get(projectId)
    const summaries = await this.cases.list(projectId)
    const selected = summaries.filter((summary) =>
      caseIds?.length ? caseIds.includes(summary.id) : !tags?.length || tags.some((tag) => summary.tags.includes(tag))
    )
    if (selected.length === 0) throw new AppException('NOT_FOUND', '没有匹配所选标签的用例。')
    const sections: string[] = []
    for (const summary of selected) {
      const item = await this.cases.get(projectId, summary.id)
      const info = await this.interfaceInfo(projectId, item.apiId)
      sections.push(this.caseSection(item, info.detail, info.examples))
    }

    const tagText = tags?.length ? tags.map((tag) => `#${tag}`).join(' ') : '全部'
    const markdown = [
      `# 用例汇总 · ${project.name}`,
      '',
      `> 导出时间：${new Date().toLocaleString()} · 标签：${tagText} · 用例数：${selected.length}`,
      '',
      ...sections,
      ''
    ].join('\n')

    return {
      markdown: markdown.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
      fileName: `${safeFileName(project.name)}-用例汇总.md`
    }
  }
}

export type { BuiltDoc }
