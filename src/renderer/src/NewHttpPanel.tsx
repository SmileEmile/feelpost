import { useEffect, useState } from 'react'
import type { HttpMethod, InterfaceDetail, ManualDirectory } from '@shared/contract'
import { unwrap } from './api'
import SelectMenu from './SelectMenu'
import Message from './Message'

interface Props {
  projectId: string
  directories: ManualDirectory[]
  initialDirectoryId?: string
  onCreated: (detail: InterfaceDetail) => void
  onCancel: () => void
  notify: (message: string) => void
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function NewHttpPanel({ projectId, directories, initialDirectoryId, onCreated, onCancel, notify }: Props): JSX.Element {
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [directoryId, setDirectoryId] = useState(initialDirectoryId ?? '')

  useEffect(() => {
    setDirectoryId(initialDirectoryId ?? '')
  }, [initialDirectoryId])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(): Promise<void> {
    if (!path.trim() || !name.trim()) {
      setError('路径和名称必填。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await unwrap(window.feelpost.catalog.createManual({
        projectId,
        method,
        path: path.trim(),
        name: name.trim(),
        summary: summary.trim() || undefined,
        directoryId: directoryId || undefined
      }))
      notify(`接口「${created.name}」已创建`)
      onCreated(created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="detail-pane new-http-panel">
      <header className="new-http-head">
        <div>
          <h2>新建 HTTP 接口</h2>
          <p className="small-note">填写后直接创建并打开接口标签页。</p>
        </div>
        <span className="spacer" />
        <button className="btn ghost" onClick={onCancel}>取消</button>
        <button className="btn primary" disabled={busy} onClick={() => void create()}>{busy ? '创建中…' : '创建接口'}</button>
      </header>

      <Message text={error} onClose={() => setError('')} />

      <div className="new-http-form">
        <div className="new-http-row">
          <label className="field">
            <span>请求方法</span>
            <SelectMenu
              value={method}
              options={METHODS.map((item) => ({ value: item, label: item }))}
              onChange={(value) => setMethod(value as HttpMethod)}
            />
          </label>
          <label className="field new-http-path">
            <span>请求路径</span>
            <input value={path} autoFocus onChange={(event) => setPath(event.target.value)} placeholder="/health 或 https://host/path" />
          </label>
        </div>
        <div className="new-http-row">
          <label className="field">
            <span>接口名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="健康检查" />
          </label>
          <label className="field">
            <span>归入目录</span>
            <SelectMenu
              value={directoryId || 'NONE'}
              options={[{ value: 'NONE', label: '不归入目录' }, ...directories.map((directory) => ({ value: directory.id, label: directory.name }))]}
              onChange={(value) => setDirectoryId(value === 'NONE' ? '' : value)}
            />
          </label>
        </div>
        <label className="field">
          <span>接口说明</span>
          <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="可选" />
        </label>
      </div>
    </div>
  )
}
