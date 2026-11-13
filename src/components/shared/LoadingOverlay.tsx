import { useEffect, useRef } from 'react'

export function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5" />
      <path d="M20 12a8 8 0 1 0-2.3 5.7M20 12a8 8 0 0 0-2.3-5.7" />
    </svg>
  )
}

/** Keep async feedback consistent without replacing the current screen or draft. */
export function LoadingOverlay({
  active,
  onCancel,
}: {
  active: boolean
  onCancel?: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  }, [onCancel])
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    root.current?.focus()
    const guard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel.current?.()
      } else if (
        event.key === 'Tab' ||
        !root.current?.contains(event.target as Node)
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        root.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('keydown', guard, true)
    return () => {
      document.removeEventListener('keydown', guard, true)
      if (previous?.isConnected && !previous.closest('[inert]'))
        previous.focus()
    }
  }, [active])
  if (!active) return null
  return (
    <div
      className="loading-screen"
      ref={root}
      tabIndex={-1}
      aria-label="Loading"
    >
      <div className="loading-screen-content" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
      {onCancel && (
        <button className="loading-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
