import { useEffect, useRef, useState } from 'react'
import type { InstagramPreview } from '../../lib/instagram-preview'
import type { InstagramSource } from '../../lib/instagram'
import { resolveCandidate, type AutoReviews } from '../../lib/automatic-places'
import { visiblePlaceText } from '../../lib/place-name'
interface Props {
  preview: InstagramPreview
  source: InstagramSource
  value: AutoReviews
  onChange: (value: AutoReviews) => void
  onBusy: (busy: boolean) => void
  onComplete: (value: AutoReviews) => void
  saving: boolean
  saved: boolean
}
export function AutomaticPlaces(props: Props) {
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  }, [props])
  const [attempt, setAttempt] = useState(0)
  const [running, setRunning] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    async function run() {
      // Let StrictMode cleanup cancel the first mount before any paid requests.
      await Promise.resolve()
      if (controller.signal.aborted) return
      latest.current.onBusy(true)
      const reviews = { ...latest.current.value }
      try {
        // Serial requests keep the local AWS request budget and concurrency bounded.
        for (const [
          index,
          candidate,
        ] of latest.current.preview.result.places.entries()) {
          if (controller.signal.aborted) return
          if (reviews[index]?.targets.every((t) => t.status === 'confirmed'))
            continue
          reviews[index] = await resolveCandidate(
            candidate,
            latest.current.source,
            controller.signal,
          )
          if (controller.signal.aborted) return
          latest.current.onChange({ ...reviews })
        }
        if (!controller.signal.aborted)
          latest.current.onComplete({ ...reviews })
      } finally {
        if (!controller.signal.aborted) {
          setRunning(false)
          latest.current.onBusy(false)
        }
      }
    }
    void run().catch(() => {
      /* Cancellation on close/replacement never commits stale results. */
    })
    return () => controller.abort()
  }, [attempt])
  const matched = Object.values(props.value).filter((r) =>
    r.targets.some((t) => t.status === 'confirmed'),
  ).length
  const failed = Object.values(props.value).filter((r) =>
    r.targets.some((t) => t.autoError),
  ).length
  return (
    <section
      aria-label="Extracted place candidates"
      className="import-candidates automatic-places"
    >
      <p>
        {props.preview.fetchedImages} photos analyzed · {matched} locations
        found{failed ? ` · ${failed} not found` : ''}
      </p>
      <p className="field-help" role="status">
        {running
          ? 'Finding locations automatically…'
          : props.saved
            ? 'Located places have been added to your map.'
            : 'Locations matched automatically using Amazon Location.'}
      </p>
      {!props.preview.result.places.length && (
        <p>
          No readable place names were extracted. Check the original post or try
          another link.
        </p>
      )}
      <ol>
        {props.preview.result.places.map((candidate, index) => {
          const target = props.value[index]?.targets[0]
          const place = target?.confirmed
          const name =
            place?.displayName ||
            target?.displayQuery ||
            visiblePlaceText(candidate.name, '', `Place ${index + 1}`)
          return (
            <li key={index} aria-label={`Place candidate ${index + 1}`}>
              <strong>{name}</strong>
              {place ? (
                <p>{place.address}</p>
              ) : (
                <p>{target?.autoError || 'Finding location…'}</p>
              )}
              <small>
                Photos {candidate.slides.join(', ')}
                {place ? ' · Matched automatically' : ''}
              </small>
              <p>
                <a
                  href={`${props.source.canonicalUrl}?img_index=${candidate.slides[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View original photo <span aria-hidden="true">↗</span>
                </a>
              </p>
            </li>
          )
        })}
      </ol>
      {!!failed && !running && (
        <button
          type="button"
          className="retry-missing-button"
          disabled={props.saving}
          onClick={() => {
            setRunning(true)
            setAttempt((n) => n + 1)
          }}
        >
          Retry missing places
        </button>
      )}
    </section>
  )
}
