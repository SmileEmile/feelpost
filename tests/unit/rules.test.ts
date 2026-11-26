import { describe, expect, it } from 'vitest'
import { mergeLayers, mergeParams } from '@core/rules/merge'
import { apiFingerprint, paramsDigest } from '@core/rules/fingerprint'
import { canTransition, confirmChange, restoreArchived } from '@core/rules/state'

describe('mergeLayers', () => {
  it('lets later layers override earlier keys and tracks sources', () => {
    const rows = mergeLayers([
      ['global', [{ key: 'A', value: 'g', enabled: true }]],
      ['env', [{ key: 'A', value: 'e', enabled: true }]],
      ['interface', []]
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 'A', value: 'e', source: 'env', overrides: 1 })
  })

  it('skips disabled rows', () => {
    const rows = mergeLayers([
      ['interface', [
        { key: 'A', value: '1', enabled: true },
        { key: 'B', value: '2', enabled: false }
      ]]
    ])
    expect(rows.map((r) => r.key)).toEqual(['A'])
  })
})

describe('mergeParams', () => {
  const empty = { query: [], headers: [], cookies: [], body: [] }

  it('fills missing body fields only', () => {
    const result = mergeParams({
      global: { ...empty, body: [{ key: 'client', value: 'web', enabled: true }] },
      env: { ...empty, body: [{ key: 'tenant', value: 'qa', enabled: true }] },
      draft: { ...empty, bodyRaw: '{\n  "client": "custom"\n}' }
    })
    const body = JSON.parse(result.bodyText)
    expect(body.client).toBe('custom')
    expect(body.tenant).toBe('qa')
  })

  it('keeps raw body when it is not JSON', () => {
    const result = mergeParams({
      global: empty,
      env: empty,
      draft: { ...empty, bodyRaw: 'a=1&b=2' }
    })
    expect(result.bodyText).toBe('a=1&b=2')
  })
})

describe('fingerprint', () => {
  it('is stable for same identity and changes with params', () => {
    const a = apiFingerprint({ method: 'GET', path: '/users', paramsDigest: paramsDigest([{ location: 'query', name: 'page' }]) })
    const b = apiFingerprint({ method: 'get', path: '/users', paramsDigest: paramsDigest([{ location: 'query', name: 'page' }]) })
    const c = apiFingerprint({ method: 'GET', path: '/users', paramsDigest: paramsDigest([{ location: 'query', name: 'size' }]) })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('state machine', () => {
  it('allows only declared transitions', () => {
    expect(canTransition('registered', 'changed')).toBe(true)
    expect(canTransition('archived', 'changed')).toBe(false)
    expect(confirmChange('changed')).toBe('registered')
    expect(restoreArchived('archived')).toBe('registered')
    expect(() => confirmChange('registered')).toThrow()
  })
})
