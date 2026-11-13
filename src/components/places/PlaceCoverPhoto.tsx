import { useEffect, useRef, useState } from 'react'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { SavedPlace } from '../../lib/storage-api'
import { cachedPhoto, loadPhoto } from '../../lib/place-photo'
export function PlaceCoverPhoto({
  place,
  name,
  onUpdated,
}: {
  place: SavedPlace
  name: string
  onUpdated: (place: SavedPlace) => void
}) {
  const [url, setUrl] = useState(() => cachedPhoto(place.id)?.url ?? ''),
    [status, setStatus] = useState('Loading photo…'),
    [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const update = useRef(onUpdated)
  useEffect(() => {
    update.current = onUpdated
  }, [onUpdated])
  const modal = useModalFocus(expanded, () => setExpanded(false))
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    async function load() {
      try {
        const result = await loadPhoto(place.id, retry > 0 && attempts === 0)
        if (cancelled) {
          return
        }
        update.current(result.item)
        if (result.url) {
          setUrl(result.url)
          setStatus('')
          return
        }
        if (result.status === 'pending' && ++attempts < 30) {
          setStatus('Finding a photo…')
          timer = setTimeout(() => void load(), 3000)
          return
        }
        setStatus(
          result.status === 'not_found'
            ? 'Photo unavailable'
            : 'Photo temporarily unavailable. Try again shortly.',
        )
      } catch {
        if (!cancelled)
          setStatus('Photo temporarily unavailable. Try again shortly.')
      }
    }
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setUrl(cachedPhoto(place.id)?.url ?? '')
        setStatus('Loading photo…')
        setExpanded(false)
        void load()
      }
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [place.id, retry])
  const credit = place.coverPhoto ?? cachedPhoto(place.id)?.item.coverPhoto
  return (
    <section className="place-cover" aria-label="Place cover photo">
      <div className="cover-frame">
        {url ? (
          <button
            type="button"
            aria-label={`Enlarge photo of ${name}`}
            onClick={() => setExpanded(true)}
          >
            <img
              src={url}
              alt={name}
              onError={() => {
                setUrl('')
                setStatus('Photo temporarily unavailable. Try again shortly.')
              }}
            />
          </button>
        ) : (
          <div className="cover-placeholder" role="status">
            {status}
          </div>
        )}
      </div>
      {status.includes('temporarily') && (
        <button
          className="cover-text-button"
          onClick={() => setRetry((n) => n + 1)}
        >
          Retry photo
        </button>
      )}
      {url && credit && (
        <p className="cover-credit">
          {credit.author} ·{' '}
          {credit.licenseUrl ? (
            <a
              href={credit.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {credit.license}
            </a>
          ) : (
            credit.license
          )}{' '}
          ·{' '}
          <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">
            Photo source ↗
          </a>{' '}
          · Resized
        </p>
      )}
      {expanded && url && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo of ${name}`}
          ref={modal}
        >
          <button
            className="cover-lightbox-close"
            onClick={() => setExpanded(false)}
          >
            Close photo
          </button>
          <img src={url} alt={name} />
        </div>
      )}
    </section>
  )
}
