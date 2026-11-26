import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AICaseResult,
  AICaseScenario,
  AIContextInput,
  AIContextPreview,
  AIMeta,
  HttpMethod
} from '@shared/contract'
import { unwrap } from './api'
import { tagStyle } from './tag-color'

interface Props {
  projectId: string
  interfaceId: string
  interfaceMethod: HttpMethod
  interfacePath: string
  envId: string
  envName: string
  onClose: () => void
  onImported: (count: number) => void
}

type Phase = 'setup' | 'preparing' | 'generating' | 'result' | 'error'

const SCENARIOS: Array<[AICaseScenario, string]> = [
  ['normal', '正常'],
  ['boundary', '边界'],
  ['error', '异常'],
  ['empty', '空参数']
]

function Spark({ size = 17 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z" />
      <path d="M19 17.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" />
    </svg>
  )
}

function scenarioLabel(value: AICaseScenario): string {
  return SCENARIOS.find(([key]) => key === value)?.[1] ?? value
}

export default function AICaseAssistant({ projectId, interfaceId, interfaceMethod, interfacePath, envId, envName, onClose, onImported }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('setup')
  const [scenarios, setScenarios] = useState<Set<AICaseScenario>>(new Set(['normal']))
  const [preview, setPreview] = useState<AIContextPreview | null>(null)
  const [result, setResult] = useState<AICaseResult | null>(null)
  const [meta, setMeta] = useState<AIMeta | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const [configuredModel, setConfiguredModel] = useState('')
  const [importing, setImporting] = useState(false)
  const requestIdRef = useRef('')
  const awaitingIdRef = useRef(false)
  const streamRef = useRef<HTMLPreElement>(null)

  const input = useMemo<AIContextInput>(() => ({
    feature: 'cases',
    projectId,
    interfaceId,
    scenarios: [...scenarios]
  }), [projectId, interfaceId, scenarios])

  useEffect(() => {
    void window.feelpost.ai.getConfig().then((response) => {
      if (response.ok) setConfiguredModel(response.data.model)
    })
  }, [])

  useEffect(() => {
    const element = streamRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [streamText])

  function ownsRequest(requestId: string): boolean {
    if (!requestIdRef.current) {
      if (!awaitingIdRef.current) return false
      requestIdRef.current = requestId
      return true
    }
    return requestId === requestIdRef.current
  }

  useEffect(() => {
    const offs = [
      window.feelpost.ai.onStream((payload) => {
        if (ownsRequest(payload.requestId)) setStreamText((current) => current + payload.delta)
      }),
      window.feelpost.ai.onCompleted((payload) => {
        if (!ownsRequest(payload.requestId)) return
        const value = payload.result as AICaseResult
        setResult(value)
        setSelected(new Set(value.cases.map((_, index) => index)))
        setMeta(payload.meta)
        setPhase('result')
      }),
      window.feelpost.ai.onFailed((payload) => {
        if (!ownsRequest(payload.requestId)) return
        setError(payload.error.message)
        setPhase('error')
      }),
      window.feelpost.ai.onCancelled((payload) => {
        if (!ownsRequest(payload.requestId)) return
        setError('AI 生成已取消。')
        setPhase('error')
      })
    ]
    return () => { offs.forEach((off) => off()) }
  }, [])

  async function generate(): Promise<void> {
    if (scenarios.size === 0) return
    setPhase('preparing')
    setError('')
    setStreamText('')
    setResult(null)
    setSelected(new Set())
    try {
      const next = await unwrap(window.feelpost.ai.previewContext(input))
      setPreview(next)
      setPhase('generating')
      requestIdRef.current = ''
      awaitingIdRef.current = true
      const response = await unwrap(window.feelpost.ai.generate({ ...input, contextHash: next.hash }))
      requestIdRef.current = response.requestId
      awaitingIdRef.current = false
    } catch (err) {
      awaitingIdRef.current = false
      setError((err as Error).message)
      setPhase('error')
    }
  }

  async function cancel(): Promise<void> {
    if (requestIdRef.current) await window.feelpost.ai.cancel(requestIdRef.current)
    awaitingIdRef.current = false
  }

  function updateCandidateTags(index: number, tags: string[]): void {
    setResult((current) => current
      ? { ...current, cases: current.cases.map((candidate, i) => i === index ? { ...candidate, tags } : candidate) }
      : current)
  }

  function addCandidateTag(index: number, value: string, input: HTMLInputElement): void {
    const tag = value.trim().replace(/^#/, '').trim()
    if (!tag || !result) return
    const candidate = result.cases[index]
    if (!candidate || candidate.tags.includes(tag)) return
    updateCandidateTags(index, [...candidate.tags, tag])
    input.value = ''
  }

  function removeCandidateTag(index: number, tag: string): void {
    if (!result) return
    const candidate = result.cases[index]
    if (!candidate) return
    updateCandidateTags(index, candidate.tags.filter((value) => value !== tag))
  }

  function toggleScenario(scenario: AICaseScenario): void {
    const next = new Set(scenarios)
    if (next.has(scenario)) next.delete(scenario)
    else next.add(scenario)
    setScenarios(next)
  }

  async function importSelected(): Promise<void> {
    if (!result || !meta || selected.size === 0) return
    setImporting(true)
    setError('')
    try {
      const candidates = result.cases.filter((_, index) => selected.has(index))
      try {
        if (typeof window.feelpost.ai.importCases !== 'function') {
          throw new Error('AI_IMPORT_NOT_AVAILABLE')
        }
        await unwrap(window.feelpost.ai.importCases({
          projectId,
          interfaceId,
          envId,
          cases: candidates,
          meta
        }))
      } catch (err) {
        const message = (err as Error).message
        if (message !== 'AI_IMPORT_NOT_AVAILABLE' && !/No handler registered|not a function/i.test(message)) throw err
        // The renderer was started with an older preload during development.
        // Keep the workflow usable and import through the existing case API.
        for (const candidate of candidates) {
          await unwrap(window.feelpost.case.create({
            projectId,
            interfaceId,
            envId,
            name: candidate.name,
            tags: [...new Set([...(candidate.tags ?? []), 'AI'])],
            note: candidate.note,
            draft: candidate.request,
            aiMeta: { ...meta, scenario: candidate.scenario }
          }))
        }
      }
      onImported(candidates.length)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    } finally {
      setImporting(false)
    }
  }

  const model = meta?.model || configuredModel

  return (
    <div className="modal-layer ai-field-layer" onClick={(event) => { if (event.target === event.currentTarget && phase !== 'generating') onClose() }}>
      <div className="modal ai-field-modal ai-case-modal" role="dialog" aria-modal="true" aria-label="AI 生成用例">
        <header className="ai-field-head">
          <span className="ai-field-ico"><Spark /></span>
          <div>
            <h2>AI 生成用例 <span className="tag-chip ai-tag-ai">#AI</span></h2>
            <p className="small-note">当前接口 · 导入环境：{envName} · 不自动发送请求</p>
          </div>
          <span className="spacer" />
          <span className="ai-model-card">
            <span className="ai-model-card-dot" />
            <span className="ai-model-card-label">模型</span>
            <strong>{model || (phase === 'result' ? '—' : 'AI')}</strong>
            {meta?.usage?.totalTokens ? <span className="ai-model-card-usage">{meta.usage.totalTokens} tokens</span> : null}
          </span>
          <button className="btn ghost small" onClick={onClose} disabled={phase === 'generating' || importing}>关闭</button>
        </header>

        {phase === 'setup' && (
          <>
            <div className="ai-field-body">
              <div className="ai-case-intro">
                <strong>选择要生成的场景</strong>
                <p>会参考当前接口契约、已保存示例和最近 3 个用例；导入后自动添加 #AI 标签。</p>
              </div>
              <div className="ai-scenario-picker">
                {SCENARIOS.map(([key, label]) => (
                  <button key={key} className={scenarios.has(key) ? 'on' : ''} onClick={() => toggleScenario(key)}>
                    <span className="ai-scenario-check">{scenarios.has(key) ? '✓' : ''}</span>{label}
                  </button>
                ))}
              </div>
              <div className="ai-result-note">生成结果先预览，导入时才写入用例。不会自动发送请求，也不会生成断言。</div>
            </div>
            <footer className="modal-foot">
              <span className="small-note">{envName} · {scenarios.size} 个场景</span>
              <span className="spacer" />
              <button className="btn" onClick={onClose}>取消</button>
              <button className="btn primary" disabled={scenarios.size === 0} onClick={() => void generate()}>生成用例</button>
            </footer>
          </>
        )}

        {phase === 'preparing' && (
          <div className="ai-state">
            <span className="ai-spin" />
            <strong>正在准备 AI 上下文…</strong>
            <span>检查接口契约、示例与最近用例。</span>
          </div>
        )}

        {phase === 'generating' && (
          <>
            <div className="ai-field-body">
              <div className="ai-generating">
                <span className="ai-spin" />
                <strong>AI 正在生成用例</strong>
                <span>{preview ? `${preview.estimatedTokens} tokens · ${preview.redactions.length} 个敏感字段已脱敏` : '正在等待模型返回…'}</span>
              </div>
              <pre className="ai-stream" ref={streamRef}>{streamText || '正在等待模型返回…'}</pre>
            </div>
            <footer className="modal-foot">
              <span className="small-note">生成结果先预览，导入前不会写入</span>
              <span className="spacer" />
              <button className="btn danger-outline" onClick={() => void cancel()}>取消生成</button>
            </footer>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <div className="ai-field-body">
              <div className="ai-result-note">已生成 {result.cases.length} 个候选；选择后导入到「{envName}」。导入不会发送请求。</div>
              <div className="ai-case-list">
                {result.cases.map((candidate, index) => (
                  <label className={`ai-case-card ${selected.has(index) ? 'selected' : ''}`} key={`${candidate.name}-${index}`}>
                    <input className="check" type="checkbox" checked={selected.has(index)} onChange={(event) => {
                      const next = new Set(selected)
                      if (event.target.checked) next.add(index)
                      else next.delete(index)
                      setSelected(next)
                    }} />
                    <span className="ai-case-main">
                      <span className="ai-case-top">
                        <strong>{candidate.name}</strong>
                        <span className={`chip ${candidate.scenario === 'error' ? 'warn' : candidate.scenario === 'empty' ? 'muted' : 'ok'} soft`}>{scenarioLabel(candidate.scenario)}</span>
                      </span>
                      <span className="ai-case-tags" onClick={(event) => event.stopPropagation()}>
                        <span className="tag-chip ai-tag-ai">#AI</span>
                        {candidate.tags?.filter((tag) => tag !== 'AI').map((tag) => (
                          <span className="tag-chip ai-editable-tag" key={tag} style={tagStyle(tag)} title={`#${tag}`}>
                            #{tag}
                            <button type="button" aria-label={`删除标签 ${tag}`} title="删除标签" onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              removeCandidateTag(index, tag)
                            }}>×</button>
                          </span>
                        ))}
                        <input
                          className="ai-tag-input"
                          placeholder="+ 标签"
                          aria-label="添加标签"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            event.preventDefault()
                            event.stopPropagation()
                            addCandidateTag(index, event.currentTarget.value, event.currentTarget)
                          }}
                        />
                      </span>
                      <span className="ai-case-req">
                        <span className={`tag-chip ai-method-tag m-${(candidate.request.requestMethod || interfaceMethod).toLowerCase()}`}>{candidate.request.requestMethod || interfaceMethod}</span>
                        <span className="mono">{candidate.request.requestUrl || interfacePath}</span>
                      </span>
                      {candidate.note && <span className="ai-case-desc">{candidate.note}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <footer className="modal-foot">
              <span className="small-note">已选择 {selected.size} 个 · 导入环境：{envName}</span>
              <span className="spacer" />
              <button className="btn" onClick={onClose}>取消</button>
              <button className="btn primary" disabled={selected.size === 0 || importing} onClick={() => void importSelected()}>{importing ? '导入中…' : `导入 ${selected.size} 个用例`}</button>
            </footer>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="ai-field-body">
              <div className="ai-error-box">
                <strong>生成未完成</strong>
                <p>{error || '未知错误'}</p>
              </div>
            </div>
            <footer className="modal-foot">
              <span className="spacer" />
              <button className="btn" onClick={onClose}>关闭</button>
              <button className="btn primary" onClick={() => void generate()}>重新生成</button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
