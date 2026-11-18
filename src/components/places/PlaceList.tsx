import { PlaceCard } from './PlaceCard'
import { sortPlaces } from '../../lib/place-presentation'
import { useMemo, useState } from 'react'
import type { Category, Place } from '../../data/places'
import { inCollection, filterPlaces } from '../../data/places'
import { Icon } from '../shared/Icon'
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
  const filtered = useMemo(
    () => filterPlaces(places, collection, category, onlyUnvisited, search),
    [places, collection, category, onlyUnvisited, search],
  )
  const visible = useMemo(
    () => sortPlaces(filtered, sort, persistent),
    [filtered, sort, persistent],
  )
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
          <span className="count">{filtered.length} {filtered.length === 1 ? 'place' : 'places'}</span>
        </div>
        <div className="collection-tools">
          <select
            className="mobile-only collection-picker"
            aria-label="Active collection"
            value={collection}
            onChange={(event) => onCollection(event.target.value)}
          >
            {[...new Set([...(persistent ? [] : ['LA weekend', 'Coffee', 'Galleries']), ...collections, collection])].map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {onManageCollection && (
            <button className="collection-manage" onClick={onManageCollection}>
              Manage collection
            </button>
          )}
          <button className="collection-manage mobile-only" aria-label="Create collection" onClick={onNewCollection}>
            New collection
          </button>
        </div>
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
        <button type="button" className="save-place-trigger" onClick={onSave}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Save a place
        </button>
      </div>
      <div className="feed-heading">
        <div>
          {persistent ? collection : 'Saved in Los Angeles'}{' '}
          <span className="count">{filtered.length} {filtered.length === 1 ? 'place' : 'places'}</span>
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
          <PlaceCard
            key={place.id}
            place={place}
            selected={selected === place.id}
            persistent={persistent}
            onSelect={onSelect}
            onBookmark={onBookmark}
            onShare={onShare}
            onDirections={onDirections}
          />
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
