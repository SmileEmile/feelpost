import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocProjectOptions, HttpMethod, InterfaceStatus, ProjectDetail } from '@shared/contract'
import { unwrap } from './api'
import { renderMarkdown } from './markdown'
import SelectMenu from './SelectMenu'
import Message from './Message'

interface Props {
  project: ProjectDetail
  envId: string
  notify: (message: string) => void
}

function DocsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

export default function DocsView({ project, envId, notify }: Props): JSX.Element {
  const [scope, setScope] = useState<'active' | 'all'>('active')
  const [includeManual, setIncludeManual] = useState(true)
  const [view, setView] = useState<'preview' | 'source'>('preview')
  const [filters, setFilters] = useState({ name: '', method: 'ALL', path: '', status: 'ALL', module: 'ALL' })
  const [modules, setModules] = useState<string[]>([])
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const requestRef = useRef(0)
  const docsBodyRef = useRef<HTMLDivElement>(null)

  const env = useMemo(
    () => project.environments.find((item) => item.id === envId)
      ?? project.environments.find((item) => item.isDefault)
      ?? project.environments[0],
    [project.environments, envId]
  )

  useEffect(() => {
    void window.feelpost.catalog.list(project.id).then((result) => {
      if (result.ok) setModules(result.data.modules.map((item) => item.name))
    })
  }, [project.id])

  const pageSize = 10

  function docOptions(offset: number): DocProjectOptions {
    return {
      projectId: project.id,
      scope,
      includeManual,
      envId,
      filter: {
        name: filters.name.trim() || undefined,
        method: filters.method === 'ALL' ? undefined : filters.method as HttpMethod,
        path: filters.path.trim() || undefined,
        status: filters.status === 'ALL' ? undefined : filters.status as InterfaceStatus,
        module: filters.module === 'ALL' ? undefined : filters.module
      },
      limit: pageSize,
      offset
    }
  }

  async function loadMore(): Promise<void> {
    if (loading || loadingMore || !hasMore) return
    const sequence = ++requestRef.current
    setLoadingMore(true)
    try {
      const result = await window.feelpost.doc.previewProject(docOptions(nextOffset))
      if (!result.ok) {
        if (sequence === requestRef.current) setError(result.error.message)
        return
      }
      if (sequence !== requestRef.current) return
      setMarkdown((current) => `${current}${current && result.data.markdown ? '\n' : ''}${result.data.markdown}`)
      setTotal(result.data.total)
      setNextOffset(result.data.nextOffset)
      setHasMore(result.data.hasMore)
    } catch (err) {
      if (sequence === requestRef.current) setError((err as Error).message)
    } finally {
      if (sequence === requestRef.current) setLoadingMore(false)
    }
  }

  useEffect(() => {
    let active = true
    const sequence = ++requestRef.current
    setLoading(true)
    setLoadingMore(false)
    setMarkdown('')
    const timer = window.setTimeout(() => {
      void window.feelpost.doc.previewProject(docOptions(0)).then((result) => {
        if (!active || sequence !== requestRef.current) return
        if (result.ok) {
          setMarkdown(result.data.markdown)
          setTotal(result.data.total)
          setNextOffset(result.data.nextOffset)
          setHasMore(result.data.hasMore)
          setError('')
        } else {
          setError(result.error.message)
        }
      }).finally(() => {
        if (active && sequence === requestRef.current) setLoading(false)
      })
    }, 120)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [project.id, scope, includeManual, envId, filters])

  function onDocsScroll(event: React.UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) void loadMore()
  }

  async function copyMarkdown(): Promise<void> {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      notify('Markdown 已复制')
      window.setTimeout(() => setCopied(false), 1200)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function exportMarkdown(): Promise<void> {
    try {
      const result = await unwrap(
        window.feelpost.doc.exportProject({
          projectId: project.id,
          scope,
          includeManual,
          envId,
          filter: {
            name: filters.name.trim() || undefined,
            method: filters.method === 'ALL' ? undefined : filters.method as HttpMethod,
            path: filters.path.trim() || undefined,
            status: filters.status === 'ALL' ? undefined : filters.status as InterfaceStatus,
            module: filters.module === 'ALL' ? undefined : filters.module
          }
        })
      )
      if (result.saved) notify(`已导出：${result.path}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="docs-layout">
      <aside className="docs-side">
        <div className="docs-side-head"><h2>文档</h2><span className="count">项目</span></div>
        <div className="docs-nav-list">
          <button className="docs-nav active">
            <span className="docs-nav-icon"><DocsIcon /></span>
            <span className="docs-nav-copy"><strong>项目接口文档</strong><small>全部接口契约</small></span>
          </button>
        </div>
        <p className="small-note docs-side-note">按接口组织：每个接口包含生效参数、请求示例和响应示例。</p>
      </aside>

      <main className="docs-main">
        <header className="docs-head docs-head-title">
          <div>
            <h2>项目接口文档</h2>
            <p className="small-note">人工层会覆盖源码层；归档接口默认不导出。</p>
          </div>
          <span className="spacer" />
          <button className="btn" disabled={!markdown} onClick={() => void copyMarkdown()}>{copied ? '已复制' : '复制 Markdown'}</button>
          <button className="btn primary" onClick={() => void exportMarkdown()}>导出 Markdown</button>
        </header>

        <div className="docs-controls">
          <div className="docs-control">
            <span>范围</span>
            <SelectMenu
              value={scope}
              onChange={(value) => setScope(value as 'active' | 'all')}
              options={[{ value: 'active', label: '已注册 + 已变更' }, { value: 'all', label: '全部接口' }]}
            />
          </div>
          <label className="check-wrap">
            <input type="checkbox" checked={includeManual} onChange={(event) => setIncludeManual(event.target.checked)} />
            包含手工接口
          </label>
          <span className="chip muted">环境：{env?.name ?? '未配置'}</span>
          <span className="spacer" />
        </div>

        <div className="docs-filter-bar">
          <span className="docs-filter-label">筛选</span>
          <input className="docs-filter-input" value={filters.name} placeholder="按名称筛选" onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
          <SelectMenu
            value={filters.method}
            onChange={(value) => setFilters({ ...filters, method: value })}
            options={[
              { value: 'ALL', label: '全部方法' }, { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' }, { value: 'DELETE', label: 'DELETE' }
            ]}
          />
          <input className="docs-filter-input" value={filters.path} placeholder="按路径筛选" onChange={(event) => setFilters({ ...filters, path: event.target.value })} />
          <SelectMenu
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            options={[
              { value: 'ALL', label: '全部状态' }, { value: 'registered', label: '已注册' },
              { value: 'changed', label: '已变更' }, { value: 'archived', label: '已归档' }
            ]}
          />
          <SelectMenu
            value={filters.module}
            onChange={(value) => setFilters({ ...filters, module: value })}
            options={[{ value: 'ALL', label: '全部模块' }, ...modules.map((name) => ({ value: name, label: name }))]}
          />
          <span className="spacer" />
          <button className="btn ghost small" onClick={() => setFilters({ name: '', method: 'ALL', path: '', status: 'ALL', module: 'ALL' })}>清空筛选</button>
        </div>

        <Message text={error} onClose={() => setError('')} />

        <div className="docs-toolbar">
          <div className="resp-tabs">
            <button className={`resp-tab ${view === 'preview' ? 'active' : ''}`} onClick={() => setView('preview')}>预览</button>
            <button className={`resp-tab ${view === 'source' ? 'active' : ''}`} onClick={() => setView('source')}>Markdown 源码</button>
          </div>
          <span className="spacer" />
          <span className="small-note">{loading ? '生成中…' : markdown ? `${markdown.length} 字符 · ${total} 个接口` : ''}</span>
        </div>

        <div className="docs-body" ref={docsBodyRef} onScroll={onDocsScroll}>
          {loading && !markdown ? (
            <div className="resp-empty"><span className="small-note">正在生成文档…</span></div>
          ) : view === 'preview' ? (
            <article className="doc-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
          ) : (
            <pre className="doc-source">{markdown}</pre>
          )}
          {loadingMore && <div className="docs-load-more"><span className="ai-spin" />正在加载更多接口…</div>}
        </div>
      </main>
    </div>
  )
}
