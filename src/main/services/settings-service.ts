import type { AIConfig, Preferences } from '@shared/contract'
import { preferencesFile } from '../storage/paths'
import { readJson, writeJsonAtomic } from '../storage/json-store'

const DEFAULT_AI: AIConfig = {
  enabled: false,
  baseUrl: '',
  model: '',
  timeoutMs: 60000
}

function normalizeAI(raw?: Partial<AIConfig>): AIConfig {
  const timeout = typeof raw?.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)
    ? Math.min(180000, Math.max(10000, Math.round(raw.timeoutMs)))
    : DEFAULT_AI.timeoutMs
  return {
    enabled: raw?.enabled === true,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl.trim() : '',
    model: typeof raw?.model === 'string' ? raw.model.trim() : '',
    timeoutMs: timeout
  }
}

export class SettingsService {
  constructor(private readonly dataDir: string) {}

  async get(): Promise<Preferences> {
    const stored = await readJson<Partial<Preferences>>(preferencesFile(this.dataDir))
    return {
      theme: stored?.theme === 'dark' ? 'dark' : 'light',
      dataDir: stored?.dataDir ?? this.dataDir,
      debugLogging: stored?.debugLogging === true,
      zoomFactor: typeof stored?.zoomFactor === 'number'
        ? Math.min(2, Math.max(0.5, stored.zoomFactor))
        : 1,
      lastProjectId: stored?.lastProjectId ?? null,
      lastEnvByProject: stored?.lastEnvByProject ?? {},
      onboardingCompleted: stored?.onboardingCompleted === true,
      ai: normalizeAI(stored?.ai)
    }
  }

  async update(patch: Partial<Preferences>): Promise<Preferences> {
    const current = await this.get()
    const next: Preferences = {
      ...current,
      ...patch,
      dataDir: current.dataDir,
      ai: patch.ai
        ? normalizeAI({ ...current.ai, ...patch.ai })
        : current.ai
    }
    await writeJsonAtomic(preferencesFile(this.dataDir), next)
    return next
  }
}
