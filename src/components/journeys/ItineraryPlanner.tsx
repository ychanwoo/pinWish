import { TripVisitReview } from './TripVisitReview'
import { LoadingOverlay } from '../shared/LoadingOverlay'
import { tripDate, type TripSettings } from '../../lib/itineraries'
import { TripSchedule } from './TripSchedule'
import {
  useItineraryPlanner,
  type ItineraryPlannerProps,
} from './useItineraryPlanner'
export function ItineraryPlanner(props: ItineraryPlannerProps) {
  const { collection, places, onClose } = props
  const {
    removeStop,
    run,
    busy,
    changeStop,
    close,
    confirmation,
    context,
    current,
    error,
    generate,
    heading,
    loadingTrips,
    message,
    move,
    name,
    prepare,
    preview,
    root,
    save,
    saved,
    selected,
    setConfirmation,
    setError,
    setMessage,
    setName,
    setSaved,
    setSelected,
    setSettings,
    setStep,
    settings,
    sharing,
    startEdit,
    step,
    trips,
    deleteJourney,
    resetJourney,
  } = useItineraryPlanner({ collection, places, onClose })
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
                    <option value={0}>Recommend for me</option>
                    {Array.from({ length: 7 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Prefer {i + 1} days
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
                    <TripVisitReview
                      key={p.id}
                      p={p}
                      stop={stop}
                      index={index}
                      stopCount={settings.stops.length}
                      changeStop={changeStop}
                      move={move}
                      onRemove={removeStop}
                    />
                  )
                })}
              </div>
              <p className="trip-footnote">
                Listed weekly hours are supplied by Amazon Location. Holiday
                changes, temporary closures, ticket availability and last
                admission are not guaranteed. Confirm these with the venue.
                Manual hours apply to the weekdays you select. Dates may be
                extended to include every place. Visits that cannot fit verified
                hours remain as clearly marked suggested times.
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
                    A read-only journey for anyone with the link. Personal notes
                    and account details stay private.
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
                    : void deleteJourney()
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
                <button disabled={!!busy} onClick={resetJourney}>
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
