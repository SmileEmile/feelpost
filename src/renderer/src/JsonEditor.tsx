import { useMemo, useRef } from 'react'
import { highlightJson } from './json-highlight'

interface Props {
  value: string
  onChange: (value: string) => void
  notes?: Record<string, string>
}

export default function JsonEditor({ value, onChange, notes }: Props): JSX.Element {
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const highlighted = useMemo(() => highlightJson(value) + '\n', [value])
  const lineCount = Math.max(1, value.split('\n').length)
  const lineNotes = useMemo(
    () => value.split('\n').map((line) => {
      const match = line.match(/^\s*"([^"]+)"\s*:/)
      return match ? notes?.[match[1]] ?? '' : ''
    }),
    [value, notes]
  )
  const hasNotes = lineNotes.some(Boolean)

  return (
    <div className="code-editor">
      <div className="code-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div className="code-main">
        <pre ref={preRef} className="code-highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlighted }} />
        <textarea
          className="code-input"
          value={value}
          spellCheck={false}
          wrap="off"
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const pre = preRef.current
            const gutter = gutterRef.current
            if (pre) {
              pre.scrollTop = event.currentTarget.scrollTop
              pre.scrollLeft = event.currentTarget.scrollLeft
            }
            if (gutter) gutter.scrollTop = event.currentTarget.scrollTop
            if (notesRef.current) notesRef.current.scrollTop = event.currentTarget.scrollTop
          }}
        />
      </div>
      {hasNotes && (
        <div className="code-notes" ref={notesRef} aria-label="字段备注">
          {lineNotes.map((note, index) => (
            <div key={index} className={note ? 'has-note' : ''} title={note}>{note || '\u00a0'}</div>
          ))}
        </div>
      )}
    </div>
  )
}
