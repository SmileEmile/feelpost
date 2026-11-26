import { useEffect, useRef, useState } from 'react'
import type { AppInfo, Preferences, ProjectDetail, ProjectSummary } from '@shared/contract'
import { unwrap } from './api'
import Workspace from './Workspace'
import brandIcon from './assets/brand.svg'
import ProjectSettings from './ProjectSettings'
import Onboarding from './Onboarding'
import Message from './Message'

interface FormState {
  name: string
  sourceDir: string
  description: string
  localEnvUrl: string
}

const EMPTY_FORM: FormState = {
  name: '',
  sourceDir: '',
  description: '',
  localEnvUrl: ''
}

export default function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selected, setSelected] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [dirCheck, setDirCheck] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [nameError, setNameError] = useState('')
  const [dirError, setDirError] = useState('')
  const [createError, setCreateError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [appInfo, preferences, list] = await Promise.all([
          unwrap(window.feelpost.app.getInfo()),
          unwrap(window.feelpost.settings.get()),
          unwrap(window.feelpost.project.list())
        ])
        setInfo(appInfo)
        document.documentElement.dataset.platform = appInfo.platform
        setPrefs(preferences)
        setProjects(list)
        document.documentElement.dataset.theme = preferences.theme
        void window.feelpost.app.setZoomFactor(preferences.zoomFactor ?? 1)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function finishOnboarding(): Promise<void> {
    const next = await unwrap(window.feelpost.settings.update({ onboardingCompleted: true }))
    setPrefs(next)
  }

  async function refreshProjects(): Promise<void> {
    setProjects(await unwrap(window.feelpost.project.list()))
  }

  async function openProject(projectId: string): Promise<void> {
    try {
      setError('')
      const detail = await unwrap(window.feelpost.project.get(projectId))
      setSelected(detail)
      if (prefs) {
        const next = await unwrap(window.feelpost.settings.update({ lastProjectId: projectId }))
        setPrefs(next)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function openCreate(): void {
    setForm(EMPTY_FORM)
    setDirCheck('')
    setNameError('')
    setDirError('')
    setCreateError('')
    setShowCreate(true)
  }

  function closeCreate(): void {
    setShowCreate(false)
    setNameError('')
    setDirError('')
    setCreateError('')
  }

  async function chooseDirectory(): Promise<void> {
    try {
      const picked = await unwrap(window.feelpost.dialog.chooseDirectory())
      if (!picked) return
      setForm((current) => ({ ...current, sourceDir: picked.path }))
      setDirError('')
      setCreateError('')
      const check = await unwrap(window.feelpost.project.validateDirectory(picked.path))
      setDirCheck(
        check.valid
          ? `${check.hasBuildFile ? '识别到构建文件' : '未识别到 pom.xml / build.gradle'} · ${check.controllerCount} 个 Controller`
          : check.reason ?? '目录不可用'
      )
    } catch (err) {
      setCreateError((err as Error).message)
    }
  }

  async function createProject(): Promise<void> {
    const missingName = !form.name.trim()
    setNameError(missingName ? '请输入项目名称' : '')
    setDirError('')
    setCreateError('')
    if (missingName) {
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const project = await unwrap(
        window.feelpost.project.create({
          name: form.name,
          sourceDir: form.sourceDir,
          description: form.description,
          localEnvUrl: form.localEnvUrl
        })
      )
      closeCreate()
      await refreshProjects()
      setSelected(project)
      setToast('项目已创建')
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject(): Promise<void> {
    if (!deleting) return
    setDeleteBusy(true)
    setError('')
    try {
      await unwrap(window.feelpost.project.remove(deleting.id))
      if (selected?.id === deleting.id) setSelected(null)
      setDeleting(null)
      await refreshProjects()
      setToast(`项目「${deleting.name}」已删除`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function switchTheme(): Promise<void> {
    if (!prefs) return
    const theme = prefs.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    setPrefs(await unwrap(window.feelpost.settings.update({ theme })))
  }

  if (loading) {
    return <div className="boot">正在读取本地数据…</div>
  }

  if (!selected && projects.length === 0 && prefs && !prefs.onboardingCompleted) {
    return <Onboarding onFinish={finishOnboarding} />
  }

  return (
    <div className="app">
      {!selected && (
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><img src={brandIcon} alt="" /></span>
          <span className="brand-name">FeelPost</span>
          <span className="chip muted">本地 · 离线</span>
        </div>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => void switchTheme()}>
          {prefs?.theme === 'dark' ? '浅色' : '深色'}
        </button>
      </header>
      )}

      <Message text={error} onClose={() => setError('')} />

      {selected ? (
        <Workspace
          key={selected.id}
          project={selected}
          projects={projects}
          info={info}
          prefs={prefs}
          onPrefs={setPrefs}
          onBack={() => setSelected(null)}
          onSwitchProject={(projectId) => void openProject(projectId)}
          onCreateProject={openCreate}
          onOpenProjectSettings={() => setProjectSettingsOpen(true)}
          onChanged={() => {
            void refreshProjects()
            if (selected) void openProject(selected.id)
          }}
          notify={(message) => setToast(message)}
          theme={prefs?.theme ?? 'light'}
          onToggleTheme={() => void switchTheme()}
        />
      ) : (
        <main className="projects">
          <div className="hero">
            <h1>项目</h1>
            <p>以项目组织扫描结果、环境与用例，数据保存在本机。</p>
          </div>
          <div className={`grid ${projects.length === 0 ? 'empty' : ''}`}>
            {projects.map((project) => (
              <div
                className="project"
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => void openProject(project.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void openProject(project.id)
                  }
                }}
              >
                <button
                  className="project-delete"
                  title="删除项目"
                  aria-label={`删除项目 ${project.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setDeleting(project)
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  删除
                </button>
                <div className="project-title">
                  <span className="method-mark">{'{ }'}</span>
                  <h3>{project.name}</h3>
                </div>
                <p className="mono small-note">{project.sourceDir || '未选择源码目录'}</p>
                <div className="metrics">
                  <span><b>{project.interfaceCount}</b> 接口</span>
                  <span><b>{project.caseCount}</b> 用例</span>
                  <span><b>{project.envCount}</b> 环境</span>
                </div>
                <p className="small-note">
                  {project.lastScanAt ? `上次扫描 ${new Date(project.lastScanAt).toLocaleString()}` : '尚未扫描'}
                </p>
              </div>
            ))}
            {projects.length === 0 ? (
              <div className="project new empty">
                <span className="new-empty-glow" />
                <span className="new-empty-icon">+</span>
                <strong className="new-empty-title">从第一个项目开始</strong>
                <span className="new-empty-copy">选择一个本地 Spring Boot 工程目录，即可扫描接口、调试请求并导出文档。</span>
                <button className="btn primary new-empty-btn" onClick={openCreate}>新建项目</button>
              </div>
            ) : (
              <button className="project new" onClick={openCreate}>
                <span className="plus">+</span>
                <span>新建项目</span>
                <span className="small-note">选择本地 Spring Boot 工程目录</span>
              </button>
            )}
          </div>

        </main>
      )}

      {projectSettingsOpen && selected && (
        <ProjectSettings
          project={selected}
          onClose={() => setProjectSettingsOpen(false)}
          onSaved={async (updated) => {
            setSelected(updated)
            setProjectSettingsOpen(false)
            await refreshProjects()
            setToast('项目设置已保存')
          }}
          onDelete={() => {
            setProjectSettingsOpen(false)
            setDeleting(selected)
          }}
        />
      )}

      {deleting && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeleting(null) }}>
          <div className="modal">
            <h2>删除项目</h2>
            <p>确定删除项目「{deleting.name}」吗？</p>
            <div className="note warn">删除不可撤销，删除后项目数据将被清空（接口、环境、用例、文档与扫描快照）。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeleting(null)}>取消</button>
              <button className="btn danger" disabled={deleteBusy} onClick={() => void deleteProject()}>
                {deleteBusy ? '删除中…' : '删除项目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) closeCreate() }}>
          <div className="modal">
            <h2>新建项目</h2>
            {createError && <div className="note warn">{createError}</div>}
            <label className={`field ${nameError ? 'has-error' : ''}`}>
              <span>项目名称</span>
              <input
                ref={nameRef}
                className={nameError ? 'invalid' : ''}
                value={form.name}
                onChange={(event) => {
                  setForm({ ...form, name: event.target.value })
                  if (nameError) setNameError('')
                  if (createError) setCreateError('')
                }}
                placeholder="例如 api-test-service"
                autoFocus
              />
              {nameError && <span className="field-error">{nameError}</span>}
            </label>
            <label className={`field ${dirError ? 'has-error' : ''}`}>
              <span>源码目录（可选）</span>
              <div className="input-row">
                <input
                  ref={dirRef}
                  className={dirError ? 'invalid' : ''}
                  value={form.sourceDir}
                  onChange={(event) => {
                    setForm({ ...form, sourceDir: event.target.value })
                    if (dirError) setDirError('')
                    if (createError) setCreateError('')
                  }}
                  placeholder="~/workspace/api-test"
                />
                <button className="btn" onClick={() => void chooseDirectory()}>选择目录</button>
              </div>
              {dirError ? <span className="field-error">{dirError}</span> : dirCheck ? <span className="hint">{dirCheck}</span> : null}
            </label>
            <label className="field">
              <span>描述（可选）</span>
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="这个工程负责什么" />
            </label>
            <label className="field">
              <span>本地环境 URL</span>
              <input value={form.localEnvUrl} onChange={(event) => setForm({ ...form, localEnvUrl: event.target.value })} placeholder="http://localhost:8080" />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={closeCreate}>取消</button>
              <button className="btn primary" disabled={busy} onClick={() => void createProject()}>
                {busy ? '创建中…' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
