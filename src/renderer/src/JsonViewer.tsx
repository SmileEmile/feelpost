import { useRef } from 'react'
import { highlightJson } from './json-highlight'

interface Props {
  value: string
}

export default function JsonViewer({ value }: Props): JSX.Element {
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = Math.max(1, value.split('\n').length)

  return (
    <div className="code-viewer">
      <div className="code-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre
        ref={preRef}
        className="code-highlight code-viewer-pre"
        dangerouslySetInnerHTML={{ __html: highlightJson(value) + '\n' }}
        onScroll={(event) => {
          const gutter = gutterRef.current
          if (gutter) gutter.scrollTop = event.currentTarget.scrollTop
        }}
        onWheel={(event) => {
          const pre = preRef.current
          if (!pre) return
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pre.clientHeight : 1
          pre.scrollTop += event.deltaY * unit
          pre.scrollLeft += event.deltaX * unit
          event.preventDefault()
        }}
      />
    </div>
  )
}
