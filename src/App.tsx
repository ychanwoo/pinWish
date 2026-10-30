import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initialPlaces,
  inCollection,
  matchesPlace,
  type Category,
  saveStates,
  type Place,
  type SaveState,
  type View,
} from './data/places'
import { DesktopNavigation, MobileHeader } from './components/Navigation'
import { PlaceList } from './components/PlaceList'
import { MapView } from './components/MapView'
import { PlaceDetail } from './components/PlaceDetail'
import { SavePlace, type SaveDraft } from './components/SavePlace'
import { ListState } from './components/ListState'
import { Icon } from './components/Icon'
import { useModalFocus } from './hooks/useModalFocus'
import './styles/app.css'
const params = new URLSearchParams(window.location.search)
const views: View[] = [
  'list',
  'map',
  'detail',
  'empty',
  'saved',
  'list_loading',
  'list_error',
]
const initialView = views.includes(params.get('view') as View)
  ? (params.get('view') as View)
  : 'list'
const initialSave = saveStates.includes(params.get('state') as SaveState)
  ? (params.get('state') as SaveState)
  : null
function App() {
  const [view, setView] = useState<View>(initialView)
  const [places, setPlaces] = useState(initialPlaces)
  const [selectedId, setSelectedId] = useState(
    params.get('place') || initialPlaces[0].id,
  )
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [onlyUnvisited, setOnlyUnvisited] = useState(false)
  const [collection, setCollection] = useState(
    initialView === 'empty' ? 'Weekend ideas' : 'LA weekend',
  )
  const [collections, setCollections] = useState([
    'LA weekend',
    'Weekend ideas',
  ])
  const [draft, setDraft] = useState<SaveDraft | null>(null)
  const [saveState, setSaveState] = useState<SaveState | null>(initialSave)
  const [notice, setNotice] = useState('')
  const [newCollection, setNewCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const collectionDialog = useModalFocus(newCollection, () =>
    setNewCollection(false),
  )
  const changeCollection = (name: string) => {
    setCollection(name)
    setCategory('All')
    setOnlyUnvisited(false)
    setSearch('')
    const first = places.find((p) =>
      name === 'Coffee'
        ? p.category === 'Coffee'
        : name === 'Galleries'
          ? p.category === 'Culture'
          : p.collection === name,
    )
    if (first) setSelectedId(first.id)
    setView('list')
  }
  const returnView = useRef<View>('list')
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const lastAdded = useRef<string | null>(null)
  const selected =
    places.find((p) => p.id === selectedId) ||
    initialPlaces.find((p) => p.id === selectedId) ||
    initialPlaces[0]
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(t)
  }, [notice])
  useEffect(() => () => clearTimeout(refreshTimer.current), [])
  const navigate = useCallback((next: View) => {
    setView(next)
    setNotice('')
    window.scrollTo(0, 0)
  }, [])
  const closeSave = useCallback(() => setSaveState(null), [])
  const openDetail = (place: Place) => {
    returnView.current = view === 'map' || view === 'saved' ? 'map' : 'list'
    setSelectedId(place.id)
    setCollection(place.collection)
    setSaveState(null)
    navigate('detail')
    setTimeout(() => document.getElementById('place-heading')?.focus(), 0)
  }
  const updatePlace = (place: Place, changes: Partial<Place>) =>
    setPlaces((items) =>
      items.map((p) => (p.id === place.id ? { ...p, ...changes } : p)),
    )
  const bookmark = (place: Place) =>
    updatePlace(place, { bookmarked: !place.bookmarked })
  const directions = (place: Place) =>
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`,
      '_blank',
      'noopener,noreferrer',
    )
  const share = async (place: Place) => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('view', 'detail')
    url.searchParams.set('place', place.id)
    try {
      await navigator.clipboard.writeText(url.toString())
      setNotice('Place link copied.')
    } catch {
      setNotice(`Copy this place link: ${url}`)
    }
  }
  const mapPlaces = places.filter(
    (p) =>
      inCollection(p, collection) &&
      (view === 'detail' ||
        ((category === 'All' || p.category === category) &&
          (!onlyUnvisited || !p.visited) &&
          matchesPlace(p, search))),
  )
  const mapSelected =
    mapPlaces.find((p) => p.id === selected.id) ?? mapPlaces[0] ?? selected
  return (
    <div className={`app-shell view-${view} ${saveState ? 'has-save' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to places
      </a>
      <div inert={Boolean(saveState || newCollection)}>
        <DesktopNavigation
          view={view}
          places={places}
          collections={collections}
          onNewCollection={() => setNewCollection(true)}
          onView={navigate}
          search={search}
          onSearch={setSearch}
          collection={collection}
          onCollection={changeCollection}
          onSave={() => setSaveState('entry')}
          onNotice={setNotice}
        />
        <main className="workspace" id="main-content">
          {view !== 'detail' && !view.startsWith('list_') && (
            <MobileHeader view={view} onView={navigate} onNotice={setNotice} />
          )}
          {view === 'list' && (
            <PlaceList
              places={places}
              collections={collections}
              category={category}
              onCategory={setCategory}
              onlyUnvisited={onlyUnvisited}
              onUnvisited={setOnlyUnvisited}
              selected={selectedId}
              search={search}
              onSearch={setSearch}
              collection={collection}
              onCollection={changeCollection}
              onSelect={openDetail}
              onSave={() => setSaveState('entry')}
              onBookmark={bookmark}
              onShare={(p) => void share(p)}
              onDirections={directions}
              onNewCollection={() => setNewCollection(true)}
            />
          )}
          {view.startsWith('list_') ? (
            <ListState
              loading={view === 'list_loading'}
              onBack={() => navigate('list')}
              onMap={() => navigate('map')}
              onRetry={() => {
                navigate('list_loading')
                refreshTimer.current = setTimeout(() => navigate('list'), 1000)
              }}
            />
          ) : (
            <MapView
              places={view === 'empty' ? [] : mapPlaces}
              selected={mapSelected}
              mode={
                view === 'list'
                  ? 'workspace'
                  : view === 'detail'
                    ? 'detail'
                    : view === 'empty'
                      ? 'empty'
                      : view === 'saved'
                        ? 'saved'
                        : 'map'
              }
              onSelect={(p) => setSelectedId(p.id)}
              onDetail={openDetail}
              onSave={() => setSaveState('entry')}
              onNotice={setNotice}
              onBookmark={bookmark}
              onDirections={directions}
            />
          )}
          {view === 'detail' && (
            <PlaceDetail
              key={selected.id}
              place={selected}
              places={places}
              onClose={() => navigate(returnView.current)}
              onBookmark={() => bookmark(selected)}
              onVisited={() =>
                updatePlace(selected, {
                  visited: !selected.visited,
                  badge: selected.visited ? 'Must try' : 'Visited',
                })
              }
              onShare={() => void share(selected)}
              onDirections={() => directions(selected)}
              onNote={(note) => {
                updatePlace(selected, { note })
                setNotice('Note updated for this preview.')
              }}
              onNotice={setNotice}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
          {view === 'empty' && (
            <div className="mobile-empty">
              <h1>Weekend ideas</h1>
              <p>No places in this collection yet.</p>
              <button className="primary" onClick={() => setSaveState('entry')}>
                Save a place
              </button>
            </div>
          )}
          {view === 'saved' && (
            <div className="saved-toast">
              <Icon name="7bebf" />
              <div>
                <strong>{selected.name}</strong>
                <span>Saved to {selected.collection}</span>
              </div>
              <button
                onClick={() => {
                  if (lastAdded.current) {
                    setPlaces((items) =>
                      items.filter((p) => p.id !== lastAdded.current),
                    )
                    lastAdded.current = null
                    setSelectedId(initialPlaces[0].id)
                    navigate('list')
                  } else
                    setNotice(
                      'This is the saved-state preview; no new place was added.',
                    )
                }}
              >
                Undo
              </button>
              <button onClick={() => openDetail(selected)}>View place</button>
            </div>
          )}
        </main>
      </div>
      {saveState && (
        <SavePlace
          draft={draft}
          onDraft={setDraft}
          initialState={saveState}
          collections={collections}
          defaultCollection={collection}
          places={places}
          scenario={params.get('scenario')}
          onClose={closeSave}
          onSaved={(place) => {
            setPlaces((items) => [place, ...items])
            setSelectedId(place.id)
            lastAdded.current = place.id
            setCollection(place.collection)
            if (window.matchMedia('(min-width: 768px)').matches) {
              closeSave()
              navigate('saved')
            }
          }}
          onView={openDetail}
          onMap={() => {
            closeSave()
            navigate(
              window.matchMedia('(min-width: 768px)').matches ? 'saved' : 'map',
            )
          }}
        />
      )}
      {notice && (
        <div className="notice-toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {newCollection && (
        <div
          ref={collectionDialog}
          className="simple-overlay"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setNewCollection(false)
          }}
        >
          <form
            className="simple-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-title"
            onSubmit={(e) => {
              e.preventDefault()
              const name = newCollectionName.trim()
              if (!name) {
                setCollectionError('Enter a collection name.')
                return
              }
              if (
                [...collections, 'Coffee', 'Galleries'].some(
                  (c) => c.toLowerCase() === name.toLowerCase(),
                )
              ) {
                setCollectionError(
                  'A collection with this name already exists.',
                )
                return
              }
              setCollections((items) => [...items, name])
              changeCollection(name)
              setNewCollection(false)
              setNewCollectionName('')
              setCollectionError('')
            }}
          >
            <h2 id="collection-title">New collection</h2>
            <label htmlFor="collection-name">Collection name</label>
            <input
              autoFocus
              id="collection-name"
              maxLength={60}
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />
            {collectionError && <p role="alert">{collectionError}</p>}
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => setNewCollection(false)}
              >
                Cancel
              </button>
              <button className="primary">Create collection</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
export default App
