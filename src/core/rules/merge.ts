/** Parameter merge rules (design docs 01 BR-5 / 03 §5 C4). */

export interface Row {
  key: string
  value: string
  enabled: boolean
}

export interface SourcedRow extends Row {
  source: 'global' | 'env' | 'interface' | 'auto'
  overrides: number
}

export function mergeLayers(layers: Array<[SourcedRow['source'], Row[] | undefined]>): SourcedRow[] {
  const map = new Map<string, SourcedRow>()
  for (const [source, rows] of layers) {
    for (const row of rows ?? []) {
      if (!row.enabled || !row.key) continue
      const prev = map.get(row.key)
      map.set(row.key, {
        key: row.key,
        value: row.value,
        enabled: true,
        source,
        overrides: prev ? prev.overrides + 1 : 0
      })
    }
  }
  return [...map.values()]
}

export interface EffectiveParams {
  query: SourcedRow[]
  headers: SourcedRow[]
  cookies: SourcedRow[]
  bodyText: string
}

export type Merged = ReturnType<typeof mergeParams>

export interface MergeInput {
  global: { query: Row[]; headers: Row[]; cookies: Row[]; body: Row[] }
  env: { query: Row[]; headers: Row[]; cookies: Row[]; body: Row[] }
  draft: {
    query: Row[]
    headers: Row[]
    cookies: Row[]
    bodyRaw: string
  }
}

/** Body is filled from env/global only when the key is missing (DQ14). */
export function mergeParams(input: MergeInput): EffectiveParams {
  const query = mergeLayers([
    ['global', input.global.query],
    ['env', input.env.query],
    ['interface', input.draft.query]
  ])
  const headers = mergeLayers([
    ['global', input.global.headers],
    ['env', input.env.headers],
    ['interface', input.draft.headers]
  ])
  const cookies = mergeLayers([
    ['global', input.global.cookies],
    ['env', input.env.cookies],
    ['interface', input.draft.cookies]
  ])

  let bodyText = input.draft.bodyRaw.trim()
  if (bodyText && bodyText.startsWith('{')) {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>
      for (const row of [...(input.global.body ?? []), ...(input.env.body ?? [])]) {
        if (row.enabled && row.key && !(row.key in parsed)) parsed[row.key] = row.value
      }
      bodyText = JSON.stringify(parsed, null, 2)
    } catch {
      /* keep raw text when not valid JSON */
    }
  }
  return { query, headers, cookies, bodyText }
}
