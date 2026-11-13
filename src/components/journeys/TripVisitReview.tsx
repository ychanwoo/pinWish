import type { TripContext, TripSettings } from '../../lib/itineraries'
interface TripVisitReviewProps {
  p: TripContext['places'][number]
  stop: TripSettings['stops'][number]
  index: number
  stopCount: number
  changeStop: (
    id: string,
    update: Partial<TripSettings['stops'][number]>,
  ) => void
  move: (index: number, delta: number) => void
  onRemove: (id: string) => void
}
export function TripVisitReview({
  p,
  stop,
  index,
  stopCount,
  changeStop,
  move,
  onRemove,
}: TripVisitReviewProps) {
  return (
    <article className="trip-review-place">
      <div className="trip-review-top">
        <span className="trip-order">{String(index + 1).padStart(2, '0')}</span>
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
            onChange={(e) => changeStop(p.id, { duration: +e.target.value })}
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
                15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540,
                600,
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
            data-suggested={stop.duration === p.suggestedDuration}
          >
            {stop.duration === p.suggestedDuration
              ? 'Suggested by place type'
              : 'Custom duration'}
          </small>
        </label>
      </div>
      <div className="trip-hours">
        <strong className={p.hours.status === 'available' ? '' : 'needs-check'}>
          {p.hours.status === 'available'
            ? 'Listed opening hours'
            : 'Hours unverified'}
        </strong>
        {p.hours.display.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
        {p.hours.status !== 'available' && (
          <p>
            We won’t assume this place is open. Enter confirmed hours below or
            remove it.
          </p>
        )}
      </div>
      <details open={p.hours.status !== 'available' || !!stop.manual}>
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
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
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
                            : stop.manual!.days.filter((n) => n !== i),
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
          disabled={index === stopCount - 1}
          aria-label={`Move ${p.name} later`}
          onClick={() => move(index, 1)}
        >
          Move later
        </button>
        <button onClick={() => onRemove(p.id)}>Remove</button>
      </div>
    </article>
  )
}
