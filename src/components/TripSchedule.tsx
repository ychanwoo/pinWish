import { tripDate, tripTime, type TripPlan } from '../lib/itineraries'
export function TripSchedule({
  plan,
  zone,
  checkedAt,
}: {
  plan: TripPlan
  zone: string
  checkedAt: string
}) {
  return (
    <div className="trip-schedule">
      <div className="trip-result-heading">
        <div>
          <h2>Day by day</h2>
          <p className="trip-result-summary">
            {plan.days.reduce((n, day) => n + day.stops.length, 0)} places
            planned
            {plan.unscheduled.length > 0
              ? ` · ${plan.unscheduled.length} need a time adjustment`
              : ''}
          </p>
        </div>
        <strong>
          {plan.dayCount} {plan.dayCount === 1 ? 'day' : 'days'} · {plan.nights}{' '}
          {plan.nights === 1 ? 'night' : 'nights'}
        </strong>
      </div>
      <p className="trip-muted">
        Local times · {zone.replaceAll('_', ' ')}. Opening hours checked{' '}
        {new Date(checkedAt).toLocaleDateString('en-US')}.
      </p>
      {plan.unscheduled.length > 0 && (
        <section className="trip-unplaced" aria-label="Places not scheduled">
          <h3>Adjust these visits</h3>
          {plan.unscheduled.map((p) => (
            <p key={p.id}>
              <strong>{p.name}</strong>
              <span>{p.reason}</span>
            </p>
          ))}
        </section>
      )}
      {plan.days.map((day, index) => (
        <section className="trip-day" key={day.date}>
          <header>
            <span className="trip-day-number">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h3>{tripDate(day.date)}</h3>
              <p>
                {day.stops.length} {day.stops.length === 1 ? 'place' : 'places'}{' '}
                ·{' '}
                {Math.round(
                  (day.stops.reduce((n, s) => n + s.duration + s.travel, 0) /
                    60) *
                    10,
                ) / 10}{' '}
                hours visiting & traveling
              </p>
            </div>
          </header>
          {!day.stops.length && (
            <p className="trip-muted">
              Free day — selected places do not fit the available opening
              windows.
            </p>
          )}
          <ol>
            {day.stops.map((stop, i) => (
              <li key={stop.id}>
                <div className="trip-clock">
                  <time>{tripTime(stop.arrival)}</time>
                  <span>{tripTime(stop.departure)}</span>
                </div>
                <div className="trip-stop-detail">
                  {(i > 0 || stop.travel > 0) && (
                    <p className="trip-connection">
                      {stop.travel} min travel estimate · 10 min arrival buffer
                      {stop.wait > 0
                        ? ` · ${stop.wait} min for waiting / lunch`
                        : ''}
                    </p>
                  )}
                  <h4>{stop.name}</h4>
                  <p>{stop.address}</p>
                  <div className="trip-stop-meta">
                    <span>{stop.duration} min visit</span>
                    <span>
                      {stop.hoursSource === 'manual'
                        ? 'Hours confirmed by you'
                        : stop.hoursSource === 'unknown'
                          ? 'Hours unverified · check before visiting'
                          : 'Within listed opening hours'}
                    </span>
                  </div>
                  <details>
                    <summary>Opening hours</summary>
                    {stop.hours.map((h, i) => (
                      <p key={i}>{h}</p>
                    ))}
                  </details>
                  <a
                    className="trip-directions"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.coordinates.latitude},${stop.coordinates.longitude}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View location ↗
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="trip-footnote">
        Travel estimates use the trip’s first departure time, with a 20%
        allowance. Traffic may change. The first day starts at its first place.
        Later days measure travel from the previous day’s last stop; hotel and
        airport transfers are not included. Lunch is reserved from 12:00–13:00.
        Listed hours may differ on holidays; tickets, reservations and last
        admission need a separate check.
      </p>
    </div>
  )
}
