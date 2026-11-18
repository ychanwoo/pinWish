import type { Place } from '../../data/places'

interface Props {
  places: Place[]
  showCollections: boolean
  onView: (place: Place) => void
  onRecover?: () => void
  onDone: () => void
}

export function ImportedPostSummary({ places, showCollections, onView, onRecover, onDone }: Props) {
  return (
    <div className="save-form">
      <div className="save-body">
        <p className="saved-post-caption">
          {places.length} {places.length === 1 ? 'place' : 'places'} already saved from this post.
        </p>
        <ul className="import-history" aria-label="Places from this post">
          {places.map(place => (
            <li key={place.id}>
              <button type="button" onClick={() => onView(place)}>
                <span>{place.name}</span>
                {showCollections && <small>{place.collection}</small>}
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m6.5 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <footer className="save-footer">
        {onRecover && <button className="secondary" onClick={onRecover}>Check for missing places</button>}
        <button className="primary" onClick={onDone}>Done</button>
      </footer>
    </div>
  )
}
