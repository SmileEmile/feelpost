import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AIMeta,
  EffectiveParams,
  ResponseExample,
  Environment,
  HttpMethod,
  InterfaceDetail,
  ParamField,
  ParamRow,
  ProjectDetail,
  RequestBodyType,
  RequestDraft,
  SendResult
} from '@shared/contract'
import { unwrap } from './api'
import JsonEditor from './JsonEditor'
import JsonViewer from './JsonViewer'
import SpeedBadge from './SpeedBadge'
import AIFieldAssistant from './AIFieldAssistant'
import AICaseAssistant from './AICaseAssistant'
import Message from './Message'
import { highlightJson } from './json-highlight'
import { simplifyJson } from './json-utils'

interface Props {
  project: ProjectDetail
  detail: InterfaceDetail
  env: Environment
  onConfirm: () => void
  onRestore: () => void
  onRefresh: () => Promise<void>
  onCaseSaved?: () => void
  active: boolean
  aiEnabled: boolean
  notify: (message: string) => void
}

type Tab = 'headers' | 'query' | 'path' | 'body' | 'cookies' | 'effective'

const BODY_FORMATS: Array<[RequestBodyType, string]> = [
  ['none', 'none'],
  ['raw', 'raw'],
  ['form-data', 'form-data'],
  ['urlencoded', 'urlencoded'],
  ['binary', 'binary']
]

function defaultValue(type: string): unknown {
  if (['Integer', 'int', 'Long', 'long', 'Double', 'double', 'Float', 'float'].includes(type)) return 0
  if (['Boolean', 'boolean'].includes(type)) return false
  return ''
}

function emptyRow(): ParamRow {
  return { key: '', value: '', enabled: true }
}

function ensureTwo(rows: ParamRow[]): ParamRow[] {
  const list = [...rows]
  while (list.length < 2) list.push(emptyRow())
  return list
}

function makeDraft(detail: InterfaceDetail): RequestDraft {
  const sample: Record<string, unknown> = {}
  for (const field of detail.body?.fields ?? []) sample[field.name] = defaultValue(field.type)
  const bodyType: RequestBodyType = detail.body ? (detail.body.type === 'multipart' ? 'form-data' : 'raw') : 'none'
  const base: RequestDraft = {
    requestMethod: detail.method,
    requestUrl: detail.path,
    pathParams: Object.fromEntries(detail.params.path.map((field) => [field.name, field.defaultValue ?? ''])),
    query: ensureTwo(detail.params.query.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true, description: field.description ?? '' }))),
    headers: ensureTwo(detail.params.headers.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true, description: field.description ?? '' }))),
    cookies: ensureTwo(detail.params.cookies.map((field) => ({ key: field.name, value: field.defaultValue ?? '', enabled: true, description: field.description ?? '' }))),
    bodyType,
    bodyFormat: 'json',
    bodyRaw: detail.body && bodyType === 'raw' ? JSON.stringify(sample, null, 2) : '',
    formRows: ensureTwo([])
  }
  const saved = detail.requestDraft
  if (!saved) return base
  return {
    ...base,
    ...saved,
    pathParams: { ...base.pathParams, ...(saved.pathParams ?? {}) },
    query: saved.query ?? base.query,
    headers: saved.headers ?? base.headers,
    cookies: saved.cookies ?? base.cookies,
    formRows: saved.formRows ?? base.formRows,
    bodyFormat: saved.bodyFormat ?? base.bodyFormat
  }
}

function statusLabel(status: InterfaceDetail['status']): string {
  return status === 'registered' ? '已注册' : status === 'changed' ? '已变更' : '已归档'
}

function RowTable({
  rows,
  onChange,
  addLabel = '添加一行',
  allowFile = false
}: {
  rows: ParamRow[]
  onChange: (rows: ParamRow[]) => void
  addLabel?: string
  allowFile?: boolean
}): JSX.Element {
  return (
    <>
      <table className="kv param-table">
        <thead>
          <tr><th className="cb" /><th>参数名</th><th>参数值</th><th>说明</th><th className="act" /></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={row.enabled ? '' : 'disabled'}>
              <td className="cb">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => {
                    const next = [...rows]
                    next[index] = { ...row, enabled: event.target.checked }
                    onChange(next)
                  }}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={row.key}
                  onChange={(event) => {
                    const next = [...rows]
                    next[index] = { ...row, key: event.target.value }
                    onChange(next)
                  }}
                />
              </td>
              <td>
                {row.kind === 'file' ? (
                  <div className="file-value">
                    <span className="file-value-name" title={row.filePath}>{row.fileName || '未选择文件'}</span>
                    <button
                      className="btn small"
                      onClick={() => {
                        void window.feelpost.dialog.chooseFile().then((result) => {
                          if (!result.ok || !result.data) return
                          const next = [...rows]
                          next[index] = { ...row, kind: 'file', filePath: result.data.path, fileName: result.data.name, value: '' }
                          onChange(next)
                        })
                      }}
                    >
                      选择文件
                    </button>
                    <button
                      className="icon"
                      title="改为文本"
                      onClick={() => {
                        const next = [...rows]
                        next[index] = { ...row, kind: 'text', filePath: undefined, fileName: undefined, value: '' }
                        onChange(next)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={row.value}
                    onChange={(event) => {
                      const next = [...rows]
                      next[index] = { ...row, value: event.target.value }
                      onChange(next)
                    }}
                  />
                )}
              </td>
              <td className="desc">
                <input
                  type="text"
                  value={row.description ?? ''}
                  onChange={(event) => {
                    const next = [...rows]
                    next[index] = { ...row, description: event.target.value }
                    onChange(next)
                  }}
                />
              </td>
              <td className="act">
                <button className="icon" onClick={() => onChange(rows.filter((_, i) => i !== index))} title="删除">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kv-tools">
        <button className="btn small" onClick={() => onChange([...rows, emptyRow()])}>+ {addLabel}</button>
        {allowFile && (
          <button className="btn small" onClick={() => onChange([...rows, { key: '', value: '', enabled: true, kind: 'file' }])}>+ 文件</button>
        )}
      </div>
    </>
  )
}

interface JsonFieldRow {
  path: string
  type: string
  preview: string
}

function jsonType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function SparkIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z" />
      <path d="M19 17.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" />
    </svg>
  )
}

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function preferredTab(detail: InterfaceDetail): Tab {
  if (detail.params.headers.length > 0) return 'headers'
  if (detail.params.query.length > 0) return 'query'
  if (detail.params.path.length > 0) return 'path'
  if (detail.body || (detail.requestDraft && detail.requestDraft.bodyType !== 'none')) return 'body'
  if (detail.params.cookies.length > 0) return 'cookies'
  return 'body'
}

function collectJsonFields(value: unknown, path = '', rows: JsonFieldRow[] = []): JsonFieldRow[] {
  if (Array.isArray(value)) {
    if (!path) rows.push({ path: '[]', type: 'array', preview: `Array(${value.length})` })
    else rows.push({ path, type: 'array', preview: `Array(${value.length})` })
    if (value.length > 0) collectJsonFields(value[0], `${path}[]`, rows)
    return rows
  }
  if (value && typeof value === 'object') {
    if (path) rows.push({ path, type: 'object', preview: '{…}' })
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectJsonFields(child, path ? `${path}.${key}` : key, rows)
    }
    return rows
  }
  if (path) {
    const preview = JSON.stringify(value)
    rows.push({
      path,
      type: jsonType(value),
      preview: preview.length > 48 ? `${preview.slice(0, 48)}…` : preview
    })
  }
  return rows
}

export default function RequestPanel({ project, detail, env, onConfirm, onRestore, onRefresh, onCaseSaved, active, aiEnabled, notify }: Props): JSX.Element {
  const [draft, setDraft] = useState<RequestDraft>(() => makeDraft(detail))
  const [savedDraftKey, setSavedDraftKey] = useState(() => JSON.stringify(makeDraft(detail)))
  const [tab, setTab] = useState<Tab>(() => preferredTab(detail))
  const [respTab, setRespTab] = useState<'body' | 'headers' | 'examples'>('body')
  const [sending, setSending] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [clientId, setClientId] = useState('')
  const [response, setResponse] = useState<SendResult | null>(null)
  const [error, setError] = useState('')
  const [effective, setEffective] = useState<EffectiveParams | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState(detail.summaryText)
  const [nameDraft, setNameDraft] = useState(detail.name)
  const [caseOpen, setCaseOpen] = useState(false)
  const [caseName, setCaseName] = useState('')
  const [caseTags, setCaseTags] = useState('')
  const [caseNote, setCaseNote] = useState('')
  const [caseBusy, setCaseBusy] = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [examples, setExamples] = useState<ResponseExample[]>([])
  const [exampleOpen, setExampleOpen] = useState(false)
  const [exampleName, setExampleName] = useState('')
  const [exampleBusy, setExampleBusy] = useState(false)
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null)
  const [exampleTab, setExampleTab] = useState<'success' | 'failure'>('success')
  const [simplified, setSimplified] = useState(false)
  const [fieldOpen, setFieldOpen] = useState(false)
  const [fieldRows, setFieldRows] = useState<JsonFieldRow[]>([])
  const [fieldDraft, setFieldDraft] = useState<Record<string, string>>({})
  const [fieldMeta, setFieldMeta] = useState<Record<string, AIMeta>>({})
  const [fieldError, setFieldError] = useState('')
  const [fieldBusy, setFieldBusy] = useState(false)
  const [requestFieldsOpen, setRequestFieldsOpen] = useState(false)
  const [requestFieldRows, setRequestFieldRows] = useState<JsonFieldRow[]>([])
  const [requestFieldDraft, setRequestFieldDraft] = useState<Record<string, string>>({})
  const [requestFieldMeta, setRequestFieldMeta] = useState<Record<string, AIMeta>>({})
  const [requestFieldError, setRequestFieldError] = useState('')
  const [aiFieldTarget, setAIFieldTarget] = useState<'request' | 'response' | null>(null)
  const [aiCaseOpen, setAICaseOpen] = useState(false)
  const [methodMenuOpen, setMethodMenuOpen] = useState(false)
  const mounted = useRef(true)
  const methodMenuRef = useRef<HTMLDivElement>(null)
  const saveMenuRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<HTMLDivElement>(null)
  const [requestHeight, setRequestHeight] = useState<number | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!methodMenuOpen) return
    const close = (event: MouseEvent): void => {
      if (methodMenuRef.current && !methodMenuRef.current.contains(event.target as Node)) setMethodMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMethodMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [methodMenuOpen])

  useEffect(() => {
    if (!saveMenuOpen) return
    const close = (event: MouseEvent): void => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(event.target as Node)) setSaveMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [saveMenuOpen])

  useEffect(() => {
    const nextDraft = makeDraft(detail)
    setDraft(nextDraft)
    setSavedDraftKey(JSON.stringify(nextDraft))
    setResponse(null)
    setError('')
    setTab(preferredTab(detail))
    setRespTab('body')
    setEffective(null)
    setSimplified(false)
    setSelectedExampleId(null)
    setSummaryDraft(detail.summaryText)
    setNameDraft(detail.name)
  }, [detail.id, env.id])

  useEffect(() => {
    let active = true
    void window.feelpost.example.list(project.id, detail.id).then((result) => {
      if (active && result.ok) setExamples(result.data)
    })
    return () => {
      active = false
    }
  }, [project.id, detail.id])

  useEffect(() => {
    setSummaryDraft(detail.summaryText)
  }, [detail.summaryText])

  useEffect(() => {
    setNameDraft(detail.name)
  }, [detail.name])

  const fieldNotes = useMemo(() => {
    const result: Record<string, string> = {}
    const walk = (fields: ParamField[]): void => {
      for (const field of fields) {
        if (field.description) result[field.name] = field.description
        if (field.children?.length) walk(field.children)
      }
    }
    if (detail.body) walk(detail.body.fields)
    for (const [path, description] of Object.entries(draft.fieldDescriptions ?? {})) {
      const name = path.split('.').pop()?.replace(/\[\]/g, '')
      if (name && description) result[name] = description
    }
    return result
  }, [detail, draft.fieldDescriptions])

  const inheritedHeaders = useMemo(() => {
    const map = new Map<string, { key: string; value: string; source: string }>()
    for (const row of project.globalParams.headers) {
      if (row.enabled && row.key) map.set(row.key, { key: row.key, value: row.value, source: '全局' })
    }
    for (const row of env.params.headers) {
      if (!row.enabled || !row.key) continue
      map.set(row.key, { key: row.key, value: row.value, source: map.has(row.key) ? '环境（覆盖全局）' : '环境' })
    }
    return [...map.values()]
  }, [project.globalParams.headers, env.params.headers])

  const bodyCount = draft.bodyType === 'none' ? 0 : 1
  const tabs = useMemo(
    () =>
      [
        ['headers', 'Headers', draft.headers.filter((row) => row.key.trim()).length],
        ['query', 'Query', draft.query.filter((row) => row.key.trim()).length],
        ['path', 'Path', detail.params.path.length],
        ['body', 'Body', bodyCount],
        ['cookies', 'Cookies', draft.cookies.filter((row) => row.key.trim()).length],
        ['effective', '生效参数', 0]
      ] as Array<[Tab, string, number]>,
    [detail, draft, bodyCount]
  )

  function selectTab(next: Tab): void {
    if (next === 'headers') setDraft((current) => ({ ...current, headers: ensureTwo(current.headers) }))
    if (next === 'query') setDraft((current) => ({ ...current, query: ensureTwo(current.query) }))
    if (next === 'cookies') setDraft((current) => ({ ...current, cookies: ensureTwo(current.cookies) }))
    if (next === 'body') {
      setDraft((current) => ({
        ...current,
        formRows: current.bodyType === 'form-data' || current.bodyType === 'urlencoded' ? ensureTwo(current.formRows ?? []) : current.formRows
      }))
    }
    if (next === 'effective') void showEffective()
    else setTab(next)
  }

  function setBodyType(bodyType: RequestBodyType): void {
    setDraft((current) => ({
      ...current,
      bodyType,
      formRows: bodyType === 'form-data' || bodyType === 'urlencoded' ? ensureTwo(current.formRows ?? []) : current.formRows
    }))
  }

  function formatRawBody(): void {
    try {
      const parsed = JSON.parse(draft.bodyRaw)
      setDraft({ ...draft, bodyRaw: JSON.stringify(parsed, null, 2) })
      setError('')
    } catch {
      setError('JSON 格式不合法，无法格式化。')
    }
  }

  useEffect(() => {
    if (!sending) {
      setElapsedMs(0)
      return
    }
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startedAt))
    }, 100)
    return () => window.clearInterval(timer)
  }, [sending])

  function applyAIFieldDescriptions(descriptions: Record<string, string>, meta: AIMeta): void {
    if (aiFieldTarget === 'request') {
      setRequestFieldDraft((current) => ({ ...current, ...descriptions }))
      setRequestFieldMeta((current) => {
        const next = { ...current }
        for (const path of Object.keys(descriptions)) next[path] = meta
        return next
      })
    } else if (aiFieldTarget === 'response') {
      setFieldDraft((current) => ({ ...current, ...descriptions }))
      setFieldMeta((current) => {
        const next = { ...current }
        for (const path of Object.keys(descriptions)) next[path] = meta
        return next
      })
    }
    setAIFieldTarget(null)
    notify('AI 说明已填入，保存字段说明后生效')
  }

  async function send(): Promise<void> {
    const id = crypto.randomUUID()
    setClientId(id)
    setSending(true)
    setError('')
    try {
      const result = await unwrap(
        window.feelpost.request.send({
          projectId: project.id,
          envId: env.id,
          interfaceId: detail.id,
          draft,
          clientRequestId: id
        })
      )
      if (mounted.current) {
        setResponse(result)
        setRespTab('body')
        setSimplified(false)
      }
    } catch (err) {
      if (mounted.current) setError((err as Error).message)
    } finally {
      if (mounted.current) setSending(false)
    }
  }

  async function cancel(): Promise<void> {
    if (clientId) await window.feelpost.request.cancel(clientId)
  }

  async function showEffective(): Promise<void> {
    setTab('effective')
    setLoadingPreview(true)
    try {
      setEffective(
        await unwrap(
          window.feelpost.env.preview({
            projectId: project.id,
            envId: env.id,
            interfaceId: detail.id,
            draft
          })
        )
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingPreview(false)
    }
  }

  const successExamples = examples.filter((example) => example.status < 400)
  const failureExamples = examples.filter((example) => example.status >= 400)
  const visibleExamples = exampleTab === 'success' ? successExamples : failureExamples
  const activeExample = visibleExamples.find((example) => example.id === selectedExampleId) ?? visibleExamples[0] ?? null

  useEffect(() => {
    if (!response && examples.length > 0 && respTab === 'body') setRespTab('examples')
  }, [examples, response, respTab])

  const infoDirty =
    nameDraft.trim() !== detail.name ||
    summaryDraft.trim() !== detail.summaryText ||
    JSON.stringify(draft) !== savedDraftKey

  async function saveInfo(): Promise<void> {
    try {
      await unwrap(
        window.feelpost.catalog.updateManual({
          projectId: project.id,
          interfaceId: detail.id,
          manualLayer: {
            overrides: detail.manualLayer?.overrides ?? [],
            name: nameDraft.trim() === detail.name ? detail.manualLayer?.name : nameDraft.trim(),
            summary: summaryDraft.trim() === detail.summaryText ? detail.manualLayer?.summary : summaryDraft.trim()
          },
          requestDraft: draft
        })
      )
      setSavedDraftKey(JSON.stringify(draft))

      // Saving interface info must not recreate an existing response example:
      // example.save replaces the example and would clear its field descriptions.
      const source = response
        ? {
            status: response.status,
            headers: response.headers,
            body: response.bodyText,
            truncated: response.bodyTruncated
          }
        : null

      let savedExample: ResponseExample | null = null
      if (source) {
        const success = source.status < 400
        const existing = examples.find((item) => (item.status < 400) === success)
        const preservedDescriptions = existing?.fieldDescriptions
        const preservedMeta = existing?.fieldDescriptionMeta
        const exampleBody = simplified ? simplifiedText(source.body) : source.body
        savedExample = await unwrap(
          window.feelpost.example.save({
            projectId: project.id,
            interfaceId: detail.id,
            name: existing?.name || (success ? '成功示例' : '失败示例'),
            response: {
              status: source.status,
              headers: source.headers,
              bodyText: exampleBody,
              truncated: source.truncated
            }
          })
        )
        if (preservedDescriptions && Object.keys(preservedDescriptions).length > 0) {
          savedExample = await unwrap(
            window.feelpost.example.updateFields(project.id, savedExample.id, preservedDescriptions, preservedMeta)
          )
        }
        setExamples(await unwrap(window.feelpost.example.list(project.id, detail.id)))
        setSelectedExampleId(savedExample.id)
        setExampleTab(success ? 'success' : 'failure')
      }

      await onRefresh()
      notify(savedExample ? '接口信息、请求参数与响应示例已保存' : '接口信息与请求参数已保存')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const pane = paneRef.current
    const request = requestRef.current
    if (!pane || !request) return
    const startY = event.clientY
    const startHeight = request.getBoundingClientRect().height
    const paneHeight = pane.getBoundingClientRect().height
    const min = 120
    const max = Math.max(min + 80, paneHeight - 260)

    const onMove = (moveEvent: PointerEvent): void => {
      setRequestHeight(Math.max(min, Math.min(max, startHeight + moveEvent.clientY - startY)))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.body.classList.add('resizing')
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const current = requestHeight ?? requestRef.current?.getBoundingClientRect().height ?? 240
    const paneHeight = paneRef.current?.getBoundingClientRect().height ?? 700
    const next = current + (event.key === 'ArrowUp' ? -24 : 24)
    setRequestHeight(Math.max(120, Math.min(paneHeight - 260, next)))
  }

  function openExampleModal(): void {
    if (!response) return
    setExampleName(response.status < 400 ? '成功示例' : '失败示例')
    setExampleOpen(true)
  }

  function openFieldDescriptions(): void {
    if (!activeExample) return
    try {
      const parsed = JSON.parse(activeExample.body) as unknown
      setFieldRows(collectJsonFields(parsed))
      setFieldDraft(activeExample.fieldDescriptions ?? {})
      setFieldMeta(activeExample.fieldDescriptionMeta ?? {})
      setFieldError('')
      setFieldOpen(true)
    } catch {
      setError('响应体不是合法 JSON，无法生成字段描述。')
    }
  }

  function openRequestFieldDescriptions(): void {
    try {
      const parsed = JSON.parse(draft.bodyRaw) as unknown
      const rows = collectJsonFields(parsed)
      const seeded: Record<string, string> = { ...(draft.fieldDescriptions ?? {}) }
      for (const field of detail.body?.fields ?? []) {
        if (field.description && rows.some((row) => row.path === field.name) && !seeded[field.name]) {
          seeded[field.name] = field.description
        }
      }
      setRequestFieldRows(rows)
      setRequestFieldDraft(seeded)
      setRequestFieldMeta(draft.fieldDescriptionMeta ?? {})
      setRequestFieldError('')
      setRequestFieldsOpen(true)
    } catch {
      setError('当前请求体不是合法 JSON，无法生成字段说明。')
    }
  }

  async function saveRequestFieldDescriptions(): Promise<void> {
    const cleaned: Record<string, string> = {}
    for (const [path, description] of Object.entries(requestFieldDraft)) {
      if (description.trim()) cleaned[path] = description.trim()
    }
    const nextDraft: RequestDraft = {
      ...draft,
      fieldDescriptions: cleaned,
      fieldDescriptionMeta: Object.keys(requestFieldMeta).length ? requestFieldMeta : undefined
    }
    setDraft(nextDraft)
    setSavedDraftKey(JSON.stringify(nextDraft))
    setRequestFieldError('')
    try {
      await unwrap(window.feelpost.catalog.updateManual({
        projectId: project.id,
        interfaceId: detail.id,
        manualLayer: {
          overrides: detail.manualLayer?.overrides ?? [],
          name: detail.manualLayer?.name,
          summary: detail.manualLayer?.summary
        },
        requestDraft: nextDraft
      }))
      await onRefresh()
      notify('字段说明已保存')
    } catch (err) {
      setRequestFieldError((err as Error).message)
    }
  }

  async function saveFieldDescriptions(): Promise<void> {
    if (!activeExample) return
    setFieldBusy(true)
    setFieldError('')
    try {
      const updated = await unwrap(window.feelpost.example.updateFields(project.id, activeExample.id, fieldDraft, fieldMeta))
      setExamples((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setFieldOpen(false)
      notify('字段描述已保存')
    } catch (err) {
      setFieldError((err as Error).message)
    } finally {
      setFieldBusy(false)
    }
  }

  async function saveExample(): Promise<void> {
    if (!response) return
    setExampleBusy(true)
    setError('')
    try {
      const saved = await unwrap(window.feelpost.example.save({
        projectId: project.id,
        interfaceId: detail.id,
        name: exampleName,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          bodyText: response.bodyText,
          truncated: response.bodyTruncated
        }
      }))
      setExampleOpen(false)
      setExamples(await unwrap(window.feelpost.example.list(project.id, detail.id)))
      setSelectedExampleId(saved.id)
      setExampleTab(saved.status < 400 ? 'success' : 'failure')
      notify('响应示例已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExampleBusy(false)
    }
  }

  function openCaseModal(): void {
    setCaseName(`${detail.name} · ${env.name}`)
    setCaseTags('')
    setCaseNote('')
    setCaseOpen(true)
  }

  async function saveCase(): Promise<void> {
    const name = caseName.trim()
    if (!name) return
    setCaseBusy(true)
    setError('')
    try {
      await unwrap(
        window.feelpost.case.create({
          projectId: project.id,
          interfaceId: detail.id,
          envId: env.id,
          name,
          tags: caseTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
          note: caseNote,
          draft
        })
      )
      setCaseOpen(false)
      onCaseSaved?.()
      notify('用例已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCaseBusy(false)
    }
  }

  useEffect(() => {
    if (!active) return
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!sending) void send()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveInfo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const requestMethod = draft.requestMethod ?? detail.method
  const requestUrl = draft.requestUrl ?? detail.path

  return (
    <div className="detail-pane" ref={paneRef}>
      <div className="api-head">
        <div className="api-title">
          <div className="api-method-picker" ref={methodMenuRef}>
            <button
              type="button"
              className={`method api-method-trigger m-${requestMethod.toLowerCase()}`}
              onClick={() => setMethodMenuOpen((open) => !open)}
              aria-expanded={methodMenuOpen}
              title="请求方式"
            >
              {requestMethod}<span className="method-caret">▾</span>
            </button>
            {methodMenuOpen && (
              <div className="method-menu" role="menu">
                {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`method-menu-item ${method === requestMethod ? 'active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      setDraft({ ...draft, requestMethod: method })
                      setMethodMenuOpen(false)
                    }}
                  >
                    <span className={`method m-${method.toLowerCase()}`}>{method}</span>
                    {method === requestMethod && <span className="method-menu-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="api-url-input mono"
            value={requestUrl}
            spellCheck={false}
            placeholder="请求路径，或输入完整 http(s) URL"
            title="请求地址；输入完整 http(s) URL 时直接使用该地址，不再拼接环境 Base URL"
            onChange={(event) => setDraft({ ...draft, requestUrl: event.target.value })}
          />
          <span className={`chip ${detail.status === 'registered' ? 'ok' : detail.status === 'changed' ? 'warn' : 'muted'}`}>
            {statusLabel(detail.status)}
          </span>
          {detail.parseQuality !== 'full' && <span className="chip warn">部分解析</span>}
        </div>
        <div className="api-actions">
          <button className="btn ai-action ai-case-action" disabled={!aiEnabled || detail.status === 'archived'} title={aiEnabled ? '用 AI 生成候选用例' : '请先在设置中启用 AI'} onClick={() => setAICaseOpen(true)}>
            <SparkIcon />AI 用例
          </button>
          <div className="save-split" ref={saveMenuRef}>
            <button
              className={`btn save-main ${infoDirty ? 'dirty' : ''}`}
              onClick={() => { setSaveMenuOpen(false); void saveInfo() }}
              title="保存接口信息与请求参数（⌘/Ctrl + S）"
            >
              保存
            </button>
            <button
              className="btn save-caret"
              aria-expanded={saveMenuOpen}
              title="更多保存操作"
              onClick={() => setSaveMenuOpen((open) => !open)}
            >
              ▾
            </button>
            {saveMenuOpen && (
              <div className="save-menu">
                <button
                  className="save-menu-item"
                  disabled={detail.status === 'archived'}
                  onClick={() => { setSaveMenuOpen(false); openCaseModal() }}
                >
                  保存用例
                </button>
              </div>
            )}
          </div>
          {detail.status === 'changed' && <button className="btn" onClick={onConfirm}>确认变更</button>}
          {detail.status === 'archived' && <button className="btn" onClick={onRestore}>恢复为已注册</button>}
          {sending ? (
            <button className="btn cancel-request sending" onClick={() => void cancel()}>
              <span className="btn-spinner" aria-hidden="true" />
              取消请求
            </button>
          ) : (
            <button className="btn primary" disabled={detail.status === 'archived'} onClick={() => void send()}>
              发送
            </button>
          )}
        </div>
      </div>

      <div className="api-meta">
        <label className="inline-field name-field">
          <span>名称</span>
          <input
            value={nameDraft}
            placeholder="接口名称"
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void saveInfo() }}
          />
        </label>
        <label className="inline-field desc-field">
          <span>说明</span>
          <input
            value={summaryDraft}
            placeholder="暂无说明"
            onChange={(event) => setSummaryDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void saveInfo() }}
          />
        </label>
        {infoDirty && <span className="chip warn">未保存</span>}
        {detail.changeNote && <span className="chip warn">本次扫描变更：{detail.changeNote}</span>}
        {detail.issues.length > 0 && <span className="chip warn">{detail.issues.join('；')}</span>}
      </div>

      <div className="tabs request-tabs">
        {tabs.map(([key, label, count]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => selectTab(key)}>
            {label}
            {count > 0 && <span className="tab-count">{count}</span>}
          </button>
        ))}
        <div className="pane-tools">
          <span className="small-note">{env.name} · {detail.controller || '手工'}</span>
        </div>
      </div>

      <Message text={error} onClose={() => setError('')} />

      <div
        className="request-area"
        ref={requestRef}
        style={requestHeight !== null ? { flex: '0 0 auto', height: `${requestHeight}px`, maxHeight: 'none' } : undefined}
      >
        {tab === 'headers' && (
          <div className="pane-pad">
            {inheritedHeaders.length > 0 && (
              <>
                <h4 className="kv-title">环境 Header <span className="small-note">只读</span></h4>
                <table className="kv param-table readonly">
                  <thead><tr><th className="cb" /><th>参数名</th><th>参数值</th><th>来源</th><th className="act" /></tr></thead>
                  <tbody>
                    {inheritedHeaders.map((row) => (
                      <tr key={row.key}>
                        <td className="cb"><input type="checkbox" checked disabled /></td>
                        <td><span className="mono key-text">{row.key}</span></td>
                        <td><span className="mono key-text">{row.value}</span></td>
                        <td className="desc"><span className="chip muted">{row.source}</span></td>
                        <td className="act" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <h4 className={`kv-title ${inheritedHeaders.length > 0 ? 'mt-12' : ''}`}>接口 Header</h4>
            <RowTable rows={draft.headers} onChange={(headers) => setDraft({ ...draft, headers })} addLabel="添加 Header" />
          </div>
        )}

        {tab === 'query' && (
          <div className="pane-pad">
            <h4 className="kv-title">Query 参数 <span className="small-note">环境与全局同名参数会被覆盖</span></h4>
            <RowTable
              rows={draft.query}
              onChange={(query) => setDraft({ ...draft, query })}
              addLabel="添加 Query 参数"
            />
          </div>
        )}

        {tab === 'path' && (
          <div className="pane-pad">
            <h4 className="kv-title">Path 参数</h4>
            {detail.params.path.length > 0 ? (
              <table className="kv param-table path-table">
                <thead><tr><th className="cb" /><th>参数名</th><th>参数值</th><th>说明</th><th className="act" /></tr></thead>
                <tbody>
                  {detail.params.path.map((field) => (
                    <tr key={field.path}>
                      <td className="cb" />
                      <td>
                        <div className="key-cell">
                          <span className="mono">{field.name}</span>
                          <span className="chip muted">{field.type}</span>
                          {field.required && <span className="chip warn">必填</span>}
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={draft.pathParams[field.name] ?? ''}
                          onChange={(event) => setDraft({ ...draft, pathParams: { ...draft.pathParams, [field.name]: event.target.value } })}
                        />
                      </td>
                      <td className="desc">{field.description || ''}</td>
                      <td className="act" />
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small-note">该接口没有 Path 参数。</p>
            )}
          </div>
        )}

        {tab === 'body' && (
          <div className="pane-pad">
            <div className="body-type">
              {BODY_FORMATS.map(([value, label]) => (
                <button
                  key={value}
                  className={`btn small ${draft.bodyType === value ? 'primary' : ''}`}
                  onClick={() => setBodyType(value)}
                >
                  {label}
                </button>
              ))}
              {draft.bodyType === 'raw' && (
                <>
                  <span className="spacer" />
                  <button
                    className="btn small"
                    disabled={(draft.bodyFormat ?? 'json') !== 'json'}
                    title={(draft.bodyFormat ?? 'json') === 'json' ? '格式化 JSON' : '仅 JSON 请求体可格式化'}
                    onClick={formatRawBody}
                  >
                    格式化
                  </button>
                  <button className={`btn small ai-field-trigger ${aiEnabled ? 'ai-action' : ''}`} onClick={openRequestFieldDescriptions}>
                    {aiEnabled && <SparkIcon />}字段说明
                  </button>
                </>
              )}
            </div>

            {draft.bodyType === 'none' && (
              <p className="small-note">该请求不发送 Body。需要时可在上方选择 raw / form-data / urlencoded。</p>
            )}

            {draft.bodyType === 'raw' && (
              <>
                <div className="body-subtype">
                  <button
                    className={`btn small ${(draft.bodyFormat ?? 'json') === 'json' ? 'primary' : ''}`}
                    onClick={() => setDraft({ ...draft, bodyFormat: 'json' })}
                  >
                    JSON
                  </button>
                  <button
                    className={`btn small ${draft.bodyFormat === 'text' ? 'primary' : ''}`}
                    onClick={() => setDraft({ ...draft, bodyFormat: 'text' })}
                  >
                    Text
                  </button>
                  <span className="small-note">
                    Content-Type: {(draft.bodyFormat ?? 'json') === 'json' ? 'application/json' : 'text/plain'}
                  </span>
                </div>
                {(draft.bodyFormat ?? 'json') === 'json' ? (
                  <JsonEditor value={draft.bodyRaw} onChange={(bodyRaw) => setDraft({ ...draft, bodyRaw })} notes={fieldNotes} />
                ) : (
                  <textarea
                    className="body-editor"
                    value={draft.bodyRaw}
                    onChange={(event) => setDraft({ ...draft, bodyRaw: event.target.value })}
                    spellCheck={false}
                  />
                )}
              </>
            )}

            {(draft.bodyType === 'form-data' || draft.bodyType === 'urlencoded') && (
              <>
                <div className="body-subtype">
                  <span className="small-note">
                    Content-Type: {draft.bodyType === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded'}
                  </span>
                </div>
                <RowTable
                  rows={ensureTwo(draft.formRows ?? [])}
                  onChange={(formRows) => setDraft({ ...draft, formRows })}
                  addLabel="添加表单参数"
                  allowFile={draft.bodyType === 'form-data'}
                />
              </>
            )}

            {draft.bodyType === 'binary' && (
              <div className="body-subtype">
                <button
                  className="btn small"
                  onClick={() => {
                    void window.feelpost.dialog.chooseFile().then((result) => {
                      if (!result.ok || !result.data) return
                      setDraft({ ...draft, binaryFilePath: result.data.path, binaryFileName: result.data.name })
                    })
                  }}
                >
                  选择文件
                </button>
                <span className="small-note" title={draft.binaryFilePath}>{draft.binaryFileName || '未选择文件'}</span>
                {draft.binaryFilePath && (
                  <button className="btn ghost small" onClick={() => setDraft({ ...draft, binaryFilePath: undefined, binaryFileName: undefined })}>清除</button>
                )}
                <span className="small-note">Content-Type: 按文件类型自动识别</span>
              </div>
            )}
          </div>
        )}

        {tab === 'cookies' && (
          <div className="pane-pad">
            <h4 className="kv-title">Cookie</h4>
            <RowTable rows={draft.cookies} onChange={(cookies) => setDraft({ ...draft, cookies })} addLabel="添加 Cookie" />
          </div>
        )}

        {tab === 'effective' && (
          <div className="pane-pad">
            {loadingPreview && <p className="small-note">计算中…</p>}
            {effective && (
              <>
                {effective.query.length === 0 && effective.headers.length === 0 && effective.cookies.length === 0 && !effective.bodyText ? (
                  <div className="eff-empty-card">
                    <strong>当前没有生效参数</strong>
                    <span className="small-note">该接口未声明参数，环境与全局参数也为空。</span>
                  </div>
                ) : (
                  <div className="eff-grid">
                    {effective.query.length > 0 && (
                      <EffSection title="Query" count={effective.query.length}>
                        <EffectiveTable rows={effective.query} />
                      </EffSection>
                    )}
                    {effective.headers.length > 0 && (
                      <EffSection title="Headers" count={effective.headers.length}>
                        <EffectiveTable rows={effective.headers} />
                      </EffSection>
                    )}
                    {effective.cookies.length > 0 && (
                      <EffSection title="Cookies" count={effective.cookies.length}>
                        <EffectiveTable rows={effective.cookies} />
                      </EffSection>
                    )}
                    <EffSection title="请求体" count={effective.bodyText ? 1 : 0}>
                      {effective.bodyText ? (
                        prettyJson(effective.bodyText) !== null ? (
                          <pre className="eff-body" dangerouslySetInnerHTML={{ __html: highlightJson(prettyJson(effective.bodyText) as string) }} />
                        ) : (
                          <pre className="eff-body">{effective.bodyText}</pre>
                        )
                      ) : (
                        <p className="eff-empty">该请求没有请求体</p>
                      )}
                    </EffSection>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="splitter"
        role="separator"
        aria-orientation="horizontal"
        tabIndex={0}
        title="拖动调整响应区高度，双击恢复自动"
        onPointerDown={startResize}
        onKeyDown={resizeWithKeyboard}
        onDoubleClick={() => setRequestHeight(null)}
      />

      <div className="response-area" aria-busy={sending}>
        {sending ? (
          <div className="resp-loading" role="status" aria-live="polite">
            <div className="resp-loading-head">
              <span className="resp-orbit" aria-hidden="true"><i /></span>
              <div>
                <strong>正在等待响应</strong>
                <span className="resp-wait-text">请求已发送到 {env.name} · 已等待 <span className="resp-elapsed">{formatElapsed(elapsedMs)}</span></span>
              </div>
            </div>
            <div className="resp-skeleton" aria-hidden="true">
              <span style={{ width: '46%' }} />
              <span style={{ width: '72%' }} />
              <span style={{ width: '58%' }} />
              <span style={{ width: '34%' }} />
            </div>
            <span className="resp-loading-note">响应返回后会自动显示；慢接口可随时取消请求。</span>
          </div>
        ) : response || examples.length > 0 ? (
          <>
            <div className="resp-head">
              {response ? (
                <>
                  <span className={`status ${response.status < 400 ? 'ok' : 'warn'}`}>{response.status} {response.statusText}</span>
                  <span className="resp-meta">{response.totalMs} ms · {response.sizeBytes} B</span>
                  <SpeedBadge ms={response.totalMs} />
                  {response.bodyTruncated && <span className="chip warn">响应已截断</span>}
                </>
              ) : (
                <span className="small-note">尚未发送请求</span>
              )}
              <div className="resp-tabs">
                <button className={`resp-tab ${respTab === 'body' ? 'active' : ''}`} disabled={!response} onClick={() => setRespTab('body')}>响应体</button>
                <button className={`resp-tab ${respTab === 'headers' ? 'active' : ''}`} disabled={!response} onClick={() => setRespTab('headers')}>响应头</button>
                <button className={`resp-tab ${respTab === 'examples' ? 'active' : ''}`} onClick={() => setRespTab('examples')}>
                  响应示例{examples.length > 0 ? ` ${examples.length}` : ''}
                </button>
              </div>
              {response && <button className="btn small" onClick={openExampleModal}>保存响应示例</button>}
              <span className="spacer" />
              {response && <span className="small-note mono">{response.finalUrl}</span>}
            </div>

            {respTab === 'examples' ? (
              <div className="examples-pane">
                <div className="examples-toolbar">
                  <div className="resp-tabs">
                    <button className={`resp-tab ${exampleTab === 'success' ? 'active' : ''}`} onClick={() => setExampleTab('success')}>
                      成功 {successExamples.length}
                    </button>
                    <button className={`resp-tab ${exampleTab === 'failure' ? 'active' : ''}`} onClick={() => setExampleTab('failure')}>
                      失败 {failureExamples.length}
                    </button>
                  </div>
                  <span className="spacer" />
                  {activeExample && prettyJson(activeExample.body) !== null && (
                    <button className={`btn small ${simplified ? 'primary' : ''}`} onClick={() => setSimplified((value) => !value)}>
                      {simplified ? '完整 JSON' : '简化 JSON'}
                    </button>
                  )}
                  {activeExample && prettyJson(activeExample.body) !== null && (
                    <button className={`btn small ai-field-trigger ${aiEnabled ? 'ai-action' : ''}`} onClick={openFieldDescriptions}>
                      {aiEnabled && <SparkIcon />}字段描述{Object.keys(activeExample.fieldDescriptions ?? {}).length > 0 ? ` ${Object.keys(activeExample.fieldDescriptions ?? {}).length}` : ''}
                    </button>
                  )}
                  {simplified && <span className="chip muted">数组仅保留首项</span>}
                </div>

                {activeExample ? (
                  <>
                    <div className="example-preview-head">
                      <span className={`status ${activeExample.status < 400 ? 'ok' : 'warn'}`}>{activeExample.status}</span>
                      <strong>{activeExample.name}</strong>
                      <span className="small-note">{new Date(activeExample.savedAt).toLocaleString()}</span>
                      <span className="spacer" />
                      {activeExample.truncated && <span className="chip warn">保存时已截断</span>}
                    </div>
                    {prettyJson(activeExample.body) !== null ? (
                      <JsonViewer
                        value={
                          simplified
                            ? JSON.stringify(simplifyJson(JSON.parse(prettyJson(activeExample.body) as string)), null, 2)
                            : (prettyJson(activeExample.body) as string)
                        }
                      />
                    ) : (
                      <pre className="resp-pre">{activeExample.body}</pre>
                    )}
                  </>
                ) : (
                  <div className="resp-empty">
                    <div className="send-glyph">▤</div>
                    <strong>{exampleTab === 'success' ? '还没有成功响应示例' : '还没有失败响应示例'}</strong>
                    <span className="small-note">发送请求后点击右上角「保存响应示例」。</span>
                  </div>
                )}
              </div>
            ) : respTab === 'body' && response ? (
              prettyJson(response.bodyText) !== null ? (
                <JsonViewer value={prettyJson(response.bodyText) as string} />
              ) : (
                <pre className="resp-pre">{response.bodyText}</pre>
              )
            ) : respTab === 'headers' && response ? (
              <table className="kv resp-headers">
                <tbody>
                  {response.headers.map(([key, value]) => (
                    <tr key={key}><td className="mono">{key}</td><td className="mono small-note">{value}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="resp-empty">
                <strong>发送请求查看响应</strong>
              </div>
            )}
          </>
        ) : (
          <div className="resp-empty">
            <div className="send-glyph">➤</div>
            <strong>发送请求查看响应</strong>
            <span className="small-note"><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
          </div>
        )}
      </div>

      {requestFieldsOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setRequestFieldsOpen(false) }}>
          <div className="modal field-desc-modal">
            <div className="field-desc-head">
              <div>
                <h2>请求体字段说明</h2>
                <p className="small-note">字段来自当前 JSON；保存后随接口请求草稿保留。</p>
              </div>
              <button className="btn ai-action field-desc-ai" disabled={!aiEnabled} title={aiEnabled ? '用 AI 补全字段说明' : '请先在设置中启用 AI'} onClick={() => setAIFieldTarget('request')}>
                <SparkIcon />AI 补全
              </button>
            </div>
            {requestFieldError && <div className="note warn">{requestFieldError}</div>}
            <div className="field-desc-body">
              {requestFieldRows.length === 0 ? (
                <p className="small-note">当前 JSON 没有可描述的字段。</p>
              ) : (
                <table className="field-desc-table">
                  <thead><tr><th>字段路径</th><th>类型</th><th>示例</th><th>字段说明</th></tr></thead>
                  <tbody>
                    {requestFieldRows.map((row) => (
                      <tr key={row.path}>
                        <td className="mono field-path">{row.path}</td>
                        <td><span className="chip muted">{row.type}</span></td>
                        <td className="mono field-sample" title={row.preview}>{row.preview}</td>
                        <td>
                          <input
                            value={requestFieldDraft[row.path] ?? ''}
                            placeholder="填写字段说明"
                            onChange={(event) => {
                              setRequestFieldDraft({ ...requestFieldDraft, [row.path]: event.target.value })
                              setRequestFieldMeta((current) => {
                                const next = { ...current }
                                delete next[row.path]
                                return next
                              })
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setRequestFieldsOpen(false)}>取消</button>
              <button className="btn primary" onClick={() => void saveRequestFieldDescriptions()}>保存字段说明</button>
            </div>
          </div>
        </div>
      )}

      {fieldOpen && activeExample && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setFieldOpen(false) }}>
          <div className="modal field-desc-modal">
            <div className="field-desc-head">
              <div>
                <h2>字段描述</h2>
                <p className="small-note">字段来自当前响应 JSON；保存后会跟随该响应示例保留，不影响请求发送。</p>
              </div>
              <button className="btn ai-action field-desc-ai" disabled={!aiEnabled} title={aiEnabled ? '用 AI 补全字段说明' : '请先在设置中启用 AI'} onClick={() => setAIFieldTarget('response')}>
                <SparkIcon />AI 补全
              </button>
            </div>
            {fieldError && <div className="note warn">{fieldError}</div>}
            <div className="field-desc-body">
              {fieldRows.length === 0 ? (
                <p className="small-note">当前 JSON 没有可描述的字段。</p>
              ) : (
                <table className="field-desc-table">
                  <thead>
                    <tr><th>字段路径</th><th>类型</th><th>示例</th><th>字段说明</th></tr>
                  </thead>
                  <tbody>
                    {fieldRows.map((row) => (
                      <tr key={row.path}>
                        <td className="mono field-path">{row.path}</td>
                        <td><span className="chip muted">{row.type}</span></td>
                        <td className="mono field-sample" title={row.preview}>{row.preview}</td>
                        <td>
                          <input
                            value={fieldDraft[row.path] ?? ''}
                            placeholder="填写字段说明"
                            onChange={(event) => {
                              setFieldDraft({ ...fieldDraft, [row.path]: event.target.value })
                              setFieldMeta((current) => {
                                const next = { ...current }
                                delete next[row.path]
                                return next
                              })
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setFieldOpen(false)}>取消</button>
              <button className="btn primary" disabled={fieldBusy} onClick={() => void saveFieldDescriptions()}>
                {fieldBusy ? '保存中…' : '保存字段描述'}
              </button>
            </div>
          </div>
        </div>
      )}

      {exampleOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setExampleOpen(false) }}>
          <div className="modal">
            <h2>保存{response && response.status < 400 ? '成功' : '失败'}响应示例</h2>
            <p className="small-note">保存当前响应体与响应头，默认归入{response && response.status < 400 ? '成功' : '失败'}示例分类。</p>
            <label className="field">
              <span>示例名称</span>
              <input value={exampleName} onChange={(event) => setExampleName(event.target.value)} autoFocus />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setExampleOpen(false)}>取消</button>
              <button className="btn primary" disabled={exampleBusy || !exampleName.trim()} onClick={() => void saveExample()}>
                {exampleBusy ? '保存中…' : '保存示例'}
              </button>
            </div>
          </div>
        </div>
      )}

      {caseOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setCaseOpen(false) }}>
          <div className="modal">
            <h2>保存用例</h2>
            <p className="small-note">保存后请求快照冻结；接口后续变更只会提示，不会改写用例。</p>
            <label className="field">
              <span>用例名称</span>
              <input value={caseName} onChange={(event) => setCaseName(event.target.value)} autoFocus />
            </label>
            <label className="field">
              <span>标签（可选）</span>
              <input value={caseTags} onChange={(event) => setCaseTags(event.target.value)} placeholder="逗号分隔，例如：冒烟, 回归" />
            </label>
            <label className="field">
              <span>备注（可选）</span>
              <textarea className="case-note-input" value={caseNote} onChange={(event) => setCaseNote(event.target.value)} />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setCaseOpen(false)}>取消</button>
              <button className="btn primary" disabled={caseBusy || !caseName.trim()} onClick={() => void saveCase()}>
                {caseBusy ? '保存中…' : '保存用例'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aiCaseOpen && (
        <AICaseAssistant
          projectId={project.id}
          interfaceId={detail.id}
          interfaceMethod={detail.method}
          interfacePath={detail.path}
          envId={env.id}
          envName={env.name}
          onClose={() => setAICaseOpen(false)}
          onImported={(count) => {
            notify(`已导入 ${count} 个 AI 用例`)
            onCaseSaved?.()
          }}
        />
      )}

      {aiFieldTarget && (aiFieldTarget === 'request' ? requestFieldsOpen : fieldOpen) && (
        <AIFieldAssistant
          projectId={project.id}
          interfaceId={detail.id}
          target={aiFieldTarget}
          exampleId={aiFieldTarget === 'response' ? activeExample?.id : undefined}
          draft={aiFieldTarget === 'request' ? draft : undefined}
          existing={aiFieldTarget === 'request' ? requestFieldDraft : fieldDraft}
          onClose={() => setAIFieldTarget(null)}
          onApply={applyAIFieldDescriptions}
        />
      )}
    </div>
  )
}

function EffectiveTable({ rows }: { rows: EffectiveParams['query'] }): JSX.Element {
  if (rows.length === 0) return <p className="small-note">无</p>
  return (
    <table className="kv eff-table">
      <thead><tr><th>参数名</th><th>参数值</th><th>来源</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="mono">{row.key}</td>
            <td className="mono">{row.value}</td>
            <td><span className="chip muted">{row.source}{row.overrides > 0 ? ` · 覆盖${row.overrides}` : ''}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

function simplifiedText(text: string): string {
  const pretty = prettyJson(text)
  if (pretty === null) return text
  return JSON.stringify(simplifyJson(JSON.parse(pretty)), null, 2)
}

function EffSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }): JSX.Element {
  return (
    <section className="eff-section">
      <div className="eff-head">
        <h4>{title}</h4>
        <span className="chip muted">{count}</span>
      </div>
      {children}
    </section>
  )
}
