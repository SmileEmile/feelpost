import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsService } from '../../src/main/services/settings-service'

describe('SettingsService', () => {
  let root = ''
  let service: SettingsService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'feelpost-settings-'))
    service = new SettingsService(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('defaults zoom to 100% and persists changes', async () => {
    expect((await service.get()).zoomFactor).toBe(1)
    const updated = await service.update({ zoomFactor: 1.25 })
    expect(updated.zoomFactor).toBe(1.25)
    expect((await service.get()).zoomFactor).toBe(1.25)
  })

  it('defaults onboarding to incomplete and persists completion', async () => {
    expect((await service.get()).onboardingCompleted).toBe(false)
    expect((await service.update({ onboardingCompleted: true })).onboardingCompleted).toBe(true)
    expect((await service.get()).onboardingCompleted).toBe(true)
  })

  it('defaults AI off and persists AI config without treating old files as invalid', async () => {
    expect((await service.get()).ai).toEqual({
      enabled: false,
      baseUrl: '',
      model: '',
      timeoutMs: 60000
    })
    const updated = await service.update({
      ai: { enabled: true, baseUrl: 'https://api.example.com/v1', model: 'demo', timeoutMs: 90000 }
    })
    expect(updated.ai).toEqual({
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      model: 'demo',
      timeoutMs: 90000
    })
    expect((await service.get()).ai.timeoutMs).toBe(90000)
  })
})
