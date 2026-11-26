/** Collapse arrays to their first element so repeated response records do not dominate the view. */
export function simplifyJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? [simplifyJson(value[0])] : []
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = simplifyJson(child)
    }
    return result
  }
  return value
}
