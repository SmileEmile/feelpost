export type SpeedTone = 'fast' | 'good' | 'medium' | 'slow' | 'very-slow'

export interface SpeedRating {
  key: 'rocket' | 'plane' | 'rabbit' | 'turtle' | 'snail' | 'sloth'
  icon: string
  label: string
  tone: SpeedTone
  range: string
}

export function rateSpeed(ms: number): SpeedRating {
  const time = Math.max(0, ms)
  if (time <= 100) return { key: 'rocket', icon: '🚀', label: '快如火箭', tone: 'fast', range: '0–100ms' }
  if (time <= 300) return { key: 'plane', icon: '✈️', label: '快如飞机', tone: 'fast', range: '101–300ms' }
  if (time <= 800) return { key: 'rabbit', icon: '🐇', label: '轻快如兔', tone: 'good', range: '301–800ms' }
  if (time <= 1500) return { key: 'turtle', icon: '🐢', label: '稳如乌龟', tone: 'medium', range: '801–1500ms' }
  if (time <= 3000) return { key: 'snail', icon: '🐌', label: '慢如蜗牛', tone: 'slow', range: '1501–3000ms' }
  return { key: 'sloth', icon: '🦥', label: '比蜗牛还慢', tone: 'very-slow', range: '>3000ms' }
}
