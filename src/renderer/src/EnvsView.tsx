import { useEffect, useMemo, useState } from 'react'
import type { Environment, EnvironmentParams, ParamRow, ProjectDetail } from '@shared/contract'
import { unwrap } from './api'
import Message from './Message'
import { envTagStyle } from './env-color'

interface Props {
  project: ProjectDetail
  envs: Environment[]
  currentEnvId: string
  onSelectEnv: (envId: string) => void
  reloadEnvs: () => Promise<Environment[]>
  onChanged: () => void
  notify: (message: string) => void
  onBack: () => void
}

type ParamKey = keyof EnvironmentParams

const PARAM_TABS: Array<[ParamKey, string]> = [
  ['headers', 'Headers'],
  ['query', 'Query'],
  ['cookies', 'Cookies'],
  ['body', 'Body 默认字段']
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function baseUrlLabel(value: string): string {
  return value.replace(/^https?:\/\//i, '')
}

function ParamRows({ rows, onChange }: { rows: ParamRow[]; onChange: (rows: ParamRow[]) => void }): JSX.Element {
  return (
    <div className="env-param-list">
      {rows.length === 0 && <p className="small-note">暂无参数</p>}
      {rows.map((row, index) => (
        <div className="env-param-row" key={index}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(event) => {
              const next = [...rows]
              next[index] = { ...row, enabled: event.target.checked }
              onChange(next)
            }}
          />
          <input
            value={row.key}
            placeholder="参数名"
            onChange={(event) => {
              const next = [...rows]
              next[index] = { ...row, key: event.target.value }
              onChange(next)
            }}
          />
          <input
            value={row.value}
            placeholder="参数值"
            onChange={(event) => {
              const next = [...rows]
              next[index] = { ...row, value: event.target.value }
              onChange(next)
            }}
          />
          <button className="icon" onClick={() => onChange(rows.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
      <button className="btn ghost small" onClick={() => onChange([...rows, { key: '', value: '', enabled: true }])}>+ 添加参数</button>
    </div>
  )
}

function mergeRows(globalRows: ParamRow[], envRows: ParamRow[]): Array<{ key: string; value: string; source: string }> {
  const map = new Map<string, { key: string; value: string; source: string }>()
  for (const row of globalRows) if (row.enabled && row.key.trim()) map.set(row.key, { key: row.key, value: row.value, source: '全局' })
  for (const row of envRows) {
    if (!row.enabled || !row.key.trim()) continue
    map.set(row.key, { key: row.key, value: row.value, source: map.has(row.key) ? '环境（覆盖全局）' : '环境' })
  }
  return [...map.values()]
}

function EffectiveTable({ title, rows }: { title: string; rows: Array<{ key: string; value: string; source: string }> }): JSX.Element {
  return (
    <div className="env-effective-group">
      <h5>{title}</h5>
      {rows.length === 0 ? <p className="small-note">无</p> : (
        <table className="kv param-table readonly">
          <thead><tr><th>参数名</th><th>参数值</th><th>来源</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="mono">{row.key}</td>
                <td className="mono">{row.value}</td>
                <td><span className="chip muted">{row.source}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function EnvsView({ project, envs, currentEnvId, onSelectEnv, reloadEnvs, onChanged, notify, onBack }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState(currentEnvId || envs[0]?.id || '')
  const [draft, setDraft] = useState<Environment | null>(null)
  const [globalDraft, setGlobalDraft] = useState<EnvironmentParams>({ headers: [], query: [], cookies: [], body: [] })
  const [globalTab, setGlobalTab] = useState<ParamKey>('headers')
  const [paramTab, setParamTab] = useState<ParamKey>('headers')
  const [noProxyText, setNoProxyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newEnv, setNewEnv] = useState({ name: '', baseUrl: project.environments[0]?.baseUrl ?? 'http://localhost:8080' })
  const [deleting, setDeleting] = useState<Environment | null>(null)

  const selected = envs.find((item) => item.id === selectedId) ?? envs[0]

  useEffect(() => {
    setSelectedId(currentEnvId || envs[0]?.id || '')
  }, [currentEnvId, envs])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      return
    }
    setDraft(clone(selected))
    setNoProxyText(selected.noProxy.join(', '))
  }, [selected?.id, selected?.name, selected?.baseUrl])

  useEffect(() => {
    void window.feelpost.project.getGlobals(project.id).then((result) => {
      if (result.ok) setGlobalDraft(result.data)
    })
  }, [project.id])

  const effective = useMemo(() => ({
    query: mergeRows(globalDraft.query, draft?.params.query ?? []),
    headers: mergeRows(globalDraft.headers, draft?.params.headers ?? []),
    cookies: mergeRows(globalDraft.cookies, draft?.params.cookies ?? [])
  }), [globalDraft, draft])

  if (!selected || !draft) {
    return <div className="envs-layout"><div className="resp-empty"><strong>暂无环境</strong></div></div>
  }

  function choose(env: Environment): void {
    setSelectedId(env.id)
    onSelectEnv(env.id)
    setError('')
  }

  function patchParams(key: ParamKey, rows: ParamRow[]): void {
    if (!draft) return
    setDraft({ ...draft, params: { ...draft.params, [key]: rows } })
  }

  async function saveEnv(): Promise<void> {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const updated = await unwrap(window.feelpost.env.update(project.id, selected.id, {
        ...draft,
        noProxy: noProxyText.split(',').map((item) => item.trim()).filter(Boolean)
      }))
      const list = await reloadEnvs()
      setSelectedId(updated.id)
      onSelectEnv(updated.id)
      onChanged()
      notify(`环境「${list.find((item) => item.id === updated.id)?.name ?? updated.name}」已保存`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function createEnv(): Promise<void> {
    if (!newEnv.name.trim() || !newEnv.baseUrl.trim()) return
    setBusy(true)
    setError('')
    try {
      const created = await unwrap(window.feelpost.env.create(project.id, { name: newEnv.name.trim(), baseUrl: newEnv.baseUrl.trim() }))
      await reloadEnvs()
      setSelectedId(created.id)
      onSelectEnv(created.id)
      setCreateOpen(false)
      setNewEnv({ name: '', baseUrl: project.environments[0]?.baseUrl ?? 'http://localhost:8080' })
      onChanged()
      notify(`环境「${created.name}」已创建`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function makeDefault(): Promise<void> {
    if (selected.isDefault) return
    setBusy(true)
    try {
      await unwrap(window.feelpost.env.setDefault(project.id, selected.id))
      await reloadEnvs()
      onChanged()
      notify(`已将「${selected.name}」设为默认环境`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeEnv(): Promise<void> {
    if (!deleting) return
    setBusy(true)
    try {
      await unwrap(window.feelpost.env.remove(project.id, deleting.id))
      const list = await reloadEnvs()
      const next = list[0]
      if (next) {
        setSelectedId(next.id)
        onSelectEnv(next.id)
      }
      setDeleting(null)
      onChanged()
      notify(`环境「${deleting.name}」已删除`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveGlobals(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const saved = await unwrap(window.feelpost.project.updateGlobals(project.id, globalDraft))
      setGlobalDraft(saved)
      onChanged()
      notify('全局参数已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="envs-layout">
      <aside className="envs-side">
        <div className="envs-side-head">
          <h2>环境</h2><span className="count">{envs.length}</span>
          <span className="spacer" />
          <button className="btn ghost small" onClick={() => setCreateOpen(true)}>+ 新建</button>
        </div>
        {envs.map((env) => (
          <button key={env.id} className={`env-nav ${env.id === selected.id ? 'active' : ''}`} onClick={() => choose(env)}>
            <span className="env-nav-name">
              <span className="tag-chip env-tag" style={envTagStyle(env.name)}>{env.name}</span>
              {env.isDefault && <span className="chip muted">默认</span>}
            </span>
            <span className="env-nav-url mono">{baseUrlLabel(env.baseUrl)}</span>
          </button>
        ))}
      </aside>

      <main className="envs-main">
        <header className="envs-head">
          <div>
            <h2>{selected.name}</h2>
            <p className="small-note">当前项目请求上下文；环境参数会覆盖同名的全局参数。</p>
          </div>
          <span className="spacer" />
          <button className="btn ghost env-back" onClick={onBack} title="返回上一页">← 返回上一页</button>
          {!selected.isDefault && <button className="btn" disabled={busy} onClick={() => void makeDefault()}>设为默认</button>}
          <button className="btn danger-outline" disabled={busy || envs.length <= 1} title={envs.length <= 1 ? '项目至少保留一个环境' : '删除环境'} onClick={() => setDeleting(selected)}>删除环境</button>
          <button className="btn primary" disabled={busy} onClick={() => void saveEnv()}>{busy ? '保存中…' : '保存环境'}</button>
        </header>

        <Message text={error} onClose={() => setError('')} />

        <div className="envs-body">
          <section className="env-panel">
            <h3>基本信息</h3>
            <div className="env-form-grid">
              <label className="field"><span>环境名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="field"><span>前置 URL</span><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
              <label className="field"><span>超时（毫秒）</span><input type="number" value={draft.timeoutMs} onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })} /></label>
              <label className="field"><span>HTTP 代理</span><input value={draft.proxy} placeholder="留空直连" onChange={(event) => setDraft({ ...draft, proxy: event.target.value })} /></label>
              <label className="field"><span>免代理名单</span><input value={noProxyText} placeholder="逗号分隔，例如 localhost, 127.0.0.1" onChange={(event) => setNoProxyText(event.target.value)} /></label>
            </div>
            <label className="check-wrap">
              <input type="checkbox" checked={draft.verifyTls} onChange={(event) => setDraft({ ...draft, verifyTls: event.target.checked })} />
              校验 HTTPS 证书（内网自签证书可关闭）
            </label>
            {!draft.verifyTls && <div className="note warn">当前环境已关闭证书校验，请仅用于内网调试。</div>}
          </section>

          <section className="env-panel">
            <div className="env-panel-head">
              <h3>环境参数</h3>
              <div className="resp-tabs">
                {PARAM_TABS.map(([key, label]) => (
                  <button key={key} className={`resp-tab ${paramTab === key ? 'active' : ''}`} onClick={() => setParamTab(key)}>{label}</button>
                ))}
              </div>
            </div>
            <ParamRows rows={draft.params[paramTab]} onChange={(rows) => patchParams(paramTab, rows)} />
          </section>

          <section className="env-panel">
            <div className="env-panel-head">
              <h3>全局参数 <span className="small-note">项目级，供所有环境共用</span></h3>
              <button className="btn small" disabled={busy} onClick={() => void saveGlobals()}>保存全局参数</button>
            </div>
            <div className="resp-tabs">
              {PARAM_TABS.map(([key, label]) => (
                <button key={key} className={`resp-tab ${globalTab === key ? 'active' : ''}`} onClick={() => setGlobalTab(key)}>{label}</button>
              ))}
            </div>
            <ParamRows rows={globalDraft[globalTab]} onChange={(rows) => setGlobalDraft({ ...globalDraft, [globalTab]: rows })} />
          </section>

          <section className="env-panel">
            <h3>生效参数预览</h3>
            <p className="small-note">全局 → 环境，同名环境参数覆盖全局参数。</p>
            <div className="env-effective">
              <EffectiveTable title="Headers" rows={effective.headers} />
              <EffectiveTable title="Query" rows={effective.query} />
              <EffectiveTable title="Cookies" rows={effective.cookies} />
            </div>
          </section>
        </div>
      </main>

      {createOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
          <div className="modal">
            <h2>新建环境</h2>
            <label className="field"><span>环境名称</span><input value={newEnv.name} autoFocus onChange={(event) => setNewEnv({ ...newEnv, name: event.target.value })} /></label>
            <label className="field"><span>前置 URL</span><input value={newEnv.baseUrl} onChange={(event) => setNewEnv({ ...newEnv, baseUrl: event.target.value })} /></label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="btn primary" disabled={busy || !newEnv.name.trim() || !newEnv.baseUrl.trim()} onClick={() => void createEnv()}>{busy ? '创建中…' : '创建环境'}</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeleting(null) }}>
          <div className="modal">
            <h2>删除环境</h2>
            <p>确定删除环境「{deleting.name}」吗？</p>
            <div className="note warn">已保存的用例会保留环境快照；删除后当前环境会切换到其他环境。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeleting(null)}>取消</button>
              <button className="btn danger" disabled={busy} onClick={() => void removeEnv()}>{busy ? '删除中…' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
