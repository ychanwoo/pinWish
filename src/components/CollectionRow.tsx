import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
interface Props {
  name: string
  count: number
  active: boolean
  editable: boolean
  onSelect: () => void
  onAction: (action: 'rename' | 'delete') => void
}
export function CollectionRow({
  name,
  count,
  active,
  editable,
  onSelect,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open) return
    const placeMenu = () => {
      if (!trigger.current || !menu.current) return
      const anchor = trigger.current.getBoundingClientRect()
      const bounds = menu.current.getBoundingClientRect()
      const below = anchor.bottom + 6
      setPosition({
        left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
        top: Math.max(8, below + bounds.height <= window.innerHeight - 8 ? below : anchor.top - bounds.height - 6),
      })
    }
    placeMenu()
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      className={`collection-row ${active ? 'active' : ''}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node) && !menu.current?.contains(event.relatedTarget as Node))
          setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          setOpen(false)
          trigger.current?.focus()
        }
        if (
          open &&
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
        ) {
          event.preventDefault()
          const items = [
            ...(menu.current?.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ) ?? []),
          ]
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) %
                  items.length
          items[next]?.focus()
        }
      }}
    >
      <button
        className={`collection-link ${active ? 'active' : ''}`}
        onClick={onSelect}
      >
        <Icon name="3e06b" />
        <span>{name}</span>
        <span className="count">{count}</span>
      </button>
      <button
        type="button"
        className="collection-more"
        aria-label={`Options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={trigger}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && createPortal(
        <div
          className="collection-menu"
          style={position}
          role="menu"
          aria-label={`${name} options`}
          ref={menu}
        >
          <button
            role="menuitem"
            disabled={!editable}
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
              onAction('rename')
            }}
          >
            Edit name
          </button>
          <button
            role="menuitem"
            className="collection-menu-delete"
            disabled={!editable}
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
              onAction('delete')
            }}
          >
            Delete
          </button>
          {!editable && (
            <p>
              Saved places is your default collection and cannot be renamed or
              deleted.
            </p>
          )}
        </div>, document.body
      )}
    </div>
  )
}
