import { useState, type CSSProperties } from 'react'
import brandIcon from './assets/brand.svg'
import Message from './Message'

interface Props {
  onFinish: () => Promise<void>
}

const STEPS = 4
const STEP_ACCENTS = ['#4f6ef7', '#2f9e8f', '#d97706', '#8b5cf6']

function EndpointMock(): JSX.Element {
  return (
    <div className="onb-window">
      <div className="onb-window-bar"><span /><span /><span /><b>接口</b></div>
      <div className="onb-endpoint"><span className="method m-get">GET</span><code>/api/users/{'{id}'}</code></div>
      <div className="onb-kv"><span>Path</span><b>id</b></div>
      <div className="onb-kv"><span>Query</span><b>keyword</b></div>
      <div className="onb-kv"><span>Header</span><b>X-Tenant</b></div>
      <div className="onb-ok"><span>✓</span> 已注册 · 参数已解析</div>
    </div>
  )
}

function DebugMock(): JSX.Element {
  return (
    <div className="onb-stack">
      <div className="onb-mini-card">
        <div className="onb-mini-head"><span className="method m-post">POST</span><code>/api/orders</code><span className="onb-status">200</span></div>
        <div className="onb-lines"><span /><span /><span /></div>
      </div>
      <div className="onb-mini-card">
        <div className="onb-mini-head"><b>成功示例</b><span className="onb-status">已保存</span></div>
        <code className="onb-json">{'{ "code": 200, "data": { "id": 42 } }'}</code>
      </div>
      <div className="onb-chips"><span>请求快照</span><span>#重保</span><span>#Smoke</span></div>
    </div>
  )
}

function DocMock(): JSX.Element {
  return (
    <div className="onb-window">
      <div className="onb-window-bar"><span /><span /><span /><b>AI 文档</b></div>
      <div className="onb-doc-title">查询用户详情接口文档</div>
      <div className="onb-doc-meta">所属模块：user-service · 更新时间：今天</div>
      <div className="onb-table">
        <div><span>参数</span><span>类型</span><span>说明</span></div>
        <div><span>id</span><span>path</span><span>用户 ID</span></div>
        <div><span>name</span><span>string</span><span>用户姓名</span></div>
      </div>
      <div className="onb-ai-mark">✦ AI 生成 · 已脱敏</div>
    </div>
  )
}

function Visual({ step }: { step: number }): JSX.Element {
  if (step === 0) {
    return (
      <div className="onb-brand-visual">
        <span className="onb-brand-mark"><img src={brandIcon} alt="" /></span>
        <strong>FeelPost</strong>
        <span>LOCAL API CONTRACT HUB</span>
        <div className="onb-orbit"><i>接口</i><i>用例</i><i>文档</i></div>
      </div>
    )
  }
  if (step === 1) return <EndpointMock />
  if (step === 2) return <DebugMock />
  return <DocMock />
}

export default function Onboarding({ onFinish }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function goTo(next: number): void {
    if (next === step) return
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  async function finish(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onFinish()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  function next(): void {
    if (step < STEPS - 1) goTo(step + 1)
    else void finish()
  }

  const copy = [
    {
      eyebrow: 'FeelPost / LOCAL API CONTRACT HUB',
      title: '欢迎使用 FeelPost',
      lead: '把 Spring Boot 接口，从代码整理到前端交付。',
      body: '扫描源码、切换环境调试、沉淀用例，再把接口文档整理成前端可以直接使用的 Markdown。',
      chips: ['本地优先', '无需登录', 'AI 可选'],
      note: '所有项目数据保存在你的电脑上。'
    },
    {
      eyebrow: '01 / 扫描',
      title: '接口，从代码里自动长出来',
      lead: '选择源码目录，自动识别 Controller、请求方法、路径、参数和 DTO 字段。',
      bullets: ['支持整库、目录、Maven 模块扫描', '解析结果逐项确认，接口变更清晰可见', '人工校正保存在独立人工层，不被下次扫描覆盖']
    },
    {
      eyebrow: '02 / 调试与用例',
      title: '调得通，也留得住',
      lead: '在本地环境直接发请求，把当前请求冻结成用例，保存响应示例，下次联调直接复用。',
      bullets: ['Headers / Query / Path / Body / Cookie 完整编辑', 'TLS、代理、超时按环境独立配置', '保存成功 / 失败响应示例与 cURL', '接口变化只提示，不改写已冻结用例']
    },
    {
      eyebrow: '03 / AI 文档',
      title: '文档，写到前端能直接用的程度',
      lead: 'AI 是可选的。开启后可以补全字段说明、生成候选用例，并导出包含接口概览、请求参数、响应字段和示例 JSON 的 Markdown 联调文档。',
      bullets: ['兼容 OpenAI 风格模型，API Key 本地加密保存', '只有开启 AI 时，脱敏后的接口上下文才会发送给你配置的模型', '参数或响应示例变化时，自动失效旧缓存'],
      note: '不开启 AI，也能完整使用扫描、调试、用例和普通 Markdown 导出。'
    }
  ][step]

  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <div className="brand">
          <span className="brand-mark"><img src={brandIcon} alt="" /></span>
          <span className="brand-name">FeelPost</span>
        </div>
        <span className="spacer" />
        <button className="btn ghost" disabled={busy} onClick={() => void finish()}>跳过</button>
      </header>

      <main className="onboarding-card" style={{ '--onb-accent': STEP_ACCENTS[step] } as CSSProperties}>
        <div className="onboarding-progress"><span style={{ width: `${((step + 1) / STEPS) * 100}%` }} /></div>
        <div className={`onboarding-content ${direction > 0 ? 'forward' : 'back'}`} key={step}>
        <section className="onboarding-visual"><Visual step={step} /></section>
        <section className="onboarding-copy">
          <span className="onboarding-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p className="onboarding-lead">{copy.lead}</p>
          {copy.body && <p className="onboarding-body">{copy.body}</p>}
          {copy.chips && <div className="onboarding-chips">{copy.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>}
          {copy.bullets && <ul className="onboarding-bullets">{copy.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
          {copy.note && <p className="onboarding-note">{copy.note}</p>}
          <Message text={error} onClose={() => setError('')} />
        </section>
        </div>
      </main>

      <footer className="onboarding-foot">
        <div className="onboarding-dots" aria-label={`第 ${step + 1} / ${STEPS} 步`}>
          {Array.from({ length: STEPS }, (_, index) => (
            <button key={index} className={index === step ? 'active' : ''} aria-label={`第 ${index + 1} 步`} onClick={() => goTo(index)} />
          ))}
        </div>
        <span className="spacer" />
        <span className="small-note">第 {step + 1} 步 / 共 {STEPS} 步</span>
        {step > 0 && <button className="btn" disabled={busy} onClick={() => goTo(step - 1)}>上一步</button>}
        <button className="btn primary" disabled={busy} onClick={next}>{busy ? '保存中…' : step === STEPS - 1 ? '开始使用' : '下一步'}</button>
      </footer>
    </div>
  )
}
