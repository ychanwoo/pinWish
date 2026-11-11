import { useRef, useState } from 'react'
import type { SavedCollection } from '../lib/storage-api'
import { useModalFocus } from '../hooks/useModalFocus'

interface Props {
  collection?: SavedCollection
  onClose: () => void
  onCreate: (id: string, name: string) => Promise<void>
  onRename: (collection: SavedCollection, name: string) => Promise<void>
  onDelete: (collection: SavedCollection) => Promise<void>
}
export function CollectionDialog({
  collection,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [name, setName] = useState(collection?.name ?? '')
  const [id] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const close = () => {
    if (!pending.current) onClose()
  }
  const ref = useModalFocus(true, close)
  const perform = async (operation: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await operation()
      onClose()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your collection. Please retry.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <div className="simple-overlay" ref={ref}>
      <form
        className="simple-dialog collection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-title"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault()
          if (confirmDelete && collection) {
            void perform(() => onDelete(collection))
            return
          }
          const trimmed = name.normalize('NFKC').trim()
          if (!trimmed || trimmed.length > 60 || /[\p{Cc}]/u.test(trimmed)) {
            setError('Use a collection name with 1–60 characters.')
            return
          }
          void perform(() =>
            collection ? onRename(collection, trimmed) : onCreate(id, trimmed),
          )
        }}
      >
        <h2 id="collection-title">
          {confirmDelete
            ? 'Delete collection?'
            : collection
              ? 'Manage collection'
              : 'New collection'}
        </h2>
        {confirmDelete ? (
          <p>
            Places in <strong>{collection?.name}</strong> will move to Saved
            places. Your notes, photos and original links will be kept.
          </p>
        ) : (
          <>
            <label htmlFor="collection-name">Collection name</label>
            <input
              autoFocus
              id="collection-name"
              maxLength={60}
              value={name}
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'collection-error' : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
            />
            <p className="collection-hint">
              Keep places together for a trip, a neighborhood, or another day.
            </p>
          </>
        )}
        {error && (
          <p id="collection-error" role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="collection-dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={
              confirmDelete
                ? () => {
                    setConfirmDelete(false)
                    setError('')
                  }
                : close
            }
          >
            {confirmDelete ? 'Keep collection' : 'Cancel'}
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="delete-confirm"
              disabled={busy}
              onClick={() => void perform(() => onDelete(collection!))}
            >
              {busy ? 'Deleting…' : 'Delete collection'}
            </button>
          ) : (
            <button className="primary" disabled={busy || !name.trim()}>
              {busy
                ? 'Saving…'
                : collection
                  ? 'Save name'
                  : 'Create collection'}
            </button>
          )}
        </div>
        {collection && !confirmDelete && (
          <div className="collection-delete-area">
            <button
              type="button"
              className="delete-trigger"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(true)
                setError('')
              }}
            >
              Delete collection
            </button>
            <p>Saved places will be kept.</p>
          </div>
        )}
      </form>
    </div>
  )
}
