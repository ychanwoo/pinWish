import type { Place } from '../../data/places'
import { asset } from '../../data/places'
import { Icon } from '../shared/Icon'
interface PlaceCardProps {
  place: Place
  selected: boolean
  persistent: boolean
  onSelect: (place: Place) => void
  onBookmark: (place: Place) => void
  onShare: (place: Place) => void
  onDirections: (place: Place) => void
}
export function PlaceCard({
  place,
  selected,
  persistent,
  onSelect,
  onBookmark,
  onShare,
  onDirections,
}: PlaceCardProps) {
  return (
    <article className={`place-card ${selected ? 'selected' : ''}`}>
      <div className="place-card-top">
        <button
          className="place-photo"
          onClick={() => onSelect(place)}
          aria-label={`View ${place.name}`}
        >
          <img src={asset(place.photo)} alt={place.name} />
        </button>
        <button className="place-card-title" onClick={() => onSelect(place)}>
          <h2>{place.name}</h2>
          <p className="mobile-description">
            {place.kind} • {place.district}
          </p>
          <p className="desktop-description">
            {place.district} ·{' '}
            {place.id === 'gjusta'
              ? 'Bakery & Cafe'
              : place.id === 'hauser'
                ? 'Gallery & Garden'
                : place.kind}
          </p>
          <span
            className={`place-badge ${place.badge === 'Visited' ? 'is-visited' : place.badge === 'Must try' ? 'warm' : ''}`}
          >
            {place.badge === 'Visited' && <Icon name="6c92f" />}
            {place.badge}
          </span>
        </button>
        <button
          className={`bookmark ${!place.bookmarked ? 'unsaved' : ''}`}
          aria-label={`${place.bookmarked ? 'Unbookmark' : 'Bookmark'} ${place.name}`}
          aria-pressed={place.bookmarked}
          onClick={() => onBookmark(place)}
        >
          <Icon name="faf82" />
        </button>
        <span
          className={`desktop-visited ${place.visited ? 'is-visited' : persistent ? 'is-unvisited' : 'warm'}`}
        >
          {place.visited ? 'Visited' : 'Unvisited'}
        </span>
      </div>
      {place.note && (
        <div className="place-card-note">
          <Icon name={place.badge === 'Visited' ? '0f8a0' : 'df9c6'} />
          <p className="mobile-note">“{place.note}”</p>
          <p className="desktop-note">{place.note}</p>
        </div>
      )}
      <div className="place-card-actions">
        <button
          aria-label={`Directions to ${place.name}`}
          title="Opens Google Maps in a new tab"
          onClick={() => onDirections(place)}
        >
          <Icon name="ec9f3" />
        </button>
        <button
          aria-label={`${persistent ? 'Copy Link to' : 'Share'} ${place.name}`}
          title={
            persistent
              ? 'Only your account can open this saved place'
              : undefined
          }
          onClick={() => onShare(place)}
        >
          <Icon name="7088b" />
        </button>
      </div>
    </article>
  )
}
