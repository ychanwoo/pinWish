import { LoadingOverlay } from '../shared/LoadingOverlay'
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
} from 'react'
import {
  readShared,
  ShareUnavailable,
  type SharedCollection,
  type SharedPlace,
  type SharedPhoto,
} from '../../lib/collection-sharing'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { Place } from '../../data/places'
const LiveMap = lazy(() => import('../maps/LiveMap'))
function safeUrl(value?: string) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}
function SharedPhotoView({
  token,
  place,
  onUnavailable,
}: {
  token: string
  place: SharedPlace
  onUnavailable: () => void
}) {
  const [photo, setPhoto] = useState<SharedPhoto | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!place.hasPhoto) return
    const controller = new AbortController()
    readShared<SharedPhoto>(
      token,
      `/places/${place.id}/photo`,
      controller.signal,
    )
      .then(setPhoto)
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof ShareUnavailable) onUnavailable()
        else setFailed(true)
      })
    return () => controller.abort()
  }, [token, place.id, place.hasPhoto, attempt, onUnavailable])
  const ready =
    photo?.status === 'ready' &&
    photo.contentType === 'image/jpeg' &&
    photo.imageBase64 &&
    photo.imageBase64.length <= 2_800_000
  return (
    <figure className="shared-photo">
      {ready ? (
        <img
          src={`data:image/jpeg;base64,${photo.imageBase64}`}
          alt={place.name}
        />
      ) : (
        <div className="shared-photo-empty">
          {!place.hasPhoto || photo?.status === 'unavailable'
            ? 'Photo unavailable'
            : failed
              ? 'Could not load photo'
              : 'Loading photo…'}
          {failed && (
            <button
              onClick={() => {
                setFailed(false)
                setAttempt((a) => a + 1)
              }}
            >
              Retry photo
            </button>
          )}
        </div>
      )}
      {ready && photo.attribution && (
        <figcaption>
          Photo by {photo.attribution.author} ·{' '}
          <a
            href={safeUrl(photo.attribution.sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>{' '}
          ·{' '}
          <a
            href={safeUrl(photo.attribution.licenseUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {photo.attribution.license}
          </a>
        </figcaption>
      )}
    </figure>
  )
}
const subscribeMobile = (notify: () => void) => {
  const media = matchMedia('(max-width: 760px)')
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const mobileSnapshot = () => matchMedia('(max-width: 760px)').matches
function SharedDetail({
  token,
  selected,
  onClose,
  onUnavailable,
}: {
  token: string
  selected: SharedPlace
  onClose: () => void
  onUnavailable: () => void
}) {
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot)
  const root = useModalFocus(mobile, onClose)
  return (
    <div
      ref={root}
      className="shared-detail"
      role={mobile ? 'dialog' : 'region'}
      aria-modal={mobile || undefined}
      aria-label="Shared place details"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <button
        className="shared-close"
        onClick={onClose}
        aria-label="Close place details"
      >
        ×
      </button>
      <p className="share-eyebrow">PLACE DETAILS</p>
      <h2 id="shared-place-title" tabIndex={-1}>
        {selected.name}
      </h2>
      <p>{selected.address}</p>
      <SharedPhotoView
        key={selected.id}
        token={token}
        place={selected}
        onUnavailable={onUnavailable}
      />
      <a
        className="primary shared-directions"
        href={`https://www.google.com/maps/dir/?api=1&destination=${selected.coordinates.latitude},${selected.coordinates.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Directions
      </a>
    </div>
  )
}
export default function SharedCollectionPage({ token }: { token: string }) {
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot)
  const [data, setData] = useState<SharedCollection | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow, noarchive'
    document.head.append(robots)
    return () => {
      robots.remove()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let valid = true
    let generation = 0
    async function load() {
      const request = ++generation
      try {
        let result = await readShared<SharedCollection>(
          token,
          '',
          controller.signal,
        )
        // A sparse collection may be spread across owner pages. Bound each refresh.
        for (let page = 1; result.cursor && page < 5; page++) {
          const next = await readShared<SharedCollection>(
            token,
            `?cursor=${result.cursor}`,
            controller.signal,
          )
          result = { ...next, items: [...result.items, ...next.items] }
        }
        if (valid && request === generation) {
          setData(result)
          setError('')
          setUnavailable(false)
        }
      } catch (e) {
        if (valid && request === generation) {
          setData(null)
          setUnavailable(e instanceof ShareUnavailable)
          setError(
            e instanceof Error ? e.message : 'Could not load this collection.',
          )
        }
      } finally {
        if (valid && request === generation) setLoading(false)
      }
    }
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 60000)
    return () => {
      valid = false
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [token, attempt])
  const loseAccess = useCallback(() => {
    setData(null)
    setUnavailable(true)
    setError('This link or place is no longer available.')
  }, [])
  const closeDetail = useCallback(() => setSelectedId(''), [])
  const places: Place[] = (data?.items ?? []).map((p) => ({
    ...p,
    coordinates: p.coordinates,
    kind: 'Shared place',
    district: p.countryName,
    category: 'Other',
    visited: false,
    badge: '',
    note: '',
    photo: '',
    collection: data?.name ?? '',
    bookmarked: false,
  }))
  const selected = data?.items.find((p) => p.id === selectedId)
  const select = (p: Place) => {
    setSelectedId(p.id)
    requestAnimationFrame(() =>
      document.getElementById('shared-place-title')?.focus(),
    )
  }
  return (
    <div className="shared-page">
      <header className="shared-header" inert={!!selected && mobile}>
        <a className="shared-brand" href="/">
          pinWish
        </a>
        <span>Shared collection · Read only</span>
      </header>
      <LoadingOverlay active={loading && !data} />
      {loading && !data ? (
        <main className="shared-message" role="status">
          Loading collection…
        </main>
      ) : !data ? (
        <main className="shared-message">
          <h1>
            {unavailable
              ? 'This link is unavailable'
              : 'Could not load collection'}
          </h1>
          <p>{error}</p>
          <button
            onClick={() => {
              setLoading(true)
              setAttempt((a) => a + 1)
            }}
          >
            Try again
          </button>
          <a href="/">Open PinWish</a>
        </main>
      ) : (
        <main className="shared-layout">
          <section
            inert={!!selected && mobile}
            className="shared-list"
            aria-label="Shared places"
          >
            <p className="share-eyebrow">A COLLECTION TO EXPLORE</p>
            <h1>{data.name}</h1>
            <p className="shared-count">
              {data.items.length} {data.items.length === 1 ? 'place' : 'places'}
              {data.cursor ? ' loaded' : ''}
            </p>
            {!data.items.length && !data.cursor && (
              <p>No places in this collection yet.</p>
            )}
            <div className="shared-place-buttons">
              {data.items.map((p, index) => (
                <button
                  key={p.id}
                  aria-pressed={selectedId === p.id}
                  onClick={() => select(places[index])}
                >
                  <span className="shared-place-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.address || p.countryName}</small>
                  </span>
                </button>
              ))}
            </div>
            {data.cursor && (
              <button
                disabled={moreBusy}
                onClick={async () => {
                  setMoreBusy(true)
                  try {
                    const next = await readShared<SharedCollection>(
                      token,
                      `?cursor=${data.cursor}`,
                    )
                    setData((current) =>
                      current
                        ? {
                            ...next,
                            items: [
                              ...new Map(
                                [...current.items, ...next.items].map((p) => [
                                  p.id,
                                  p,
                                ]),
                              ).values(),
                            ],
                          }
                        : null,
                    )
                  } catch (e) {
                    setData(null)
                    setUnavailable(e instanceof ShareUnavailable)
                    setError(
                      e instanceof Error ? e.message : 'Could not load places.',
                    )
                  } finally {
                    setMoreBusy(false)
                  }
                }}
              >
                {moreBusy ? 'Loading…' : 'Load more places'}
              </button>
            )}
            <p className="shared-footnote">
              Shared by its owner. Personal notes and account details are
              private.
            </p>
          </section>
          <div className="shared-map" inert={!!selected && mobile}>
            <Suspense fallback={<p>Loading map…</p>}>
              <LiveMap
                places={places}
                selectedId={selectedId}
                onSelect={select}
                loading={false}
                loadError=""
                onRetryPlaces={() => setAttempt((a) => a + 1)}
              />
            </Suspense>
          </div>
          {selected && (
            <SharedDetail
              token={token}
              selected={selected}
              onClose={closeDetail}
              onUnavailable={loseAccess}
            />
          )}
        </main>
      )}
    </div>
  )
}
