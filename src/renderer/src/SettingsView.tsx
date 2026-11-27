import { useEffect, useState, type CSSProperties } from 'react'
import type { AIConfig, AIConfigPublic, AppInfo, Preferences, UpdateInfo } from '@shared/contract'
import { unwrap } from './api'
import Message from './Message'
import SelectMenu from './SelectMenu'
import brandIcon from './assets/brand.svg'
import openaiIcon from '../../../resources/icon-ai/openai.svg?raw'
import claudeIcon from '../../../resources/icon-ai/claude.svg?raw'
import geminiIcon from '../../../resources/icon-ai/gemini.svg?raw'
import deepseekIcon from '../../../resources/icon-ai/deepseek.svg?raw'
import qwenIcon from '../../../resources/icon-ai/qwen.svg?raw'
import zhipuIcon from '../../../resources/icon-ai/zhipu.svg?raw'
import minimaxIcon from '../../../resources/icon-ai/minimax.svg?raw'
import kimiIcon from '../../../resources/icon-ai/kimi.svg?raw'
import ollamaIcon from '../../../resources/icon-ai/ollama.svg?raw'
import openrouterIcon from '../../../resources/icon-ai/openrouter.svg?raw'

interface AIProviderPreset {
  id: string
  label: string
  baseUrl: string
  model: string
  mark: string
  color: string
  section: string
  icon?: string
}

const AI_PROVIDERS: AIProviderPreset[] = [
  { id: 'deepseek', icon: deepseekIcon, label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', mark: 'D', color: '#4d6bfe', section: '国内模型' },
  { id: 'qwen', icon: qwenIcon, label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', mark: 'Q', color: '#615ced', section: '国内模型' },
  { id: 'zhipu', icon: zhipuIcon, label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', mark: 'Z', color: '#2f6bff', section: '国内模型' },
  { id: 'kimi', icon: kimiIcon, label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', mark: 'K', color: '#111827', section: '国内模型' },
  { id: 'minimax', icon: minimaxIcon, label: 'MiniMax', baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2', mark: 'M', color: '#e85d3f', section: '国内模型' },
  { id: 'ollama', icon: ollamaIcon, label: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', mark: 'L', color: '#374151', section: '本地' },
  { id: 'openai', icon: openaiIcon, label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', mark: 'O', color: '#10a37f', section: '国外模型' },
  { id: 'anthropic', icon: claudeIcon, label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514', mark: 'A', color: '#d97757', section: '国外模型' },
  { id: 'gemini', icon: geminiIcon, label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', mark: 'G', color: '#4285f4', section: '国外模型' },
  { id: 'openrouter', icon: openrouterIcon, label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', mark: 'R', color: '#111827', section: '国外模型' }
]

function ProviderMark({ mark, color }: { mark: string; color: string }): JSX.Element {
  return <span className="provider-mark" style={{ '--provider-color': color } as CSSProperties}>{mark}</span>
}

function ProviderIcon({ preset }: { preset: AIProviderPreset }): JSX.Element {
  if (preset.icon) {
    return <span className="provider-logo" style={{ color: preset.color }} dangerouslySetInnerHTML={{ __html: preset.icon }} />
  }
  return <ProviderMark mark={preset.mark} color={preset.color} />
}

function providerIdOf(config: AIConfigPublic): string {
  const base = config.baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  return AI_PROVIDERS.find((item) => item.baseUrl.replace(/\/+$/, '').toLowerCase() === base)?.id ?? 'custom'
}

function SettingsIcon({ name }: { name: string }): JSX.Element {
  const paths: Record<string, string[]> = {
    appearance: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v8M8 12h8'],
    data: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'],
    ai: ['M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z'],
    diagnostics: ['M3 12h4l2-5 4 10 2-5h6'],
    about: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8h.01']
  }
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name] ?? paths.about).map((path) => <path key={path} d={path} />)}</svg>
}

function GithubIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.3 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.6-2.8 5.5-5.4 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.2 11.2 0 0 0 12 .8z" />
    </svg>
  )
}

function WechatIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.7 4.2c-3.6 0-6.6 2.4-6.6 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.2-1.1c.8.2 1.6.3 2.5.3.3 0 .6 0 .9-.1-.1-.4-.2-.8-.2-1.2 0-3 2.9-5.4 6.4-5.4h.4c-.7-2.4-3.5-4.1-6.8-4.1zm-2.3 3.4c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.7 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z" />
      <path d="M21.6 13.5c0-2.5-2.5-4.5-5.5-4.5s-5.5 2-5.5 4.5 2.5 4.5 5.5 4.5c.7 0 1.3-.1 1.9-.3l1.8.9-.5-1.6c1.4-.8 2.3-2 2.3-3.5zm-7.3-1.1c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7zm3.7 0c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }): JSX.Element {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-2.1 3.1" />
      <path d="M6.1 6.1C3.3 8.1 2 12 2 12s4 7 10 7a11 11 0 0 0 4.2-.8" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

interface Props {
  info: AppInfo | null
  prefs: Preferences | null
  onPrefs: (prefs: Preferences) => void
  notify: (message: string) => void
  focus?: { section: string; nonce: number } | null
  onFocusHandled?: () => void
}

export default function SettingsView({ info, prefs, onPrefs, notify, focus, onFocusHandled }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<Preferences['theme']>(prefs?.theme ?? 'light')
  const [debugLogging, setDebugLogging] = useState(prefs?.debugLogging ?? false)
  const [zoom, setZoom] = useState(prefs?.zoomFactor ?? 1)
  const [aiConfig, setAIConfig] = useState<AIConfigPublic | null>(null)
  const [aiKey, setAIKey] = useState('')
  const [aiBusy, setAIBusy] = useState(false)
  const [aiTest, setAITest] = useState('')
  const [aiVerified, setAIVerified] = useState(false)
  const [aiProvider, setAIProvider] = useState('custom')
  const [aiModels, setAIModels] = useState<string[]>([])
  const [aiModelsLoading, setAIModelsLoading] = useState(false)
  const [aiModelsError, setAIModelsError] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateChecked, setUpdateChecked] = useState(false)
  const [showAIKey, setShowAIKey] = useState(false)
  const [settingsSection, setSettingsSection] = useState('appearance')

  useEffect(() => {
    if (!focus) return
    setSettingsSection(focus.section)
    const timer = window.setTimeout(() => {
      document.getElementById(`settings-${focus.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onFocusHandled?.()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [focus?.nonce])

  useEffect(() => {
    setTheme(prefs?.theme ?? 'light')
    setDebugLogging(prefs?.debugLogging ?? false)
    setZoom(prefs?.zoomFactor ?? 1)
  }, [prefs?.theme, prefs?.debugLogging, prefs?.zoomFactor])

  useEffect(() => {
    void (async () => {
      try {
        const config = await unwrap(window.feelpost.ai.getConfig())
        setAIConfig(config)
        setAIProvider(providerIdOf(config))
        setAIVerified(false)
        const revealed = await window.feelpost.ai.revealApiKey()
        if (revealed.ok) setAIKey(revealed.data.apiKey)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [])

  async function update(patch: Partial<Preferences>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await unwrap(window.feelpost.settings.update(patch))
      if (patch.theme) document.documentElement.dataset.theme = patch.theme
      onPrefs(next)
      notify('设置已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function changeZoom(value: number): Promise<void> {
    setZoom(value)
    try {
      await unwrap(window.feelpost.app.setZoomFactor(value))
      const next = await unwrap(window.feelpost.settings.update({ zoomFactor: value }))
      onPrefs(next)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function openPath(path: string): Promise<void> {
    try {
      await unwrap(window.feelpost.shell.openPath(path))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function jumpTo(section: string): void {
    setSettingsSection(section)
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function selectAIProvider(id: string): void {
    setAIProvider(id)
    setAIModels([])
    setAIModelsError('')
    invalidateAIVerification()
    if (!aiConfig || id === 'custom') return
    const preset = AI_PROVIDERS.find((item) => item.id === id)
    if (preset) setAIConfig({ ...aiConfig, baseUrl: preset.baseUrl, model: preset.model })
  }

  function invalidateAIVerification(): void {
    setAIVerified(false)
    setAITest('')
  }

  function isLocalBaseUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url.trim())
  }

  async function saveAI(target = aiConfig): Promise<boolean> {
    if (!target) return false
    setAIBusy(true)
    setError('')
    setAITest('')
    try {
      const next = await unwrap(window.feelpost.ai.updateConfig({
        enabled: target.enabled,
        baseUrl: target.baseUrl,
        model: target.model,
        timeoutMs: target.timeoutMs,
        apiKey: aiKey.trim() ? aiKey.trim() : undefined
      }))
      setAIConfig(next)
      notify('AI 配置已保存')
      if (prefs) {
        const ai: AIConfig = {
          enabled: next.enabled,
          baseUrl: next.baseUrl,
          model: next.model,
          timeoutMs: next.timeoutMs
        }
        onPrefs({ ...prefs, ai })
      }
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setAIBusy(false)
    }
  }

  async function toggleAI(enabled: boolean): Promise<void> {
    if (!aiConfig || aiBusy) return
    const previous = aiConfig
    const next = { ...aiConfig, enabled }
    invalidateAIVerification()
    setAIConfig(next)
    const saved = await saveAI(next)
    if (!saved) setAIConfig(previous)
  }

  async function openLink(url: string): Promise<void> {
    try {
      await unwrap(window.feelpost.shell.openExternal(url))
    } catch (err) {
      notify((err as Error).message)
    }
  }

  async function checkUpdates(silent = false): Promise<void> {
    setUpdateChecking(true)
    setUpdateError('')
    try {
      const result = await unwrap(window.feelpost.app.checkUpdate())
      setUpdateInfo(result)
      setUpdateChecked(true)
      if (!silent) notify(result.hasUpdate ? `发现新版本 v${result.latestVersion}` : '当前已是最新版本')
    } catch (err) {
      setUpdateError((err as Error).message)
      if (!silent) notify((err as Error).message)
    } finally {
      setUpdateChecking(false)
    }
  }

  useEffect(() => {
    void checkUpdates(true)
    // 只在设置页首次打开时自动检查一次；UpdateService 内部会缓存结果。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function testAI(): Promise<void> {
    if (!aiConfig) return
    setAIBusy(true)
    setError('')
    setAITest('测试中…')
    try {
      const saved = await unwrap(window.feelpost.ai.updateConfig({
        enabled: aiConfig.enabled,
        baseUrl: aiConfig.baseUrl,
        model: aiConfig.model,
        timeoutMs: aiConfig.timeoutMs,
        apiKey: aiKey.trim() ? aiKey.trim() : undefined
      }))
      setAIConfig(saved)
      const result = await unwrap(window.feelpost.ai.testConnection())
      setAIVerified(true)
      setAITest(`连接正常 · ${result.latencyMs} ms`)
      notify('AI 连接正常')
    } catch (err) {
      setAIVerified(false)
      setAITest(`连接失败：${(err as Error).message}`)
    } finally {
      setAIBusy(false)
    }
  }

  async function fetchAIModels(): Promise<void> {
    if (!aiConfig) return
    setAIModelsLoading(true)
    setAIModelsError('')
    try {
      const saved = await unwrap(window.feelpost.ai.updateConfig({
        enabled: aiConfig.enabled,
        baseUrl: aiConfig.baseUrl,
        model: aiConfig.model,
        timeoutMs: aiConfig.timeoutMs,
        apiKey: aiKey.trim() ? aiKey.trim() : undefined
      }))
      setAIConfig(saved)
      const models = await unwrap(window.feelpost.ai.listModels())
      setAIModels(models)
      if (!models.includes(saved.model) && models.length > 0) {
        invalidateAIVerification()
        setAIConfig({ ...saved, model: models[0] })
      }
    } catch (err) {
      setAIModels([])
      setAIModelsError((err as Error).message)
    } finally {
      setAIModelsLoading(false)
    }
  }

  async function clearAIKey(): Promise<void> {
    setAIBusy(true)
    setError('')
    invalidateAIVerification()
    try {
      const next = await unwrap(window.feelpost.ai.updateConfig({
        enabled: false,
        baseUrl: aiConfig?.baseUrl ?? '',
        model: aiConfig?.model ?? '',
        timeoutMs: aiConfig?.timeoutMs ?? 60000,
        apiKey: null
      }))
      setAIConfig(next)
      setAIKey('')
      setShowAIKey(false)
      notify('AI Key 已清除')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAIBusy(false)
    }
  }

  const dataDir = info?.dataDir ?? prefs?.dataDir ?? ''
  const logDir = dataDir ? `${dataDir.replace(/[\\/]+$/, '')}/logs` : ''
  const aiBaseReady = Boolean(aiConfig?.baseUrl.trim())
  const aiModelReady = Boolean(aiConfig?.model.trim())
  const aiKeyReady = Boolean(aiKey.trim() || aiConfig?.hasApiKey || (aiConfig && isLocalBaseUrl(aiConfig.baseUrl)))
  const aiStatus = !aiConfig
    ? { label: '读取中', cls: 'muted' }
    : !aiConfig.enabled
      ? { label: '未启用', cls: 'muted' }
      : !aiBaseReady || !aiModelReady
        ? { label: '未配置', cls: 'warn' }
        : !aiKeyReady
          ? { label: '缺少 Key', cls: 'warn' }
          : aiTest.startsWith('连接失败')
            ? { label: '连接异常', cls: 'warn' }
            : !aiVerified
              ? { label: '待测试', cls: 'warn' }
              : { label: '已启用', cls: 'ok' }

  return (
    <div className="settings-shell">
      <aside className="settings-side">
        <header className="settings-head">
          <h2>应用设置</h2>
          <p className="small-note">外观、数据与 AI 连接。</p>
        </header>
                  <nav className="settings-nav" aria-label="设置导航">
            {[
              ['appearance', '外观'],
              ['data', '数据'],
              ['ai', 'AI 助手'],
              ['diagnostics', '诊断'],
              ['about', '关于']
            ].map(([id, label]) => (
              <button
                key={id}
                className={settingsSection === id ? 'active' : ''}
                onClick={() => jumpTo(id)}
              >
                <span className="settings-nav-icon"><SettingsIcon name={id} /></span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
      </aside>

      <main className="settings-main">
        <Message text={error} onClose={() => setError('')} />
        <div className="settings-content">
      <section id="settings-appearance" className="settings-panel">
        <h3>外观</h3>
        <div className="theme-cards">
          <button className={`theme-card ${theme === 'light' ? 'active' : ''}`} disabled={busy} onClick={() => { setTheme('light'); void update({ theme: 'light' }) }}>
            <span className="theme-preview light"><span className="theme-bar b1" /><span className="theme-bar b2" /><span className="theme-bar b3" /></span>
            <strong>浅色</strong>
          </button>
          <button className={`theme-card ${theme === 'dark' ? 'active' : ''}`} disabled={busy} onClick={() => { setTheme('dark'); void update({ theme: 'dark' }) }}>
            <span className="theme-preview dark"><span className="theme-bar b1" /><span className="theme-bar b2" /><span className="theme-bar b3" /></span>
            <strong>深色</strong>
          </button>
        </div>
        <div className="settings-row zoom-row">
          <div><strong>缩放比例</strong></div>
          <span className="spacer" />
          <div className="zoom-control">
            <button className="btn small" disabled={zoom <= 0.8} onClick={() => void changeZoom(Math.max(0.8, Math.round((zoom - 0.05) * 100) / 100))}>−</button>
            <input
              type="range"
              min="80"
              max="150"
              step="5"
              value={Math.round(zoom * 100)}
              onChange={(event) => void changeZoom(Number(event.target.value) / 100)}
            />
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="btn small" disabled={zoom >= 1.5} onClick={() => void changeZoom(Math.min(1.5, Math.round((zoom + 0.05) * 100) / 100))}>+</button>
            <button className="btn ghost small" disabled={zoom === 1} onClick={() => void changeZoom(1)}>重置</button>
          </div>
        </div>
      </section>

      <section id="settings-data" className="settings-panel">
        <h3>数据</h3>
        <div className="settings-row">
          <div><strong>数据目录</strong></div>
          <span className="spacer" />
          <button className="btn small" onClick={() => void openPath(dataDir)}>打开目录</button>
        </div>
        <code className="settings-path">{dataDir || '未获取'}</code>
      </section>

      <section id="settings-ai" className="settings-panel ai-settings-panel">
        <div className="ai-settings-head">
          <h3>AI 助手 <span className="chip muted">可选</span></h3>
          <span className={`chip ${aiStatus.cls}`}>{aiStatus.label}</span>
        </div>
        <p className="small-note">OpenAI-compatible，可选；核心功能不依赖 AI，Key 仅保存在本机。</p>
        {aiConfig ? (
          <>
            <div className="ai-setting-row">
              <div><strong>启用 AI</strong></div>
              <span className="spacer" />
              <label className="switch">
                <input type="checkbox" checked={aiConfig.enabled} disabled={aiBusy} onChange={(event) => void toggleAI(event.target.checked)} />
                <span className="switch-track" />
              </label>
            </div>
            <div className="ai-setting-row">
              <div><strong>服务商</strong><p className="small-note">选择后自动填入地址与默认模型。</p></div>
              <SelectMenu
                className="ai-provider-select"
                value={aiProvider}
                onChange={selectAIProvider}
                options={[
                  ...AI_PROVIDERS.map((item) => ({
                    value: item.id,
                    label: item.label,
                    section: item.section,
                    icon: <ProviderIcon preset={item} />
                  })),
                  { value: 'custom', label: '自定义 / 兼容接口', section: '自定义', icon: <ProviderMark mark="C" color="#64748b" /> }
                ]}
              />
            </div>
            <div className="ai-setting-row">
              <div><strong>Base URL</strong><p className="small-note">选择服务商后自动填入，通常无需修改。</p></div>
              <input className="input ai-config-input" value={aiConfig.baseUrl} placeholder="https://api.example.com/v1" readOnly={aiProvider !== 'custom'} disabled={aiBusy} onChange={(event) => { invalidateAIVerification(); setAIConfig({ ...aiConfig, baseUrl: event.target.value }) }} />
            </div>
            <div className="ai-setting-row">
              <div><strong>模型</strong><p className="small-note">点击获取服务商可用模型，或使用默认模型。</p></div>
              <div className="ai-model-control">
                {aiModels.length > 0 ? (
                  <SelectMenu
                    className="ai-model-select"
                    value={aiConfig.model}
                    onChange={(value) => { invalidateAIVerification(); setAIConfig({ ...aiConfig, model: value }) }}
                    options={[...new Set([aiConfig.model, ...aiModels])].filter(Boolean).map((value) => ({ value, label: value }))}
                  />
                ) : (
                  <input className="input ai-config-input" value={aiConfig.model} placeholder="deepseek-chat" disabled={aiBusy} onChange={(event) => { invalidateAIVerification(); setAIConfig({ ...aiConfig, model: event.target.value }) }} />
                )}
                <button className="btn small" disabled={aiBusy || aiModelsLoading} onClick={() => void fetchAIModels()}>
                  {aiModelsLoading ? '获取中…' : '获取模型'}
                </button>
                {aiModelsError && <span className="ai-model-error">{aiModelsError}</span>}
              </div>
            </div>
            <div className="ai-setting-row">
              <div><strong>API Key</strong><p className="small-note">{aiConfig.hasApiKey ? `已保存${aiConfig.keyStorageMode === 'session' ? '（仅本次会话）' : ''}` : '未保存；本地模型可留空。'}</p></div>
              <div className="ai-key-row">
                <input
                  className="input ai-config-input"
                  type={showAIKey ? 'text' : 'password'}
                  value={aiKey}
                  placeholder={aiConfig.hasApiKey ? '留空保持不变' : 'sk-…'}
                  disabled={aiBusy}
                  onChange={(event) => { invalidateAIVerification(); setAIModels([]); setAIModelsError(''); setAIKey(event.target.value) }}
                />
                <button
                  className="btn small ghost ai-eye"
                  type="button"
                  disabled={!aiKey}
                  title={showAIKey ? '隐藏 API Key' : '显示 API Key'}
                  aria-label={showAIKey ? '隐藏 API Key' : '显示 API Key'}
                  onClick={() => setShowAIKey((value) => !value)}
                >
                  <EyeIcon open={showAIKey} />
                </button>
                {aiConfig.hasApiKey && <button className="btn small ghost" disabled={aiBusy} onClick={() => void clearAIKey()}>清除</button>}
              </div>
            </div>
            <div className="ai-setting-row">
              <div><strong>超时（秒）</strong></div>
              <input className="input ai-timeout-input" type="number" min={10} max={180} value={Math.round(aiConfig.timeoutMs / 1000)} disabled={aiBusy} onChange={(event) => { invalidateAIVerification(); setAIConfig({ ...aiConfig, timeoutMs: Math.max(10, Math.min(180, Number(event.target.value) || 60)) * 1000 }) }} />
            </div>
            <div className="ai-setting-actions">
              <button className="btn small" disabled={aiBusy} onClick={() => void testAI()}>{aiTest === '测试中…' ? '测试中…' : '测试连接'}</button>
              <button className="btn primary small" disabled={aiBusy} onClick={() => void saveAI()}>保存 AI 配置</button>
              {aiTest && <span className={aiTest.startsWith('连接正常') ? 'ai-test-ok' : 'ai-test-fail'}>{aiTest}</span>}
            </div>
            <div className="ai-privacy-note">请求仅发送脱敏后的接口上下文，不发送源码；结果需预览确认。</div>
          </>
        ) : (
          <p className="small-note">正在读取 AI 配置…</p>
        )}
      </section>

      <section id="settings-diagnostics" className="settings-panel">
        <h3>诊断</h3>
        <div className="settings-row">
          <div><strong>调试日志</strong></div>
          <span className="spacer" />
          <label className="switch">
            <input
              type="checkbox"
              checked={debugLogging}
              disabled={busy}
              onChange={(event) => { setDebugLogging(event.target.checked); void update({ debugLogging: event.target.checked }) }}
            />
            <span className="switch-track" />
          </label>
        </div>
        <div className="settings-row">
          <div><strong>日志目录</strong></div>
          <span className="spacer" />
          <button className="btn small" onClick={() => void openPath(logDir)}>打开目录</button>
        </div>
        <code className="settings-path">{logDir || '未获取'}</code>
      </section>

      <section id="settings-about" className="settings-panel">
        <h3>关于</h3>
        <div className="settings-row">
          <div><strong>FeelPost</strong><p className="small-note">开源 · 本地 · AI 协作的 API 接口测试工具</p></div>
          <span className="spacer" />
          <span className="chip muted">v{info?.version ?? '—'}</span>
        </div>

        <div className="about-social" aria-label="项目链接">
          <button className="about-social-btn" onClick={() => void openLink('https://smileemile.github.io/feelpost/')} title="打开官网" aria-label="打开官网">
            <img src={brandIcon} alt="" />
            <span>官网</span>
          </button>
          <button className="about-social-btn github" onClick={() => void openLink('https://github.com/smileemile/feelpost/')} title="打开 GitHub 仓库" aria-label="打开 GitHub 仓库">
            <GithubIcon />
            <span>GitHub</span>
          </button>
        </div>

        <div className="settings-row about-update-row">
          <div>
            <strong>版本更新</strong>
            <p className="small-note">
              {updateInfo?.hasUpdate
                ? `发现新版本 v${updateInfo.latestVersion}，当前 v${updateInfo.currentVersion}。`
                : updateChecked
                  ? '当前已是最新版本。'
                  : '从 GitHub Releases 检查版本。'}
            </p>
          </div>
          <span className="spacer" />
          {updateInfo?.hasUpdate ? (
            <button className="btn primary small" onClick={() => void openLink(updateInfo.url)}>下载 v{updateInfo.latestVersion}</button>
          ) : (
            <button className="btn small" disabled={updateChecking} onClick={() => void checkUpdates()}>{updateChecking ? '检查中…' : '检查更新'}</button>
          )}
        </div>
        {updateError && <p className="about-update-error">{updateError}</p>}

        <div className="settings-author">
          <strong>作者：Emile（爱弥儿）</strong>
          <p className="author-wechat" title="微信：SmileEmile"><WechatIcon /><code>SmileEmile</code></p>
        </div>
      </section>
        </div>
      </main>
    </div>
  )
}
