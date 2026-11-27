import { describe, expect, it } from 'vitest'
import { isNewerVersion, normalizeVersion } from '../../src/main/services/update-service'

describe('update version comparison', () => {
  it('normalizes release tags', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3')
    expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3')
  })

  it('detects newer semantic versions', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false)
  })
})
