import { describe, expect, it } from 'vitest'
import { rateSpeed } from '../../src/renderer/src/speed-rating'

describe('rateSpeed', () => {
  it('maps response time to the right fun level', () => {
    expect(rateSpeed(50).key).toBe('rocket')
    expect(rateSpeed(100).key).toBe('rocket')
    expect(rateSpeed(101).key).toBe('plane')
    expect(rateSpeed(300).key).toBe('plane')
    expect(rateSpeed(301).key).toBe('rabbit')
    expect(rateSpeed(800).key).toBe('rabbit')
    expect(rateSpeed(801).key).toBe('turtle')
    expect(rateSpeed(1500).key).toBe('turtle')
    expect(rateSpeed(1501).key).toBe('snail')
    expect(rateSpeed(3000).key).toBe('snail')
    expect(rateSpeed(3001).key).toBe('sloth')
  })

  it('uses Chinese labels and icons', () => {
    expect(rateSpeed(95)).toMatchObject({ icon: '🚀', label: '快如火箭' })
    expect(rateSpeed(1200)).toMatchObject({ icon: '🐢', label: '稳如乌龟' })
    expect(rateSpeed(5000)).toMatchObject({ icon: '🦥', label: '比蜗牛还慢' })
  })
})
