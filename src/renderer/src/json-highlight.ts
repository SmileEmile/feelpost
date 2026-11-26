export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlightJson(source: string): string {
  const escaped = escapeHtml(source)
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, stringToken: string | undefined, colon: string | undefined, literal: string | undefined) => {
      if (stringToken) {
        const cls = colon ? 'tok-key' : 'tok-string'
        return `<span class="${cls}">${stringToken}</span>${colon ?? ''}`
      }
      if (literal) {
        const cls = literal === 'null' ? 'tok-null' : 'tok-boolean'
        return `<span class="${cls}">${literal}</span>`
      }
      return `<span class="tok-number">${match}</span>`
    }
  )
}
