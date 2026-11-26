import { useState } from 'react'
import type { Environment, ParamRow } from '@shared/contract'
import { unwrap } from './api'
import Message from './Message'

interface Props {
  projectId: string
  env: Environment
  onClose: () => void
  onSaved: (env: Environment) => void
}

function clone(env: Environment): Environment {
  return JSON.parse(JSON.stringify(env)) as Environment
}

function Rows({
  label,
  rows,
  onChange
}: {
  label: string
  rows: ParamRow[]
  onChange: (rows: ParamRow[]) => void
}): JSX.Element {
  return (
    <div className="env-group">
      <div className="env-group-head">
        <span>{label}</span>
        <button className="btn ghost small" onClick={() => onChange([...rows, { key: '', value: '', enabled: true }])}>+ 添加</button>
      </div>
      {rows.length === 0 && <p className="small-note">无</p>}
      {rows.map((row, index) => (
        <div className="env-row" key={index}>
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
            placeholder="key"
            onChange={(event) => {
              const next = [...rows]
              next[index] = { ...row, key: event.target.value }
              onChange(next)
            }}
          />
          <input
            value={row.value}
            placeholder="value"
            onChange={(event) => {
              const next = [...rows]
              next[index] = { ...row, value: event.target.value }
              onChange(next)
            }}
          />
          <button className="icon" onClick={() => onChange(rows.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
    </div>
  )
}

export default function EnvEditor({ projectId, env, onClose, onSaved }: Props): JSX.Element {
  const [draft, setDraft] = useState<Environment>(() => clone(env))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function patchParams(key: keyof Environment['params'], rows: ParamRow[]): void {
    setDraft({ ...draft, params: { ...draft.params, [key]: rows } })
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const updated = await unwrap(window.feelpost.env.update(projectId, env.id, draft))
      onSaved(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal wide">
        <h2>环境设置 · {env.name}</h2>
        <Message text={error} onClose={() => setError('')} />
        <div className="env-form">
          <label className="field"><span>环境名称</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field"><span>前置 URL</span>
            <input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} />
          </label>
          <label className="field"><span>超时（毫秒）</span>
            <input type="number" value={draft.timeoutMs} onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })} />
          </label>
          <label className="field"><span>HTTP 代理</span>
            <input value={draft.proxy} placeholder="留空直连" onChange={(event) => setDraft({ ...draft, proxy: event.target.value })} />
          </label>
        </div>
        <label className="check-wrap" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={draft.verifyTls}
            onChange={(event) => setDraft({ ...draft, verifyTls: event.target.checked })}
          />
          校验 HTTPS 证书（内网自签证书可关闭）
        </label>

        <Rows label="Header" rows={draft.params.headers} onChange={(rows) => patchParams('headers', rows)} />
        <Rows label="Query" rows={draft.params.query} onChange={(rows) => patchParams('query', rows)} />
        <Rows label="Cookie" rows={draft.params.cookies} onChange={(rows) => patchParams('cookies', rows)} />
        <Rows label="Body 默认字段" rows={draft.params.body} onChange={(rows) => patchParams('body', rows)} />

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
