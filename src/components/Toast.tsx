import { useCallback, useEffect, useRef, useState } from 'react'
import './Toast.css'

// A brief confirmation that dismisses itself after `ms`.
export function useToast(ms: number) {
  const [message, setMessage] = useState('')
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = useCallback(
    (text: string) => {
      setMessage(text)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMessage(''), ms)
    },
    [ms],
  )
  return [message, show] as const
}

export function Toast({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span> {message}
    </div>
  )
}
