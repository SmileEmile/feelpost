/** Stable, dependency-free fingerprint used for scan comparison (BR-2). */

function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface FingerprintInput {
  method: string
  path: string
  paramsDigest: string
}

export function apiFingerprint(input: FingerprintInput): string {
  return hash(`${input.method.toUpperCase()} ${input.path}|${input.paramsDigest}`)
}

export function paramsDigest(params: Array<{ location: string; name: string; type?: string; required?: boolean }>): string {
  return params
    .map((p) => `${p.location}:${p.name}:${p.type ?? ''}:${p.required ? 1 : 0}`)
    .sort()
    .join(';')
}
