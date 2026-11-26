import type { CSSProperties } from 'react'
import { tagHue } from './tag-color'

const RESERVED: Array<[RegExp, number]> = [
  [/(本地|local)/i, 215],
  [/(测试|test|staging|stage)/i, 145],
  [/(生产|prod|production)/i, 0]
]

export function envTagStyle(name: string): CSSProperties {
  const normalized = name.trim()
  const reserved = RESERVED.find(([pattern]) => pattern.test(normalized))
  return { '--tag-hue': reserved ? reserved[1] : tagHue(normalized || 'env') } as CSSProperties
}
