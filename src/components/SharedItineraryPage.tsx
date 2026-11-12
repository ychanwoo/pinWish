import { useEffect, useState } from 'react'
import { cloudConfig } from '../lib/cloud-auth'
import type { SavedTrip } from '../lib/itineraries'
import { TripSchedule } from './TripSchedule'
export default function SharedItineraryPage({ token }: { token: string }) {
  const [trip, setTrip] = useState<Pick<
      SavedTrip,
      'name' | 'plan' | 'zone' | 'checkedAt'
    > | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let generation = 0
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow,noarchive'
    document.head.append(meta)
    async function load() {
      const current = ++generation
      try {
        if (!/^[a-f0-9]{64}$/.test(token))
          throw Error('This journey link is unavailable.')
        const r = await fetch(`${cloudConfig.apiUrl}/trip-shares/${token}`, {
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        })
        if (!r.ok)
          throw Error(
            r.status === 404
              ? 'This link has expired, sharing has stopped, or the journey was deleted.'
              : 'This journey is temporarily unavailable. The test session may be paused.',
          )
        const data = await r.json()
        if (!controller.signal.aborted && current === generation) {
          setTrip(data)
          setError('')
        }
      } catch (e) {
        if (!controller.signal.aborted && current === generation) {
          setTrip(null)
          setError(e instanceof Error ? e.message : 'Unable to load journey.')
        }
      }
    }
    void load()
    const onFocus = () => {
      void load()
    }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60000)
    return () => {
      controller.abort()
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      meta.remove()
    }
  }, [token, retry])
  return (
    <div className="trip-public">
      <header>
        <a href="/">pinWish</a>
        <span>Shared journey · Read only</span>
      </header>
      <main>
        {error ? (
          <div className="trip-public-empty">
            <h1>Journey unavailable</h1>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : trip ? (
          <>
            <div className="trip-public-title">
              <h1>{trip.name}</h1>
            </div>
            <TripSchedule
              plan={trip.plan}
              zone={trip.zone}
              checkedAt={trip.checkedAt}
            />
          </>
        ) : (
          <p role="status">Loading journey…</p>
        )}
      </main>
    </div>
  )
}
