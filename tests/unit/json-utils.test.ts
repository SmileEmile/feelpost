import { describe, expect, it } from 'vitest'
import { simplifyJson } from '../../src/renderer/src/json-utils'

describe('simplifyJson', () => {
  it('keeps only the first element of arrays recursively', () => {
    const input = {
      code: 200,
      data: {
        total: 100,
        list: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' }
        ],
        nested: [{ rows: [1, 2, 3] }]
      }
    }
    expect(simplifyJson(input)).toEqual({
      code: 200,
      data: {
        total: 100,
        list: [{ id: 1, name: 'A' }],
        nested: [{ rows: [1] }]
      }
    })
  })

  it('leaves primitives and empty arrays untouched', () => {
    expect(simplifyJson(1)).toBe(1)
    expect(simplifyJson(null)).toBeNull()
    expect(simplifyJson([])).toEqual([])
  })
})
