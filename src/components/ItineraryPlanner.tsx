import { LoadingOverlay } from './LoadingOverlay'
import { useEffect, useRef, useState } from 'react'
import type { SavedCollection, SavedPlace } from '../lib/storage-api'
import {
  tripAPI,
  tripDate,
  type TripContext,
  type TripSettings,
  type TripPreview,
  type SavedTrip,
} from '../lib/itineraries'
import { useModalFocus } from '../hooks/useModalFocus'
import { TripSchedule } from './TripSchedule'
const defaultSettings = (): TripSettings => ({
  date: new Date(Date.now() + 86400000).toLocaleDateString('en-CA'),
  start: '09:00',
  end: '18:00',
  days: 0,
  mode: 'Car',
  order: 'recommended',
  stops: [],
})
export function ItineraryPlanner({
  collection,
  places,
  onClose,
}: {
  collection: SavedCollection
  places: SavedPlace[]
  onClose: () => void
}) {
  const [step, setStep] = useState<'select' | 'review' | 'result' | 'saved'>(
      'select',
    ),
    [selected, setSelected] = useState<string[]>(
      places
        .filter((p) => !p.visited)
        .slice(0, 20)
        .map((p) => p.id),
    )
  const [settings, setSettings] = useState<TripSettings>(defaultSettings),
    [context, setContext] = useState<TripContext | null>(null),
    [preview, setPreview] = useState<TripPreview | null>(null),
    [saved, setSaved] = useState<SavedTrip | null>(null),
    [trips, setTrips] = useState<SavedTrip[]>([])
  const [name, setName] = useState(collection.name + ' trip'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [confirmation, setConfirmation] = useState<'delete' | 'stop' | null>(null)
  const [loadingTrips, setLoadingTrips] = useState(true)
  const pending = useRef(false),
    alive = useRef(true),
    saveId = useRef(crypto.randomUUID()),
    heading = useRef<HTMLHeadingElement>(null)
  const close = () => {
    if (!pending.current) onClose()
  }
  const root = useModalFocus(true, close)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    void tripAPI<{ items: SavedTrip[] }>(
      `/itineraries?collectionId=${encodeURIComponent(collection.id)}`,
    )
      .then((r) => {
        if (alive.current) setTrips(r.items)
      })
      .catch((e) => {
        if (alive.current) setError(e.message)
      })
      .finally(() => { if (alive.current) setLoadingTrips(false) })
  }, [collection.id])
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  async function run(label: string, action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(label)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      pending.current = false
      if (alive.current) setBusy('')
    }
  }
  function startEdit(item: SavedTrip) {
    setSaved(item)
    setName(item.name)
    setSettings(item.settings)
    setSelected(item.settings.stops.map((s) => s.id))
    setContext(null)
    setPreview(null)
    setStep('select')
    setConfirmation(null)
    setError('')
  }
  const prepare = () =>
    run('Checking opening hours…', async () => {
      const r = await tripAPI<TripContext>(
        `/collections/${collection.id}/itineraries/prepare`,
        'POST',
        { ids: selected },
      )
      if (!alive.current) return
      setContext(r)
      setSettings((s) => ({
        ...s,
        stops: r.places.map(
          (p) =>
            s.stops.find((x) => x.id === p.id) ?? {
              id: p.id,
              duration: p.suggestedDuration,
            },
        ),
      }))
      setStep('review')
    })
  const generate = () =>
    run('Building your journey…', async () => {
      if (!context) return
      const r = await tripAPI<TripPreview>('/itineraries/preview', 'POST', {
        contextId: context.contextId,
        settings,
      })
      if (!alive.current) return
      setPreview(r)
      setStep('result')
    })
  const save = () =>
    run('Saving journey…', async () => {
      if (!preview) return
      const r = await tripAPI<{ item: SavedTrip }>('/itineraries', 'POST', {
        previewId: preview.previewId,
        id: saved?.id ?? saveId.current,
        version: saved?.version,
        name,
      })
      if (!alive.current) return
      setSaved(r.item)
      setTrips((t) => [r.item, ...t.filter((x) => x.id !== r.item.id)])
      setStep('saved')
      setMessage('Journey saved.')
    })
  const sharing = (method: string) =>
    run(
      method === 'POST' ? 'Creating link…' : 'Stopping sharing…',
      async () => {
        const r = await tripAPI<{ item: SavedTrip }>(
          `/itineraries/${saved!.id}/sharing`,
          method,
        )
        if (!alive.current) return
        setSaved(r.item)
        setTrips((t) => t.map((x) => (x.id === r.item.id ? r.item : x)))
        setConfirmation(null)
      },
    )
  function changeStop(
    id: string,
    update: Partial<TripSettings['stops'][number]>,
  ) {
    setSettings((s) => ({
      ...s,
      stops: s.stops.map((p) => (p.id === id ? { ...p, ...update } : p)),
    }))
  }
  function move(index: number, delta: number) {
    setSettings((s) => {
      const stops = [...s.stops]
      ;[stops[index], stops[index + delta]] = [
        stops[index + delta],
        stops[index],
      ]
      return { ...s, order: 'manual', stops }
    })
  }
  const current = step === 'saved' ? saved : preview
  return (
    <div className="trip-overlay" ref={root}>
      <LoadingOverlay active={!!busy || loadingTrips} />
      <section
        className="trip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-title"
        aria-busy={!!busy}
      >
        <header className="trip-header">
          <div>
            <span className="trip-collection-name">{collection.name}</span>
            <h1 ref={heading} tabIndex={-1} id="trip-title">
              {step === 'saved' ? 'Your saved trip' : 'Plan a trip'}
            </h1>
          </div>
          <button
            className="trip-close"
            onClick={close}
            disabled={!!busy}
            aria-label="Close trip planner"
          >
            ×
          </button>
        </header>
        <div className="trip-progress" aria-label="Planning progress">
          {['Choose places', 'Review hours & time', 'Your journey'].map(
            (s, i) => (
              <span
                key={s}
                className={
                  (step === 'select' ? 0 : step === 'review' ? 1 : 2) === i
                    ? 'current'
                    : ''
                }
              >
                {String(i + 1).padStart(2, '0')} <span>{s}</span>
              </span>
            ),
          )}
        </div>
        <div className="trip-body" inert={!!busy}>
          {step === 'select' && (
            <>
              <div className="trip-section-heading trip-selection-heading">
                <div>
                  <h2>Choose places</h2>
                  <p>Select 3–20 places in the same time zone.</p>
                </div>
                <span>{selected.length} selected</span>
              </div>
              {!places.length && <p>No saved places in this collection yet.</p>}
              <div className="trip-place-selection">
                {places.map((p) => (
                  <label
                    key={p.id}
                    className={selected.includes(p.id) ? 'selected' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      disabled={
                        !!busy ||
                        (!selected.includes(p.id) && selected.length >= 20)
                      }
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, p.id]
                            : ids.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>
                      <strong>{p.displayName ?? p.name}</strong>
                      <small>{p.address}</small>
                    </span>
                    <em>{p.visited ? 'Visited' : 'To visit'}</em>
                  </label>
                ))}
              </div>
              <p className="trip-muted">
                We’ll retrieve opening hours before planning. Places with
                missing hours will be included with a reminder to check before
                visiting.
              </p>
              {!!trips.length && (
                <section className="trip-library">
                  <h3>Saved journeys</h3>
                  {trips.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSaved(t)
                        setStep('saved')
                        setError('')
                      }}
                    >
                      <span>
                        {t.name}
                        <small>
                          {tripDate(t.settings.date)} · {t.plan.dayCount} days
                        </small>
                      </span>
                      <span>Open ↗</span>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          {step === 'review' && context && (
            <>
              <div className="trip-section-heading">
                <div>
                  <h2>Review hours & visit times</h2>
                  <p>
                    Review visit lengths and opening hours before we arrange
                    your days.
                  </p>
                </div>
              </div>
              <div className="trip-settings">
                <label>
                  Start date
                  <input
                    type="date"
                    value={settings.date}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, date: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Getting around
                  <select
                    value={settings.mode}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        mode: e.target.value as TripSettings['mode'],
                      }))
                    }
                  >
                    <option value="Car">Driving</option>
                    <option value="Pedestrian">Walking</option>
                  </select>
                </label>
                <label>
                  Start each day
                  <input
                    type="time"
                    min="06:00"
                    max="23:00"
                    value={settings.start}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, start: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Finish each day
                  <input
                    type="time"
                    min="06:00"
                    max="23:00"
                    value={settings.end}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, end: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Days available
                  <select
                    value={settings.days}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, days: +e.target.value }))
                    }
                  >
                    <option value={0}>Recommend for me (up to 7 days)</option>
                    {Array.from({ length: 7 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Up to {i + 1} days
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Visit order
                  <select
                    value={settings.order}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        order: e.target.value as TripSettings['order'],
                      }))
                    }
                  >
                    <option value="recommended">
                      Recommend a practical order
                    </option>
                    <option value="manual">Keep my order</option>
                  </select>
                </label>
              </div>
              <p className="trip-muted">
                {context.zone.replaceAll('_', ' ')} · Lunch 12:00–13:00 · 10
                minutes between stops. Estimated visit lengths are editable, not
                verified venue recommendations.
              </p>
              <div className="trip-review-list">
                {settings.stops.map((stop, index) => {
                  const p = context.places.find((p) => p.id === stop.id)!
                  return (
                    <article key={p.id} className="trip-review-place">
                      <div className="trip-review-top">
                        <span className="trip-order">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3>{p.name}</h3>
                          <p>{p.address}</p>
                        </div>
                        <label>
                          Visit length
                          <select
                            aria-label={`Visit length for ${p.name}`}
                            aria-describedby={`trip-duration-hint-${p.id}`}
                            value={stop.duration}
                            onChange={(e) =>
                              changeStop(p.id, { duration: +e.target.value })
                            }
                          >
                            {[
                              15,
                              30,
                              45,
                              60,
                              90,
                              120,
                              150,
                              180,
                              240,
                              300,
                              360,
                              420,
                              480,
                              540,
                              600,
                              ...(![
                                15, 30, 45, 60, 90, 120, 150, 180, 240, 300,
                                360, 420, 480, 540, 600,
                              ].includes(stop.duration)
                                ? [stop.duration]
                                : []),
                            ].map((n) => (
                              <option key={n} value={n}>
                                {n < 60 ? `${n} min` : `${n / 60} hours`}
                              </option>
                            ))}
                          </select>
                          <small
                            id={`trip-duration-hint-${p.id}`}
                            className="trip-duration-hint"
                            data-suggested={
                              stop.duration === p.suggestedDuration
                            }
                          >
                            {stop.duration === p.suggestedDuration
                              ? 'Suggested by place type'
                              : 'Custom duration'}
                          </small>
                        </label>
                      </div>
                      <div className="trip-hours">
                        <strong
                          className={
                            p.hours.status === 'available' ? '' : 'needs-check'
                          }
                        >
                          {p.hours.status === 'available'
                            ? 'Listed opening hours'
                            : 'Hours unverified'}
                        </strong>
                        {p.hours.display.map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                        {p.hours.status !== 'available' && (
                          <p>
                            We won’t assume this place is open. Enter confirmed
                            hours below or remove it.
                          </p>
                        )}
                      </div>
                      <details
                        open={p.hours.status !== 'available' || !!stop.manual}
                      >
                        <summary>
                          {stop.manual
                            ? 'Your confirmed hours'
                            : 'Enter or correct opening hours'}
                        </summary>
                        <label className="trip-check">
                          <input
                            type="checkbox"
                            checked={!!stop.manual}
                            onChange={(e) =>
                              changeStop(p.id, {
                                manual: e.target.checked
                                  ? {
                                      open: '09:00',
                                      close: '18:00',
                                      days: [0, 1, 2, 3, 4, 5, 6],
                                    }
                                  : undefined,
                              })
                            }
                          />
                          Use hours I have checked
                        </label>
                        {stop.manual && (
                          <div className="trip-manual">
                            <label>
                              Opens
                              <input
                                type="time"
                                value={stop.manual.open}
                                onChange={(e) =>
                                  changeStop(p.id, {
                                    manual: {
                                      ...stop.manual!,
                                      open: e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                            <label>
                              Closes
                              <input
                                type="time"
                                value={stop.manual.close}
                                onChange={(e) =>
                                  changeStop(p.id, {
                                    manual: {
                                      ...stop.manual!,
                                      close: e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                            <div
                              className="trip-weekdays"
                              aria-label={`Open days for ${p.name}`}
                            >
                              {[
                                'Sun',
                                'Mon',
                                'Tue',
                                'Wed',
                                'Thu',
                                'Fri',
                                'Sat',
                              ].map((d, i) => (
                                <label key={d}>
                                  <input
                                    type="checkbox"
                                    checked={stop.manual!.days.includes(i)}
                                    onChange={(e) =>
                                      changeStop(p.id, {
                                        manual: {
                                          ...stop.manual!,
                                          days: e.target.checked
                                            ? [...stop.manual!.days, i]
                                            : stop.manual!.days.filter(
                                                (n) => n !== i,
                                              ),
                                        },
                                      })
                                    }
                                  />
                                  {d}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </details>
                      <div className="trip-place-actions">
                        <button
                          disabled={index === 0}
                          aria-label={`Move ${p.name} earlier`}
                          onClick={() => move(index, -1)}
                        >
                          Move earlier
                        </button>
                        <button
                          disabled={index === settings.stops.length - 1}
                          aria-label={`Move ${p.name} later`}
                          onClick={() => move(index, 1)}
                        >
                          Move later
                        </button>
                        <button
                          onClick={() => {
                            setSelected((ids) =>
                              ids.filter((id) => id !== p.id),
                            )
                            setSettings((s) => ({
                              ...s,
                              stops: s.stops.filter((x) => x.id !== p.id),
                            }))
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              <p className="trip-footnote">
                Listed weekly hours are supplied by Amazon Location. Holiday
                changes, temporary closures, ticket availability and last
                admission are not guaranteed. Confirm these with the venue.
                Manual hours apply to the weekdays you select.
              </p>
            </>
          )}
          {(step === 'result' || step === 'saved') && current && (
            <>
              <TripSchedule
                plan={current.plan}
                zone={current.zone}
                checkedAt={current.checkedAt}
              />
              {step === 'result' && (
                <label className="trip-name">
                  Journey name
                  <input
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {step === 'saved' && saved && (
                <section className="trip-sharing">
                  <h3>Share this trip</h3>
                  <p>
                    A read-only journey for anyone with the link. Personal
                    notes and account details stay private.
                  </p>
                  {saved.share ? (
                    <>
                      <label>
                        Sharing link
                        <input
                          readOnly
                          value={`${location.origin}/#trip=${saved.share.token}`}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <div className="trip-share-actions">
                        <button
                          className="primary"
                          onClick={() =>
                            void run('Copying…', async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  `${location.origin}/#trip=${saved.share!.token}`,
                                )
                                setMessage('Link copied.')
                              } catch {
                                setMessage(
                                  'Select the link above and copy it manually.',
                                )
                              }
                            })
                          }
                        >
                          Copy link
                        </button>
                        <button onClick={() => setConfirmation('stop')}>
                          Stop sharing
                        </button>
                      </div>
                      <p className="trip-muted">
                        Expires{' '}
                        {new Date(
                          saved.share.expiresAt * 1000,
                        ).toLocaleDateString('en-US')}
                        .
                      </p>
                    </>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => void sharing('POST')}
                    >
                      Create sharing link
                    </button>
                  )}
                  <p className="trip-muted">
                    This is a saved snapshot. Changes to saved places do not
                    update the journey automatically; edit it to refresh hours
                    and locations.
                  </p>
                  <button
                    className="trip-delete"
                    onClick={() => setConfirmation('delete')}
                  >
                    Delete journey
                  </button>
                </section>
              )}
            </>
          )}
          {confirmation && (
            <div
              className="trip-confirm"
              role="group"
              aria-label="Confirm action"
            >
              <h3>
                {confirmation === 'delete'
                  ? 'Delete this journey?'
                  : 'Stop sharing this journey?'}
              </h3>
              <p>
                {confirmation === 'delete'
                  ? 'Its sharing link will also stop working. Your saved places will be kept.'
                  : 'Anyone with the link will no longer be able to open it.'}
              </p>
              <button onClick={() => setConfirmation(null)} disabled={!!busy}>
                No, keep it
              </button>
              <button
                className="delete-confirm"
                disabled={!!busy}
                onClick={() =>
                  confirmation === 'stop'
                    ? void sharing('DELETE')
                    : void run('Deleting journey…', async () => {
                        await tripAPI(`/itineraries/${saved!.id}`, 'DELETE', {
                          version: saved!.version,
                        })
                        if (!alive.current) return
                        setTrips((t) => t.filter((x) => x.id !== saved!.id))
                        setSaved(null)
                        setConfirmation(null)
                        setStep('select')
                        saveId.current = crypto.randomUUID()
                      })
                }
              >
                Yes, {confirmation === 'delete' ? 'delete' : 'stop sharing'}
              </button>
            </div>
          )}
        </div>
        <footer className="trip-footer">
          <div aria-live="polite">
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : (
              <p>
                {busy ||
                  message ||
                  (step === 'select'
                    ? `${selected.length} of 20 places selected`
                    : step === 'review'
                      ? 'Known opening hours are respected. Unverified hours are marked in your plan.'
                      : 'Review your plan before heading out.')}
              </p>
            )}
          </div>
          <div className="trip-footer-actions">
            {step === 'select' ? (
              <button
                className="primary"
                disabled={!!busy || selected.length < 3 || selected.length > 20}
                onClick={() => void prepare()}
              >
                Review hours & time
              </button>
            ) : step === 'review' ? (
              <>
                <button disabled={!!busy} onClick={() => setStep('select')}>
                  Back
                </button>
                <button
                  className="primary"
                  disabled={!!busy || settings.stops.length < 3}
                  onClick={() => void generate()}
                >
                  Create journey
                </button>
              </>
            ) : step === 'result' ? (
              <>
                <button disabled={!!busy} onClick={() => setStep('review')}>
                  Adjust plan
                </button>
                <button
                  className="primary"
                  disabled={!!busy || !preview?.plan.complete || !name.trim()}
                  onClick={() => void save()}
                >
                  Save journey
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={!!busy}
                  onClick={() => {
                    setSaved(null)
                    setContext(null)
                    setPreview(null)
                    setSettings(defaultSettings())
                    saveId.current = crypto.randomUUID()
                    setStep('select')
                  }}
                >
                  All journeys
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => startEdit(saved!)}
                >
                  Edit journey
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
