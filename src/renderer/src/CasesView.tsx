import { useEffect, useMemo, useState } from 'react'
import type { CaseDetail, CaseSummary, ParamRow, ProjectDetail, ResponseExample } from '@shared/contract'
import { unwrap } from './api'
import { tagStyle } from './tag-color'
import AICaseDocExport from './AICaseDocExport'
import Message from './Message'

interface Props {
  project: ProjectDetail
  notify: (message: string) => void
  onChanged: () => void
  onGoInterfaces: () => void
  aiEnabled: boolean
}

type ActionIconName = 'eye' | 'pencil' | 'copy' | 'download' | 'spark' | 'trash'

function ActionIcon({ name }: { name: ActionIconName }): JSX.Element {
  const paths: Record<ActionIconName, string[]> = {
    eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    pencil: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
    copy: ['M8 8h11v12H8z', 'M5 16H3V4h11v2'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'],
    spark: ['M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v5M14 11v5']
  }
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name].map((path) => <path key={path} d={path} />)}</svg>
}

function StatIcon({ name }: { name: 'cases' | 'interfaces' | 'envs' | 'tags' }): JSX.Element {
  const paths = name === 'cases'
    ? ['M4 4h16v16H4z', 'M8 12l3 3 5-6']
    : name === 'interfaces'
      ? ['M8 4a3 3 0 0 0-3 3v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a3 3 0 0 0 3 3', 'M16 4a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a3 3 0 0 1-3 3']
      : name === 'envs'
        ? ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9z']
        : ['M20 12l-8 8-8-8 8-8z', 'M8 12h8']
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map((path) => <path key={path} d={path} />)}</svg>
}

function quote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

function buildCurl(item: CaseDetail): string {
  const snapshot = item.requestSnapshot
  const absolute = /^\/?https?:\/\//i.test(snapshot.path)
  let path = snapshot.path.replace(/^\/(?=https?:\/\/)/i, '').replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(snapshot.pathParams[key] ?? ''))
  if (!absolute && !path.startsWith('/')) path = `/${path}`
  const query = new URLSearchParams()
  for (const row of snapshot.query) {
    if (row.enabled && row.key.trim()) query.append(row.key, row.value)
  }
  const queryString = query.toString()
  const url = absolute
    ? `${path}${queryString ? `${path.includes('?') ? '&' : '?'}${queryString}` : ''}`
    : `${snapshot.baseUrl.replace(/\/+$/, '')}${path}${queryString ? `?${queryString}` : ''}`
  const lines = [`curl -X ${snapshot.method} ${quote(url)}`]
  for (const row of snapshot.headers) {
    if (row.enabled && row.key.trim()) lines.push(`  -H ${quote(`${row.key}: ${row.value}`)}`)
  }
  const cookies = snapshot.cookies.filter((row) => row.enabled && row.key.trim())
  if (cookies.length > 0) lines.push(`  -H ${quote(`Cookie: ${cookies.map((row) => `${row.key}=${row.value}`).join('; ')}`)}`)
  if (snapshot.bodyType === 'raw' && snapshot.bodyRaw) {
    lines.push(`  --data-raw ${quote(snapshot.bodyRaw)}`)
  } else if (snapshot.bodyType === 'urlencoded') {
    const body = (snapshot.formRows ?? []).filter((row) => row.enabled && row.key.trim()).map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&')
    if (body) lines.push(`  --data-raw ${quote(body)}`)
  } else if (snapshot.bodyType === 'form-data') {
    for (const row of snapshot.formRows ?? []) {
      if (row.enabled && row.key.trim()) lines.push(`  --form ${quote(`${row.key}=${row.value}`)}`)
    }
  }
  return lines.join(' \\\n')
}

function interfaceLabel(item: CaseSummary): string {
  return item.interfaceName || `${item.method} ${item.path}`
}

export default function CasesView({ project, notify, onChanged, onGoInterfaces, aiEnabled }: Props): JSX.Element {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [tag, setTag] = useState('ALL')
  const [keyword, setKeyword] = useState('')
  const [deleteTags, setDeleteTags] = useState<string[]>([])
  const [tagMenu, setTagMenu] = useState<{ name: string; x: number; y: number } | null>(null)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [responseExamples, setResponseExamples] = useState<ResponseExample[]>([])
  const [editing, setEditing] = useState<CaseSummary | null>(null)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editNote, setEditNote] = useState('')
  const [deleting, setDeleting] = useState<CaseSummary | null>(null)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [deleteTagsOpen, setDeleteTagsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aiExportCaseIds, setAIExportCaseIds] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  async function reload(): Promise<void> {
    try {
      setCases(await unwrap(window.feelpost.case.list(project.id)))
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [project.id])

  const tags = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of cases) for (const value of item.tags) map.set(value, (map.get(value) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [cases])

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    return cases.filter((item) => {
      if (tag !== 'ALL' && !item.tags.includes(tag)) return false
      if (!text) return true
      return `${item.name} ${item.interfaceName} ${item.method} ${item.path} ${item.tags.join(' ')}`.toLowerCase().includes(text)
    })
  }, [cases, tag, keyword])

  const affectedByDeleteTags = useMemo(
    () => cases.filter((item) => item.tags.some((value) => deleteTags.includes(value))).length,
    [cases, deleteTags]
  )

  const stats = useMemo(
    () => ({
      total: cases.length,
      interfaces: new Set(cases.map((item) => item.apiId)).size,
      envs: new Set(cases.map((item) => item.envId)).size,
      tags: tags.length
    }),
    [cases, tags]
  )

  async function openDetail(item: CaseSummary): Promise<void> {
    try {
      const [full, examples] = await Promise.all([
        unwrap(window.feelpost.case.get(project.id, item.id)),
        unwrap(window.feelpost.example.list(project.id, item.apiId))
      ])
      setDetail(full)
      setResponseExamples(examples)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function closeDetail(): void {
    setDetail(null)
    setResponseExamples([])
  }

  function openEdit(item: CaseSummary): void {
    setEditing(item)
    setEditName(item.name)
    setEditTags(item.tags.join(', '))
    setEditNote('')
    void window.feelpost.case.get(project.id, item.id).then((result) => {
      if (result.ok) setEditNote(result.data.note)
    })
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return
    setBusy(true)
    try {
      await unwrap(
        window.feelpost.case.update({
          projectId: project.id,
          caseId: editing.id,
          patch: {
            name: editName,
            tags: editTags.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
            note: editNote
          }
        })
      )
      setEditing(null)
      await reload()
      onChanged()
      notify('用例已更新')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(item: CaseSummary): Promise<void> {
    try {
      const copy = await unwrap(window.feelpost.case.duplicate({ projectId: project.id, caseId: item.id }))
      await reload()
      onChanged()
      notify(`已复制为「${copy.name}」`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeCase(): Promise<void> {
    if (!deleting) return
    setBusy(true)
    try {
      await unwrap(window.feelpost.case.remove(project.id, deleting.id))
      setDeleting(null)
      await reload()
      onChanged()
      notify('用例已删除')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openAIExport(caseIds: string[]): void {
    if (!aiEnabled) {
      notify('请先在设置中接入 AI')
      return
    }
    if (caseIds.length === 0) {
      notify('请先选择要导出的标签')
      return
    }
    setAIExportCaseIds(caseIds)
  }

  function exportSelectedCases(): void {
    if (tag === 'ALL') {
      notify('请先在左侧选择一个标签')
      return
    }
    const selected = cases.filter((item) => item.tags.includes(tag))
    openAIExport(selected.map((item) => item.id))
  }

  async function exportPlainCases(caseIds?: string[], tagsOverride?: string[]): Promise<void> {
    const tagsToExport = tagsOverride ?? (caseIds ? undefined : tag === 'ALL' ? [] : [tag])
    if (!caseIds && (!tagsToExport || tagsToExport.length === 0)) {
      notify('请先在左侧选择一个标签')
      return
    }
    try {
      const result = await unwrap(window.feelpost.doc.exportCases({
        projectId: project.id,
        tags: caseIds ? undefined : tagsToExport,
        caseIds
      }))
      if (result.saved) notify(`已导出：${result.path}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeSelectedTags(): Promise<void> {
    if (deleteTags.length === 0) return
    setBusy(true)
    try {
      const caseApi = window.feelpost.case
      if (!caseApi || typeof caseApi.removeTags !== 'function') {
        setDeleteTagsOpen(false)
        notify('标签删除功能需要重启应用后生效')
        return
      }
      const result = await unwrap(caseApi.removeTags(project.id, deleteTags))
      const removed = new Set(deleteTags)
      setDeleteTags([])
      if (removed.has(tag)) setTag('ALL')
      setDeleteTagsOpen(false)
      await reload()
      onChanged()
      const deletedCount = typeof result.deleted === 'number' ? result.deleted : 0
      notify(`已删除 ${deletedCount} 个用例及相关标签`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openTagActions(event: React.MouseEvent, name: string): void {
    event.preventDefault()
    setTag(name)
    setTagMenu({
      name,
      x: Math.min(event.clientX, window.innerWidth - 150),
      y: Math.min(event.clientY, window.innerHeight - 135)
    })
  }

  useEffect(() => {
    if (!tagMenu) return
    const close = (): void => setTagMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [tagMenu])


  async function copyCurl(item: CaseSummary): Promise<void> {
    try {
      const full = await unwrap(window.feelpost.case.get(project.id, item.id))
      await navigator.clipboard.writeText(buildCurl(full))
      notify('curl 已复制')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="cases-layout">
      <aside className="cases-side">
        <div className="cases-side-head">
          <h2>用例</h2><span className="count">{cases.length}</span>
        </div>
        <div className="cases-bulk-actions">
          <button
            className={`btn ai-action cases-ai-export ${aiEnabled ? '' : 'needs-config'}`}
            title={!aiEnabled ? '请先在设置中接入 AI' : tag !== 'ALL' ? `AI 整理标签 #${tag} 下的用例并导出` : '请先在左侧选择一个标签'}
            onClick={exportSelectedCases}
          >
            <span aria-hidden="true">✦</span> AI 导出
          </button>
          {!aiEnabled && <span className="small-note cases-ai-hint">接入 AI 后可智能整理文档</span>}
          <div className="cases-bulk-secondary">
            <button
              className="btn small"
              disabled={tag === 'ALL'}
              title={tag !== 'ALL' ? `导出标签 #${tag} 下的用例` : '请先在左侧选择一个标签'}
              onClick={() => void exportPlainCases()}
            >
              导出
            </button>
            <button
              className="btn danger-outline small"
              disabled={tag === 'ALL'}
              title={tag !== 'ALL' ? `删除标签 #${tag} 及其用例` : '请先在左侧选择一个标签'}
              onClick={() => { setDeleteTags([tag]); setDeleteTagsOpen(true) }}
            >
              删除
            </button>
          </div>
        </div>
        <button className={`case-tag ${tag === 'ALL' ? 'active' : ''}`} onClick={() => setTag('ALL')}>
          <span>全部用例</span><span>{cases.length}</span>
        </button>
        {tags.map(([name, count]) => (
          <div className="case-tag-row" key={name} onContextMenu={(event) => openTagActions(event, name)}>
            <button
              className={`case-tag ${tag === name ? 'active' : ''}`}
              onClick={() => setTag(name)}
              title={`#${name} · 右键：AI 导出 / 导出 / 删除标签`}
            >
              <span className="tag-chip" style={tagStyle(name)}>#{name}</span>
              <span className="case-tag-count">{count}</span>
            </button>
          </div>
        ))}
        {tags.length === 0 && <p className="small-note" style={{ padding: '6px 8px' }}>暂无标签</p>}
        {tags.length > 0 && <p className="small-note cases-tag-hint">右键标签：AI 导出 / 导出 / 删除</p>}
      </aside>

      <main className="cases-main">
        <header className="cases-head">
          <div>
            <h2>用例</h2>
            <p className="small-note">请求快照冻结保存，接口变更只提示、不改写。</p>
          </div>
          <div className="spacer" />
          <input className="cases-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索用例 / 接口 / 路径" />
        </header>

        <Message text={error} onClose={() => setError('')} />

        <div className="case-stats">
          <div className="stat-card"><div className="stat-card-head"><span className="stat-card-icon"><StatIcon name="cases" /></span><span>用例总数</span></div><strong>{stats.total}</strong></div>
          <div className="stat-card"><div className="stat-card-head"><span className="stat-card-icon"><StatIcon name="interfaces" /></span><span>覆盖接口</span></div><strong>{stats.interfaces}</strong></div>
          <div className="stat-card"><div className="stat-card-head"><span className="stat-card-icon"><StatIcon name="envs" /></span><span>涉及环境</span></div><strong>{stats.envs}</strong></div>
          <div className="stat-card"><div className="stat-card-head"><span className="stat-card-icon"><StatIcon name="tags" /></span><span>标签数</span></div><strong>{stats.tags}</strong></div>
        </div>

        {!loading && cases.length === 0 ? (
          <div className="eff-empty-card" style={{ marginTop: 16 }}>
            <strong>还没有用例</strong>
            <span className="small-note">在接口调试页发送请求后，点击「保存用例」。</span>
            <button className="btn primary" onClick={onGoInterfaces}>去接口调试</button>
          </div>
        ) : (
          <div className="case-table-wrap">
            <table className="case-table">
              <thead>
                <tr><th>序号</th><th>用例名</th><th>接口</th><th>环境</th><th>标签</th><th>保存时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr key={item.id}>
                    <td className="case-index">{index + 1}</td>
                    <td>
                      <button className="case-name" onClick={() => void openDetail(item)}>{item.name}</button>
                      {item.interfaceChanged && <span className="chip warn">基于旧定义</span>}
                    </td>
                    <td>
                      <div className="case-interface">
                        <span className={`method m-${item.method.toLowerCase()}`}>{item.method}</span>
                        <span className="mono">{item.path}</span>
                      </div>
                      <span className="small-note">{interfaceLabel(item)}</span>
                      {!item.interfaceExists && <span className="chip muted">接口已删除</span>}
                    </td>
                    <td>
                      <span>{item.envName}</span>
                      {!item.envExists && <span className="chip muted">环境已删除</span>}
                    </td>
                    <td>
                      {item.tags.length > 0 ? (
                        <div className="case-tags">
                          {item.tags.map((value) => (
                            <span key={value} className="tag-chip" style={tagStyle(value)} title={`#${value}`}>#{value}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="small-note">—</span>
                      )}
                    </td>
                    <td className="small-note">{new Date(item.savedAt).toLocaleString()}</td>
                    <td>
                      <div className="case-actions">
                        <button className="btn ghost small ai-action" onClick={() => openAIExport([item.id])}><span aria-hidden="true">✦</span> AI 导出</button>
                        <button className="btn ghost small danger-text" onClick={() => setDeleting(item)}>删除</button>
                        <div className="case-more-wrap">
                          <button className="btn ghost small case-more-trigger" aria-label="更多操作" title="更多操作" onClick={() => setActionMenuId(actionMenuId === item.id ? null : item.id)}>⋯</button>
                          {actionMenuId === item.id && (
                            <div className="case-more-menu">
                              <button onClick={() => { setActionMenuId(null); void openDetail(item) }}><ActionIcon name="eye" />查看详情</button>
                              <button onClick={() => { setActionMenuId(null); openEdit(item) }}><ActionIcon name="pencil" />改名</button>
                              <button onClick={() => { setActionMenuId(null); void duplicate(item) }}><ActionIcon name="copy" />复制</button>
                              <button onClick={() => { setActionMenuId(null); void exportPlainCases([item.id]) }}><ActionIcon name="download" />导出</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="small-note" style={{ padding: 18 }}>没有匹配的用例。</p>}
          </div>
        )}
      </main>

      {detail && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) closeDetail() }}>
          <div className="modal wide">
            <h2>用例详情 · {detail.name}</h2>
            <div className="case-detail-meta">
              <span className={`method m-${detail.method.toLowerCase()}`}>{detail.method}</span>
              <span className="mono">{detail.path}</span>
              <span className="chip muted">{detail.envName}</span>
              {detail.interfaceChanged && <span className="chip warn">接口已变更，基于旧定义</span>}
              {!detail.envExists && <span className="chip muted">环境已删除</span>}
            </div>
            <p className="mono small-note">{detail.baseUrl}</p>
            {detail.note && <div className="note">{detail.note}</div>}
            <div className="case-snapshot">
              <h4>请求参数</h4>
              <div className="case-params-grid">
                <CaseRows title="Path" rows={Object.entries(detail.requestSnapshot.pathParams).map(([key, value]) => ({ key, value, enabled: true }))} />
                <CaseRows title="Query" rows={detail.requestSnapshot.query} />
                <CaseRows title="Headers" rows={detail.requestSnapshot.headers} />
                <CaseRows title="Cookies" rows={detail.requestSnapshot.cookies} />
              </div>
              <div className="case-body-block">
                <h4>请求体</h4>
                {detail.requestSnapshot.bodyType === 'none' ? (
                  <p className="small-note">无</p>
                ) : detail.requestSnapshot.bodyType === 'raw' ? (
                  <pre className="eff-body">{detail.requestSnapshot.bodyRaw}</pre>
                ) : (
                  <CaseRows title="" rows={detail.requestSnapshot.formRows ?? []} />
                )}
              </div>
              <h4>响应示例</h4>
              {responseExamples.length === 0 ? (
                <p className="small-note">该接口还没有保存响应示例。</p>
              ) : (
                responseExamples.map((example) => (
                  <div className="case-example" key={example.id}>
                    <div className="case-example-head">
                      <span className={`status ${example.status < 400 ? 'ok' : 'warn'}`}>{example.status}</span>
                      <strong>{example.name}</strong>
                      <span className="small-note">{new Date(example.savedAt).toLocaleString()}</span>
                    </div>
                    <pre className="eff-body">{prettyExample(example.body)}</pre>
                  </div>
                ))
              )}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => void copyCurl(detail)}>curl 命令</button>
              <div className="spacer" />
              <button className="btn" onClick={closeDetail}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setEditing(null) }}>
          <div className="modal">
            <h2>编辑用例</h2>
            <label className="field"><span>用例名称</span><input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /></label>
            <label className="field"><span>标签</span><input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="逗号分隔" /></label>
            <label className="field"><span>备注</span><textarea className="case-note-input" value={editNote} onChange={(event) => setEditNote(event.target.value)} /></label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn primary" disabled={busy || !editName.trim()} onClick={() => void saveEdit()}>{busy ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {tagMenu && (
        <div className="case-context-menu" style={{ left: tagMenu.x, top: tagMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => {
            const name = tagMenu.name
            setTagMenu(null)
            const selected = cases.filter((item) => item.tags.includes(name)).map((item) => item.id)
            openAIExport(selected)
          }}><ActionIcon name="spark" />AI 导出</button>
          <button role="menuitem" onClick={() => {
            const name = tagMenu.name
            setTagMenu(null)
            void exportPlainCases(undefined, [name])
          }}><ActionIcon name="download" />导出</button>
          <button role="menuitem" className="danger-text" onClick={() => {
            const name = tagMenu.name
            setTagMenu(null)
            setDeleteTags([name])
            setDeleteTagsOpen(true)
          }}><ActionIcon name="trash" />删除标签</button>
        </div>
      )}

      {deleteTagsOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeleteTagsOpen(false) }}>
          <div className="modal">
            <h2>删除标签</h2>
            <p>将删除包含以下标签的所有用例：</p>
            <div className="delete-tag-list">
              {deleteTags.map((name) => (
                <span key={name} className="tag-chip" style={tagStyle(name)}>#{name}</span>
              ))}
            </div>
            <div className="note warn">共 {affectedByDeleteTags} 个用例将被删除，标签一并移除，删除不可恢复。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeleteTagsOpen(false)}>取消</button>
              <button className="btn danger" disabled={busy} onClick={() => void removeSelectedTags()}>
                {busy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeleting(null) }}>
          <div className="modal">
            <h2>删除用例</h2>
            <p>确定删除用例「{deleting.name}」吗？</p>
            <div className="note warn">用例删除不可恢复，不会影响接口资产。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeleting(null)}>取消</button>
              <button className="btn danger" disabled={busy} onClick={() => void removeCase()}>{busy ? '删除中…' : '删除用例'}</button>
            </div>
          </div>
        </div>
      )}

      {aiExportCaseIds && (
        <AICaseDocExport
          projectId={project.id}
          projectName={project.name}
          caseIds={aiExportCaseIds}
          onClose={() => setAIExportCaseIds(null)}
          notify={notify}
        />
      )}
    </div>
  )
}

function CaseRows({ title, rows }: { title: string; rows: ParamRow[] }): JSX.Element {
  const visible = rows.filter((row) => row.enabled && row.key.trim())
  return (
    <div className="case-rows case-param-card">
      {title && <h4>{title}</h4>}
      {visible.length === 0 ? (
        <p className="small-note">无</p>
      ) : (
        <table className="kv">
          <thead><tr><th>参数名</th><th>参数值</th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key}><td className="mono">{row.key}</td><td className="mono">{row.value}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function prettyExample(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
