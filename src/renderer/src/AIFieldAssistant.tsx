import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AIContextInput,
  AIContextPreview,
  AIFieldDescriptionResult,
  AIMeta,
  RequestDraft
} from '@shared/contract'
import { unwrap } from './api'

interface Props {
  projectId: string
  interfaceId: string
  target: 'request' | 'response'
  exampleId?: string
  draft?: RequestDraft
  existing: Record<string, string>
  onClose: () => void
  onApply: (descriptions: Record<string, string>, meta: AIMeta) => void
}

type Phase = 'preparing' | 'generating' | 'result' | 'error'

function Spark({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z" />
      <path d="M19 17.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" />
    </svg>
  )
}

export default function AIFieldAssistant({ projectId, interfaceId, target, exampleId, draft, existing, onClose, onApply }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('preparing')
  const [preview, setPreview] = useState<AIContextPreview | null>(null)
  const [result, setResult] = useState<AIFieldDescriptionResult | null>(null)
  const [meta, setMeta] = useState<AIMeta | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const [configuredModel, setConfiguredModel] = useState('')
  const requestIdRef = useRef('')
  const awaitingIdRef = useRef(false)
  const streamRef = useRef<HTMLPreElement>(null)

  const input = useMemo<AIContextInput>(() => ({
    feature: 'field-descriptions',
    projectId,
    interfaceId,
    target,
    ...(target === 'response' ? { exampleId } : {}),
    ...(draft ? { draft } : {})
  }), [projectId, interfaceId, target, exampleId, draft])

  async function generateWithPreview(next: AIContextPreview): Promise<void> {
    setPhase('generating')
    setStreamText('')
    setError('')
    requestIdRef.current = ''
    awaitingIdRef.current = true
    try {
      const response = await unwrap(window.feelpost.ai.generate({ ...input, contextHash: next.hash }))
      requestIdRef.current = response.requestId
      awaitingIdRef.current = false
    } catch (err) {
      awaitingIdRef.current = false
      setError((err as Error).message)
      setPhase('error')
    }
  }

  async function begin(): Promise<void> {
    setPhase('preparing')
    setError('')
    try {
      const next = await unwrap(window.feelpost.ai.previewContext(input))
      setPreview(next)
      await generateWithPreview(next)
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  useEffect(() => {
    void begin()
  }, [])

  useEffect(() => {
    void window.feelpost.ai.getConfig().then((result) => {
      if (result.ok) setConfiguredModel(result.data.model)
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
        const value = payload.result as AIFieldDescriptionResult
        const initial = new Set<string>()
        for (const field of value.fields) {
          if (existing[field.path] !== field.description) initial.add(field.path)
        }
        setResult(value)
        setSelected(initial)
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
  }, [existing])

  async function cancel(): Promise<void> {
    if (requestIdRef.current) await window.feelpost.ai.cancel(requestIdRef.current)
    awaitingIdRef.current = false
  }

  function apply(): void {
    if (!result || !meta || selected.size === 0) return
    const descriptions: Record<string, string> = {}
    for (const field of result.fields) {
      if (selected.has(field.path)) descriptions[field.path] = field.description
    }
    onApply(descriptions, meta)
    onClose()
  }

  const title = target === 'request' ? 'AI 补全请求体字段说明' : 'AI 补全响应字段说明'

  return (
    <div className="modal-layer ai-field-layer" onClick={(event) => { if (event.target === event.currentTarget && phase !== 'generating') onClose() }}>
      <div className="modal ai-field-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="ai-field-head">
          <span className="ai-field-ico"><Spark size={18} /></span>
          <div>
            <h2>{title} <span className="tag-chip ai-tag-ai">#AI</span></h2>
            <p className="small-note">{target === 'request' ? '请求体' : '响应示例'} · 只补字段说明，不修改字段结构</p>
          </div>
          <span className="spacer" />
          <span className="ai-model-card" title={meta?.model ? `模型：${meta.model}` : 'AI 模型'}>
            <span className="ai-model-card-dot" />
            <span className="ai-model-card-label">模型</span>
            <strong>{meta?.model || configuredModel || (phase === 'result' ? '—' : 'AI')}</strong>
            {meta?.usage?.totalTokens ? <span className="ai-model-card-usage">{meta.usage.totalTokens} tokens</span> : null}
          </span>
          <button className="btn ghost small" onClick={onClose} disabled={phase === 'generating'}>关闭</button>
        </header>

        {phase === 'preparing' && (
          <div className="ai-state">
            <span className="ai-spin" />
            <strong>正在准备 AI 上下文…</strong>
            <span>检查接口契约、示例与脱敏规则，随后自动生成。</span>
          </div>
        )}

        {phase === 'generating' && (
          <>
            <div className="ai-field-body">
              <div className="ai-generating">
                <span className="ai-spin" />
                <strong>AI 正在生成字段说明</strong>
                <span>{preview ? `${preview.estimatedTokens} tokens · ${preview.redactions.length} 个敏感字段已脱敏` : '正在等待模型返回…'}</span>
              </div>
              <pre className="ai-stream" ref={streamRef}>{streamText || '正在等待模型返回…'}</pre>
            </div>
            <footer className="modal-foot">
              <span className="small-note">生成结果会先进入 Diff 确认，不会自动写入</span>
              <span className="spacer" />
              <button className="btn danger-outline" onClick={() => void cancel()}>取消生成</button>
            </footer>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <div className="ai-field-body">
              <div className="ai-result-note">默认只应用新增字段；已有说明需手动勾选覆盖。应用后记录 AI 元信息。</div>
              <table className="ai-field-table">
                <thead><tr><th style={{ width: 38 }} /><th>字段</th><th>当前说明</th><th>AI 建议</th><th style={{ width: 72 }}>操作</th></tr></thead>
                <tbody>
                  {result.fields.map((field) => {
                    const current = existing[field.path] ?? ''
                    const changed = current !== field.description
                    const checked = selected.has(field.path)
                    return (
                      <tr key={field.path}>
                        <td><input className="check" type="checkbox" checked={checked} disabled={!changed} onChange={(event) => {
                          const next = new Set(selected)
                          if (event.target.checked) next.add(field.path)
                          else next.delete(field.path)
                          setSelected(next)
                        }} /></td>
                        <td className="mono field-path">{field.path}</td>
                        <td className={current ? '' : 'muted'}>{current || '暂无说明'}</td>
                        <td><span className={changed ? 'ai-diff-new' : ''}>{field.description}</span></td>
                        <td>{!changed ? <span className="chip muted">无变化</span> : current ? <span className="chip warn soft">覆盖</span> : <span className="chip ok soft">新增</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <footer className="modal-foot">
              <span className="small-note">已选择 {selected.size} 项 · {meta?.usage?.totalTokens ? `${meta.usage.totalTokens} tokens` : 'token 用量未知'}</span>
              <span className="spacer" />
              <button className="btn" onClick={onClose}>取消</button>
              <button className="btn primary" disabled={selected.size === 0} onClick={apply}>应用所选</button>
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
              <button className="btn primary" onClick={() => void begin()}>重新预览</button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
