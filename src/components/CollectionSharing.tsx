import { useEffect, useRef, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import type { SavedCollection } from '../lib/storage-api'
import {
  shareSettings,
  shareUrl,
  type ShareSettings,
} from '../lib/collection-sharing'
export function CollectionSharing({
  collection,
  onClose,
}: {
  collection: SavedCollection
  onClose: () => void
}) {
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false)
  const active = useRef(true)
  const lock = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const root = useModalFocus(true, () => {
    if (!lock.current) onClose()
  })
  useEffect(() => {
    active.current = true
    let cancelled = false
    shareSettings(collection.id)
      .then((value) => {
        if (!cancelled) setSettings(value)
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not load sharing settings. Please retry.')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
      active.current = false
    }
  }, [collection.id])
  const update = async (method: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await shareSettings(collection.id, method)
      if (active.current) {
        setSettings(value)
        setConfirm(false)
        setNotice(
          method === 'DELETE'
            ? 'Sharing stopped. The old link no longer works.'
            : '',
        )
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not update sharing. Try again.',
        )
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <div className="simple-overlay" ref={root}>
      <section
        className="simple-dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-title"
        aria-busy={busy}
      >
        <p className="share-eyebrow">COLLECTION SHARING</p>
        <h2 id="sharing-title">
          {confirm ? 'Stop sharing?' : 'Share collection'}
        </h2>
        <p className="share-collection-name">{collection.name}</p>
        {confirm ? (
          <p>
            Anyone with this link will lose access. You can create a new link
            later.
          </p>
        ) : (
          <>
            <p>
              Anyone with the link can view the collection name, places,
              addresses, map and available photos. They cannot make changes.
            </p>
            <p className="share-privacy">
              Your personal notes, visited status, account details and original
              post links stay private.
            </p>
            {busy && !settings && (
              <p role="status">Loading sharing settings…</p>
            )}
            {settings?.active && settings.token && (
              <>
                <label htmlFor="collection-share-link">Read-only link</label>
                <div className="share-link-row">
                  <input
                    id="collection-share-link"
                    ref={input}
                    readOnly
                    value={shareUrl(settings.token)}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          shareUrl(settings.token!),
                        )
                        if (active.current) setNotice('Link copied.')
                      } catch {
                        input.current?.focus()
                        input.current?.select()
                        setNotice('Select and copy the link above.')
                      }
                    }}
                  >
                    Copy link
                  </button>
                </div>
                {settings.expiresAt && (
                  <p className="share-expiry">
                    Expires{' '}
                    {new Date(settings.expiresAt * 1000).toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric', year: 'numeric' },
                    )}
                    . Collection updates appear when the link is refreshed.
                  </p>
                )}
              </>
            )}
            {settings && !settings.active && (
              <p className="share-state">Only you can view this collection.</p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirm ? setConfirm(false) : onClose())}
          >
            {confirm ? 'Keep sharing' : 'Done'}
          </button>
          {!settings && !busy && (
            <button className="primary" onClick={() => void update('GET')}>
              Retry
            </button>
          )}
          {settings && !settings.active && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void update('POST')}
            >
              {busy ? 'Creating…' : 'Create sharing link'}
            </button>
          )}
          {settings?.active && (
            <button
              className={confirm ? 'primary' : 'share-stop'}
              disabled={busy}
              onClick={() =>
                confirm ? void update('DELETE') : setConfirm(true)
              }
            >
              {busy ? 'Updating…' : 'Stop sharing'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
