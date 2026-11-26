import type { CSSProperties } from 'react'

/** Stable hue per tag, so the same tag has the same color everywhere. */
export function tagHue(tag: string): number {
  let hash = 2166136261
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % 360
}

export function tagStyle(tag: string): CSSProperties {
  return { '--tag-hue': tagHue(tag) } as CSSProperties
}
