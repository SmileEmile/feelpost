import { useEffect, useRef, useState } from 'react'
import type {
  AIContextPreview,
  AICompletedPayload,
  AIHandoffResult,
  AIMeta
} from '@shared/contract'
import { unwrap } from './api'
import { renderMarkdown } from './markdown'
import { mergeMarkdown } from './ai-doc-merge'

interface Props {
  projectId: string
  projectName: string
  caseIds: string[]
  onClose: () => void
  notify: (message: string) => void
}

type Phase = 'planning' | 'generating' | 'result' | 'error'

interface Batch {
  caseIds: string[]
  preview: AIContextPreview
}

export default function AICaseDocExport({ projectId, projectName, caseIds, onClose, notify }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('planning')
  const [result, setResult] = useState<AIHandoffResult | null>(null)
  const [meta, setMeta] = useState<AIMeta | null>(null)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const [name, setName] = useState(`${projectName}-用例联调文档`)
  const [tab, setTab] = useState<'preview' | 'source'>('preview')
  const [exporting, setExporting] = useState(false)
  const [batchIndex, setBatchIndex] = useState(0)
  const [batchTotal, setBatchTotal] = useState(1)
  const [truncated, setTruncated] = useState(false)
  const requestIdRef = useRef('')
  const batchResolveRef = useRef<{ resolve: (payload: AICompletedPayload) => void; reject: (error: Error) => void } | null>(null)
  const streamRef = useRef<HTMLPreElement>(null)
  const startedRef = useRef(false)
  const cancelledRef = useRef(false)
  const planRef = useRef<Batch[]>([])
  const fragmentsRef = useRef<string[]>([])
  const metasRef = useRef<AIMeta[]>([])
  const nextBatchRef = useRef(0)
  const fileNameRef = useRef('')

  function acceptRequest(id: string): boolean {
    if (!batchResolveRef.current) return false
    if (!requestIdRef.current) requestIdRef.current = id
    return requestIdRef.current === id
  }

  useEffect(() => {
    const offs = [
      window.feelpost.ai.onStream((payload) => {
        if (acceptRequest(payload.requestId)) setStreamText((current) => current + payload.delta)
      }),
      window.feelpost.ai.onCompleted((payload) => {
        if (!acceptRequest(payload.requestId)) return
        const resolver = batchResolveRef.current
        batchResolveRef.current = null
        resolver?.resolve(payload)
      }),
      window.feelpost.ai.onFailed((payload) => {
        if (!acceptRequest(payload.requestId)) return
        const resolver = batchResolveRef.current
        batchResolveRef.current = null
        resolver?.reject(new Error(payload.error.message))
      }),
      window.feelpost.ai.onCancelled((payload) => {
        if (!acceptRequest(payload.requestId)) return
        const resolver = batchResolveRef.current
        batchResolveRef.current = null
        resolver?.reject(new Error('AI 生成已取消。'))
      })
    ]
    void window.feelpost.ai.getConfig().then((response) => {
      if (response.ok) setModel(response.data.model)
    })
    return () => { offs.forEach((off) => off()) }
  }, [])

  useEffect(() => {
    const element = streamRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [streamText])

  async function planBatches(): Promise<Batch[]> {
    const groups = new Map<string, string[]>()
    for (const caseId of caseIds) {
      const detail = await unwrap(window.feelpost.case.get(projectId, caseId))
      const list = groups.get(detail.apiId) ?? []
      list.push(caseId)
      groups.set(detail.apiId, list)
    }

    async function split(ids: string[]): Promise<Batch[]> {
      try {
        const preview = await unwrap(window.feelpost.ai.previewContext({ feature: 'case-doc', projectId, caseIds: ids }))
        if (preview.truncated && ids.length > 1) {
          const middle = Math.ceil(ids.length / 2)
          return [...await split(ids.slice(0, middle)), ...await split(ids.slice(middle))]
        }
        if (preview.truncated) setTruncated(true)
        return [{ caseIds: ids, preview }]
      } catch (err) {
        const message = (err as Error).message
        if (ids.length > 1 && message.includes('上下文过大')) {
          const middle = Math.ceil(ids.length / 2)
          return [...await split(ids.slice(0, middle)), ...await split(ids.slice(middle))]
        }
        throw err
      }
    }

    const batches: Batch[] = []
    for (const ids of groups.values()) batches.push(...await split(ids))
    return batches
  }

  async function requestBatch(batch: Batch): Promise<AICompletedPayload> {
    setStreamText('')
    setPhase('generating')
    requestIdRef.current = ''
    const payloadPromise = new Promise<AICompletedPayload>((resolve, reject) => {
      batchResolveRef.current = { resolve, reject }
    })
    try {
      const response = await unwrap(window.feelpost.ai.generate({
        feature: 'case-doc',
        projectId,
        caseIds: batch.caseIds,
        contextHash: batch.preview.hash
      }))
      if (!requestIdRef.current) requestIdRef.current = response.requestId
      return await payloadPromise
    } catch (err) {
      batchResolveRef.current = null
      throw err
    }
  }

  async function generate(resume = false): Promise<void> {
    cancelledRef.current = false
    setError('')
    setPhase(resume ? 'generating' : 'planning')
    if (!resume) {
      setResult(null)
      setMeta(null)
      setStreamText('')
      setTruncated(false)
      setBatchIndex(0)
      setBatchTotal(1)
      planRef.current = []
      fragmentsRef.current = []
      metasRef.current = []
      nextBatchRef.current = 0
      fileNameRef.current = ''
    }
    try {
      if (!resume) {
        planRef.current = await planBatches()
        if (cancelledRef.current) throw new Error('AI 生成已取消。')
        if (planRef.current.length === 0) throw new Error('没有可生成的用例。')
        setBatchTotal(planRef.current.length)
        setBatchIndex(1)
      }
      const batches = planRef.current
      for (let index = nextBatchRef.current; index < batches.length; index += 1) {
        if (cancelledRef.current) throw new Error('AI 生成已取消。')
        setBatchIndex(index + 1)
        const payload = await requestBatch(batches[index])
        const value = payload.result as AIHandoffResult
        fragmentsRef.current.push(value.markdown)
        metasRef.current.push(payload.meta)
        if (!fileNameRef.current && value.fileName) fileNameRef.current = value.fileName
        nextBatchRef.current = index + 1
      }
      const markdown = mergeMarkdown(fragmentsRef.current)
      const metas = metasRef.current
      const last = metas[metas.length - 1]
      const totalTokens = metas.reduce((sum, item) => sum + (item.usage?.totalTokens ?? 0), 0)
      const allCached = metas.every((item) => item.cached)
      const finalMeta: AIMeta = {
        ...last,
        cached: allCached || undefined,
        usage: totalTokens > 0 ? {
          promptTokens: metas.reduce((sum, item) => sum + (item.usage?.promptTokens ?? 0), 0),
          completionTokens: metas.reduce((sum, item) => sum + (item.usage?.completionTokens ?? 0), 0),
          totalTokens
        } : undefined
      }
      setMeta(finalMeta)
      setResult({ schemaVersion: 1, fileName: fileNameRef.current || undefined, markdown, typescript: '' })
      if (fileNameRef.current) setName(fileNameRef.current.replace(/\.md$/i, ''))
      nextBatchRef.current = 0
      setPhase('result')
    } catch (err) {
      if (cancelledRef.current) setError('AI 生成已取消。')
      else setError((err as Error).message)
      setPhase('error')
    } finally {
      batchResolveRef.current = null
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void generate()
  }, [])

  async function cancel(): Promise<void> {
    cancelledRef.current = true
    setError('AI 生成已取消。')
    setPhase('error')
    if (requestIdRef.current) await window.feelpost.ai.cancel(requestIdRef.current)
  }

  async function exportMarkdown(): Promise<void> {
    if (!result) return
    setExporting(true)
    setError('')
    try {
      const saved = await unwrap(window.feelpost.doc.saveMarkdown({ markdown: result.markdown, suggestedName: name }))
      if (saved.saved) notify(`已导出：${saved.path}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-layer ai-field-layer" onClick={(event) => { if (event.target === event.currentTarget && phase !== 'generating' && !exporting) onClose() }}>
      <div className="modal ai-field-modal ai-case-doc-modal" role="dialog" aria-modal="true" aria-label="AI 用例联调文档">
        <header className="ai-field-head">
          <span className="ai-field-ico">AI</span>
          <div>
            <h2>AI 导出用例文档 <span className="tag-chip ai-tag-ai">#AI</span></h2>
            <p className="small-note">{caseIds.length} 个用例 · {batchTotal > 1 ? `${batchTotal} 个生成批次 · ` : ''}使用当前用例参数与响应示例生成</p>
          </div>
          <span className="spacer" />
          <div className="ai-model-meta">
            <span className="ai-model-card">
              <span className="ai-model-card-dot" />
              <span className="ai-model-card-label">模型</span>
              <strong>{meta?.model || model || (phase === 'result' ? '—' : 'AI')}</strong>
              {meta?.usage?.totalTokens ? <span className="ai-model-card-usage">{meta.usage.totalTokens} tokens</span> : null}
            </span>
            {meta?.cached && <span className="chip ok soft ai-cache-chip">缓存</span>}
          </div>
          <button className="btn ghost small" onClick={onClose} disabled={phase === 'generating' || exporting}>关闭</button>
        </header>

        {phase === 'planning' && (
          <div className="ai-state"><span className="ai-spin" /><strong>正在规划生成批次…</strong><span>按接口分组，并检查上下文大小。</span></div>
        )}

        {phase === 'generating' && (
          <>
            <div className="ai-field-body">
              <div className="ai-generating">
                <span className="ai-spin" />
                <strong>AI 正在生成第 {batchIndex}/{batchTotal} 批</strong>
                <span>分批生成后合并为一个 Markdown，不会修改已有用例</span>
              </div>
              <pre className="ai-stream" ref={streamRef}>{streamText || '正在等待模型返回…'}</pre>
            </div>
            <footer className="modal-foot">
              <span className="small-note">{batchTotal > 1 ? '正在分批生成，已完成的批次会自动复用' : '生成结果先预览，保存后才会写入文件'}</span>
              <span className="spacer" />
              <button className="btn danger-outline" onClick={() => void cancel()}>取消生成</button>
            </footer>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <div className="ai-field-body">
              <div className="ai-doc-result-head">
                <label className="field ai-doc-name"><span>文件名</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} /></label>
                <div className="resp-tabs ai-doc-tabs">
                  <button className={`resp-tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')}>预览</button>
                  <button className={`resp-tab ${tab === 'source' ? 'active' : ''}`} onClick={() => setTab('source')}>Markdown 源码</button>
                </div>
              </div>
              {tab === 'preview' ? (
                <article className="doc-preview ai-doc-preview ai-case-doc-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }} />
              ) : (
                <pre className="ai-doc-output">{result.markdown}</pre>
              )}
            </div>
            <footer className="modal-foot">
              <span className="small-note">
                {meta?.cached ? '使用本地缓存 · 参数与响应示例未变化' : `${caseIds.length} 个用例${batchTotal > 1 ? ` · ${batchTotal} 批` : ''}${truncated ? ' · 部分示例已截断' : ''}`}
              </span>
              <span className="spacer" />
              <button className="btn" onClick={() => void navigator.clipboard.writeText(result.markdown).then(() => notify('Markdown 已复制'))}>复制</button>
              <button className="btn primary" disabled={exporting || !name.trim()} onClick={() => void exportMarkdown()}>{exporting ? '导出中…' : '导出 Markdown'}</button>
            </footer>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="ai-field-body">
              <div className="ai-error-box">
                <strong>生成未完成</strong>
                <p>{error || '未知错误'}</p>
                {nextBatchRef.current > 0 && planRef.current.length > 0 && (
                  <p>已完成 {nextBatchRef.current}/{planRef.current.length} 批，重试会复用已完成批次的缓存。</p>
                )}
              </div>
            </div>
            <footer className="modal-foot">
              <span className="spacer" />
              <button className="btn" onClick={onClose}>关闭</button>
              {nextBatchRef.current > 0 && planRef.current.length > 0 ? (
                <>
                  <button className="btn" onClick={() => void generate(false)}>全部重新生成</button>
                  <button className="btn primary" onClick={() => void generate(true)}>重试失败批次</button>
                </>
              ) : (
                <button className="btn primary" onClick={() => void generate(false)}>重新生成</button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
