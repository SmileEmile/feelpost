/** Merge independently generated interface documents without dropping H1 headings. */
export function mergeMarkdown(fragments: string[]): string {
  if (fragments.length <= 1) return fragments[0] ?? ''
  return fragments.map((fragment) => fragment.trim()).join('\n\n')
}
