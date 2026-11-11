import { CollectionRow } from './CollectionRow'
import { Brand, Icon } from './Icon'
import { inCollection, type Place, type View } from '../data/places'
interface Props {
  onCollectionAction?: (name: string, action: 'rename' | 'delete' | 'share') => void
  canManageCollection?: (name: string) => boolean
  persistent?: boolean
  sidebarOpen: boolean
  onSidebarOpen: (open: boolean) => void
  onAccount?: () => void
  places: Place[]
  collections: string[]
  onNewCollection: () => void
  view: View
  onView: (view: View) => void
  search: string
  onSearch: (value: string) => void
  collection: string
  onCollection: (value: string) => void
  onSave: () => void
  onNotice: (value: string) => void
}
export function DesktopNavigation({
  persistent = false,
  onCollectionAction,
  canManageCollection,
  sidebarOpen,
  onSidebarOpen,
  places,
  collections,
  onNewCollection,
  view,
  onView,
  search,
  onSearch,
  collection,
  onCollection,
  onSave,
  onNotice,
  onAccount,
}: Props) {
  return (
    <>
      <nav className="desktop-rail" aria-label="Main navigation">
        <div>
          <button
            className="rail-button"
            aria-label={sidebarOpen ? 'Hide collections' : 'Show collections'}
            aria-expanded={sidebarOpen}
            aria-controls="collection-sidebar"
            onClick={() => onSidebarOpen(!sidebarOpen)}
          >
            <Icon name="d9b45" />
          </button>
          <div className="rail-links">
            <button
              className={`rail-button ${view === 'map' ? 'active' : ''}`}
              aria-label="Explore map"
              onClick={() => onView('map')}
            >
              <Icon name="b5692" />
            </button>
            <button
              className={`rail-button ${view !== 'map' ? 'active' : ''}`}
              aria-label="Your places"
              onClick={() => onView('list')}
            >
              <Icon name="171cf" />
            </button>
            <button
              className="rail-button"
              aria-label="Search places"
              onClick={() => {
                onSidebarOpen(true)
                requestAnimationFrame(() =>
                  document.getElementById('sidebar-search')?.focus(),
                )
              }}
            >
              <Icon name="03a25" />
            </button>
            {!persistent && (
              <>
                <button
                  className="rail-button"
                  aria-label="Settings"
                  onClick={() =>
                    onNotice(
                      'This UI preview uses sample places. Account settings will be available after authentication is connected.',
                    )
                  }
                >
                  <Icon name="d1469" />
                </button>
              </>
            )}
          </div>
        </div>
        <button
          className="avatar desktop-avatar"
          aria-label="Your profile"
          onClick={
            onAccount ??
            (() => onNotice('You’re viewing the PinWish demo profile.'))
          }
        >
          {onAccount ? 'Me' : 'YW'}
        </button>
      </nav>
      <aside
        id="collection-sidebar"
        className="collection-sidebar"
        hidden={!sidebarOpen}
      >
        <div className="sidebar-heading">
          <Brand />
          {persistent ? (
            <p className="sidebar-scope">Your saved places</p>
          ) : (
            <>
              <button
                className="city-select"
                onClick={() =>
                  onNotice('Los Angeles is the sample city for this preview.')
                }
              >
                {onAccount ? 'Saved places' : 'Los Angeles, CA'}
                <Icon name="9beee" />
              </button>
            </>
          )}
          <div className="search-input sidebar-search">
            <Icon name="489e6" />
            <input
              id="sidebar-search"
              aria-label="Search saved places or tags"
              placeholder={
                persistent
                  ? 'Search saved places...'
                  : 'Search saved places or tags...'
              }
              value={search}
              onChange={(e) => {
                onSearch(e.target.value)
                onView('list')
              }}
            />
          </div>
        </div>
        <div className="sidebar-collections">
          <p className="eyebrow" id="collections-heading" tabIndex={-1}>
            Active collection
          </p>
          {!persistent && view === 'empty' ? (
            <>
              <button
                className="collection-link active"
                onClick={() => onCollection('Weekend ideas')}
              >
                <Icon name="1aa6e" />
                <strong>Weekend ideas</strong>
                <span className="count">0</span>
              </button>
              <div className="empty-sidebar">
                <p>No places in this collection yet.</p>
                <button className="primary small" onClick={onSave}>
                  + Save a place
                </button>
              </div>
              <p className="eyebrow other-heading">Other collections</p>
            </>
          ) : null}
          {!persistent && (
            <>
              <button
                className={`collection-link ${view !== 'empty' && collection === 'LA weekend' ? 'active' : ''}`}
                onClick={() => {
                  onCollection('LA weekend')
                  onView('list')
                }}
              >
                <Icon name="3e06b" />
                <span>All Curated Pins</span>
                <span className="count">
                  {places.filter((p) => inCollection(p, 'LA weekend')).length}
                </span>
              </button>
              <button
                className={`collection-link ${collection === 'Coffee' ? 'active' : ''}`}
                onClick={() => {
                  onCollection('Coffee')
                  onView('list')
                }}
              >
                <Icon name="2623d" />
                <span>Coffee &amp; Roasters</span>
                <span className="count">
                  {places.filter((p) => inCollection(p, 'Coffee')).length}
                </span>
              </button>
              <button
                className={`collection-link ${collection === 'Galleries' ? 'active' : ''}`}
                onClick={() => {
                  onCollection('Galleries')
                  onView('list')
                }}
              >
                <Icon name="bd56e" />
                <span>Architecture Walks</span>
                <span className="count">
                  {places.filter((p) => inCollection(p, 'Galleries')).length}
                </span>
              </button>
            </>
          )}
          {collections
            .filter(
              (c) =>
                persistent ||
                (c !== 'LA weekend' &&
                  !(view === 'empty' && c === 'Weekend ideas')),
            )
            .map((c) =>
              persistent && onCollectionAction ? (
                <CollectionRow
                  key={c}
                  name={c}
                  count={places.filter((p) => p.collection === c).length}
                  active={collection === c}
                  editable={!!canManageCollection?.(c)}
                  onSelect={() => onCollection(c)}
                  onAction={(action) => onCollectionAction(c, action)}
                />
              ) : (
                <button
                  key={c}
                  className={`collection-link ${collection === c ? 'active' : ''}`}
                  onClick={() => onCollection(c)}
                >
                  <Icon name="3e06b" />
                  <span>{c}</span>
                  <span className="count">
                    {places.filter((p) => p.collection === c).length}
                  </span>
                </button>
              ),
            )}
          <button
            className="collection-link"
            onClick={onNewCollection}
            aria-label="Create collection"
          >
            <Icon name="fe01d" />
            <span>New collection</span>
          </button>
        </div>
      </aside>
    </>
  )
}
export function MobileHeader({
  view,
  onView,
  onNotice,
  onAccount,
}: Pick<Props, 'view' | 'onView' | 'onNotice' | 'onAccount'>) {
  return (
    <header className={`mobile-header ${view === 'map' ? 'map-header' : ''}`}>
      <Brand mobile map={view === 'map'} />
      <div className="view-switch" aria-label="View mode">
        <button
          className={view !== 'map' ? 'active' : ''}
          onClick={() => onView('list')}
          aria-pressed={view !== 'map'}
        >
          <Icon name={view !== 'map' ? '0e52d' : '6bdd0'} />
          List
        </button>
        <button
          className={view === 'map' ? 'active' : ''}
          onClick={() => onView('map')}
          aria-pressed={view === 'map'}
        >
          <Icon name={view === 'map' ? '771b4' : '5645d'} />
          Map
        </button>
      </div>
      <button
        className="avatar"
        aria-label="Your profile"
        onClick={
          onAccount ??
          (() => onNotice('You’re viewing the PinWish demo profile.'))
        }
      >
        {onAccount ? 'Me' : 'YW'}
      </button>
    </header>
  )
}
