import { sortPlaces } from '../lib/place-presentation'
import { useState } from 'react'
import type { Category, Place } from '../data/places'
import { asset, inCollection, filterPlaces } from '../data/places'
import { Icon } from './Icon'
interface Props {
  loading?: boolean
  loadError?: string
  persistent?: boolean
  onManageCollection?: () => void
  places: Place[]
  collections: string[]
  category: Category | 'All'
  onCategory: (value: Category | 'All') => void
  onlyUnvisited: boolean
  onUnvisited: (value: boolean) => void
  selected: string
  search: string
  onSearch: (value: string) => void
  collection: string
  onCollection: (value: string) => void
  onSelect: (place: Place) => void
  onSave: () => void
  onBookmark: (place: Place) => void
  onShare: (place: Place) => void
  onDirections: (place: Place) => void
  onNewCollection: () => void
}
export function PlaceList({
  loading = false,
  loadError = '',
  persistent = false,
  onManageCollection,
  places,
  collections,
  category,
  onCategory: setCategory,
  onlyUnvisited,
  onUnvisited: setOnlyUnvisited,
  selected,
  search,
  onSearch,
  collection,
  onCollection,
  onSelect,
  onSave,
  onBookmark,
  onShare,
  onDirections,
  onNewCollection,
}: Props) {
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const hasFilters =
    Boolean(search.trim()) || category !== 'All' || onlyUnvisited
  const filtered = filterPlaces(
    places,
    collection,
    category,
    onlyUnvisited,
    search,
  )
  const visible = sortPlaces(filtered, sort, persistent)
  const categories: (Category | 'All')[] = [
    'All',
    'Coffee',
    'Food',
    'Culture',
    ...(places.some(
      (p) => inCollection(p, collection) && p.category === 'Other',
    )
      ? ['Other' as const]
      : []),
  ]
  return (
    <section className="places-panel" aria-label="Saved places">
      <div className="list-toolbar">
        <div className="search-input">
          <Icon name="860c6" />
          <input
            aria-label="Search places"
            placeholder={
              !persistent && window.matchMedia('(min-width: 768px)').matches
                ? 'Search places in LA...'
                : 'Search saved places...'
            }
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <button
            className={`filter-button ${onlyUnvisited ? 'active' : ''}`}
            aria-label="Show unvisited places only"
            aria-pressed={onlyUnvisited}
            onClick={() => setOnlyUnvisited(!onlyUnvisited)}
          >
            <Icon name="cebd9" />
          </button>
        </div>
        <div className="mobile-collections">
          <div className="collection-chips">
            {!persistent && (
              <>
                <button
                  className={collection === 'LA weekend' ? 'active' : ''}
                  onClick={() => onCollection('LA weekend')}
                >
                  <Icon name="c3cc4" />
                  LA weekend
                  {collection === 'LA weekend' && <Icon name="9d316" />}
                </button>
                <button
                  className={
                    !persistent && collection === 'Coffee' ? 'active' : ''
                  }
                  onClick={() => onCollection('Coffee')}
                >
                  Coffee
                </button>
                <button
                  className={collection === 'Galleries' ? 'active' : ''}
                  onClick={() => onCollection('Galleries')}
                >
                  Galleries
                </button>
              </>
            )}
            {collections
              .filter((c) => persistent || c !== 'LA weekend')
              .map((c) => (
                <button
                  key={c}
                  className={collection === c ? 'active' : ''}
                  onClick={() => onCollection(c)}
                >
                  {c}
                </button>
              ))}
          </div>
          <button
            className="add-collection"
            aria-label="Create collection"
            onClick={onNewCollection}
          >
            <Icon name="fe01d" />
          </button>
        </div>
        <div className="desktop-list-heading">
          <div>
            <Icon name="75e71" />
            <h1>
              {!persistent && collection === 'Coffee'
                ? 'Coffee & Roasters'
                : !persistent && collection === 'Galleries'
                  ? 'Architecture Walks'
                  : collection}
            </h1>
          </div>
          <span className="count">{filtered.length} places</span>
        </div>
        {onManageCollection && (
          <button className="collection-manage" onClick={onManageCollection}>
            Manage collection
          </button>
        )}
        {!persistent && (
          <div className="category-tabs">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? 'active' : ''}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item} (
                {
                  places.filter(
                    (p) =>
                      inCollection(p, collection) &&
                      (item === 'All' || p.category === item),
                  ).length
                }
                )
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mobile-save">
        <button className="primary" onClick={onSave}>
          Save a place
        </button>
      </div>
      <div className="feed-heading">
        <div>
          {persistent ? collection : 'Saved in Los Angeles'}{' '}
          <span className="count">{filtered.length} places</span>
        </div>
        <select
          aria-label="Sort places"
          value={sort}
          onChange={(e) => setSort(e.target.value as 'recent' | 'name')}
        >
          <option value="recent">Recently added</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="place-cards" aria-busy={loading}>
        {visible.map((place) => (
          <article
            key={place.id}
            className={`place-card ${selected === place.id ? 'selected' : ''}`}
          >
            <div className="place-card-top">
              <button
                className="place-photo"
                onClick={() => onSelect(place)}
                aria-label={`View ${place.name}`}
              >
                <img src={asset(place.photo)} alt={place.name} />
              </button>
              <button
                className="place-card-title"
                onClick={() => onSelect(place)}
              >
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
                className={`desktop-visited ${place.visited ? 'is-visited' : 'warm'}`}
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
                aria-label={`${persistent ? 'Copy private link to' : 'Share'} ${place.name}`}
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
        ))}
        {!visible.length && loading && (
          <p className="list-feedback" role="status">
            Loading your places…
          </p>
        )}
        {!visible.length && !loading && loadError && (
          <p className="list-feedback">
            Your places could not be loaded. Use Refresh places to try again.
          </p>
        )}
        {!visible.length && !loading && !loadError && (
          <div className="no-results">
            <h2>{hasFilters ? 'No matching places' : 'No places here yet'}</h2>
            <p>
              {hasFilters
                ? 'Try another place name or clear your filters.'
                : 'Save somewhere worth going.'}
            </p>
            {hasFilters && (
              <button
                className="secondary"
                onClick={() => {
                  onSearch('')
                  setCategory('All')
                  setOnlyUnvisited(false)
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="list-footer">
        <span>Saved to {collection}</span>
      </footer>
    </section>
  )
}
