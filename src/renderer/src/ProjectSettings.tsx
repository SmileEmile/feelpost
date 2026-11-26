import { useState } from 'react'
import type { ProjectDetail } from '@shared/contract'
import { unwrap } from './api'
import Message from './Message'

interface Props {
  project: ProjectDetail
  onClose: () => void
  onSaved: (project: ProjectDetail) => void
  onDelete: () => void
}

export default function ProjectSettings({ project, onClose, onSaved, onDelete }: Props): JSX.Element {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [sourceDir, setSourceDir] = useState(project.sourceDir)
  const [excludeText, setExcludeText] = useState(project.excludePatterns.join(', '))
  const [dirCheck, setDirCheck] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function chooseDirectory(): Promise<void> {
    try {
      const picked = await unwrap(window.feelpost.dialog.chooseDirectory())
      if (!picked) return
      setSourceDir(picked.path)
      const check = await unwrap(window.feelpost.project.validateDirectory(picked.path))
      setDirCheck(check.valid
        ? `${check.hasBuildFile ? '识别到构建文件' : '未识别到 pom.xml / build.gradle'} · ${check.controllerCount} 个 Controller`
        : check.reason ?? '目录不可用')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function save(): Promise<void> {
    if (!name.trim()) {
      setError('项目名称不能为空。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await unwrap(window.feelpost.project.update({
        projectId: project.id,
        patch: {
          name: name.trim(),
          description: description.trim(),
          sourceDir,
          excludePatterns: excludeText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
        }
      }))
      onSaved(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal project-settings-modal">
        <h2>项目设置</h2>
        <p className="small-note">维护项目元信息；修改源码目录后会提示接口来源目录已变化。</p>
        <Message text={error} onClose={() => setError('')} />
        <label className="field"><span>项目名称</span><input value={name} autoFocus onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>描述</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选" /></label>
        <label className="field">
          <span>源码目录（可稍后选择）</span>
          <div className="input-row">
            <input value={sourceDir} onChange={(event) => { setSourceDir(event.target.value); setDirCheck('') }} placeholder="未选择" />
            <button className="btn" onClick={() => void chooseDirectory()}>选择目录</button>
          </div>
          <span className="hint">{dirCheck || '修改目录后会重新识别工程'}</span>
        </label>
        <label className="field">
          <span>排除规则</span>
          <textarea rows={3} value={excludeText} onChange={(event) => setExcludeText(event.target.value)} placeholder="target, build, node_modules, .git" />
          <span className="hint">逗号或换行分隔；用于扫描时忽略目录。</span>
        </label>
        <div className="project-settings-danger">
          <div><strong>删除项目</strong><p className="small-note">会级联删除接口、环境、用例、响应示例和扫描快照。</p></div>
          <span className="spacer" />
          <button className="btn danger" onClick={onDelete}>删除项目</button>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存设置'}</button>
        </div>
      </div>
    </div>
  )
}
