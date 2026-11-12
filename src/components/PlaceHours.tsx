import { useEffect, useState } from 'react'
import { listedHoursStatus, type PlaceDetails } from '../lib/map-appearance'
export function PlaceHours({
  data,
  error,
  onRefresh,
}: {
  data?: PlaceDetails
  error?: string
  onRefresh: () => Promise<void>
}) {
  const [now, setNow] = useState(() => new Date()),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="place-hours-detail">
      {data ? (
        <>
          <span className="place-hours-status">
            {listedHoursStatus(data, now)}
          </span>
          {data.hours.display.length > 0 && (
            <details>
              <summary>Weekly hours</summary>
              {data.hours.display.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </details>
          )}
          <small>
            {data.zone ? `${data.zone.replaceAll('_', ' ')} · ` : ''}Updated{' '}
            {new Date(data.checkedAt).toLocaleDateString('en-US')}
          </small>
          <small>Holiday hours and last admission may differ.</small>
        </>
      ) : (
        <span>{error ? 'Hours unavailable' : 'Loading hours…'}</span>
      )}
      {error && <small role="alert">{error}</small>}
      {(error ||
        data?.stale ||
        (data && now.getTime() - Date.parse(data.checkedAt) >= 86400000)) && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onRefresh()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Checking…' : 'Retry hours'}
        </button>
      )}
    </div>
  )
}
