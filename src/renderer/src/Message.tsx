import { useEffect, useRef } from 'react'

interface Props {
  text: string
  onClose: () => void
  duration?: number
}

export default function Message({ text, onClose, duration = 3000 }: Props): JSX.Element | null {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!text) return
    const timer = window.setTimeout(() => closeRef.current(), duration)
    return () => window.clearTimeout(timer)
  }, [text, duration])

  if (!text) return null
  return (
    <div className="toast error-toast" role="status" onClick={() => closeRef.current()}>
      <span>{text}</span>
      <span className="toast-close">×</span>
    </div>
  )
}
