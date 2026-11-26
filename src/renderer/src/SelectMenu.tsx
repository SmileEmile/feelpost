import { Fragment, useEffect, useRef, useState } from 'react'

interface Option {
  value: string
  label: string
  icon?: JSX.Element
  section?: string
}

interface Props {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
  title?: string
}

export default function SelectMenu({ value, options, onChange, className = '', title }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`theme-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`theme-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title={title}
      >
        <span className="theme-select-value">{selected?.icon}{selected?.label ?? value}</span>
        <span className="theme-select-caret">▾</span>
      </button>
      {open && (
        <div className="theme-select-menu" role="listbox">
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {option.section && options[index - 1]?.section !== option.section && (
                <div className="theme-select-section">{option.section}</div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`theme-select-item ${option.value === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className="theme-select-option-label">{option.icon}{option.label}</span>
                {option.value === value && <span className="theme-select-check">✓</span>}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
