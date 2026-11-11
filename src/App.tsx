import { lazy, Suspense } from 'react'
import { forgetPhoto, prefetchPhotos } from './lib/place-photo'
const LiveMap = lazy(() => import('./components/LiveMap'))
import { AuthModal } from './components/AuthModal'
import {
  cloudEnabled,
  getSession,
  subscribeSession,
  signOut,
} from './lib/cloud-auth'
import {
  listSaved,
  saveConfirmed,
  patchSaved,
  deleteSaved,
  toUIPlace,
} from './lib/storage-api'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
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
  const session = useSyncExternalStore(subscribeSession, getSession)
  const [authOpen, setAuthOpen] = useState(false)
  const [authReason, setAuthReason] = useState('')
  const [resumeSave, setResumeSave] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const [view, setView] = useState<View>(initialView)
  const [places, setPlaces] = useState<Place[]>(
    cloudEnabled ? [] : initialPlaces,
  )
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
  const draftOwner = useRef<string | null>(null)
  const keepDraft = (value: SaveDraft | null) => {
    setDraft(value)
    draftOwner.current = value
      ? (getSession()?.sub ?? draftOwner.current)
      : null
  }
  const [saveState, setSaveState] = useState<SaveState | null>(initialSave)
  const [notice, setNotice] = useState('')
  const [newCollection, setNewCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const collectionDialog = useModalFocus(newCollection, () =>
    setNewCollection(false),
  )
  const loadPlaces = useCallback(async (next: string | null = null) => {
    if (!getSession()) return
    const owner = getSession()!.sub,
      generation = ++loadGeneration.current
    setCloudLoading(true)
    setCloudError('')
    try {
      const result = await listSaved(next)
      const seen = new Set<string>()
      while (result.cursor) {
        if (
          getSession()?.sub !== owner ||
          generation !== loadGeneration.current
        )
          return
        if (seen.has(result.cursor))
          throw new Error('Could not finish loading places. Please retry.')
        seen.add(result.cursor)
        const page = await listSaved(result.cursor)
        result.items.push(...page.items)
        result.cursor = page.cursor
      }
      if (
        getSession()?.sub !== owner ||
        generation !== loadGeneration.current
      )
        return
      const incoming = result.items.map(toUIPlace)
      setPlaces((previous) =>
        next
          ? [
              ...previous.filter(
                (p) => !incoming.some((i) => i.id === p.id),
              ),
              ...incoming,
            ]
          : incoming,
      )
      setCollections((previous) => [
        ...new Set([...previous, ...incoming.map((p) => p.collection)]),
      ])
      setCursor(result.cursor)
      if (!next && incoming.length)
        setCollection((current) =>
          incoming.some((p) => p.collection === current)
            ? current
            : incoming[0].collection,
        )
    } catch (e) {
      if (
        getSession()?.sub === owner &&
        generation === loadGeneration.current
      )
        setCloudError(
          e instanceof Error ? e.message : 'Could not load places.',
        )
    } finally {
      if (generation === loadGeneration.current) setCloudLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!cloudEnabled) return
    // Clear private data when the external authentication session changes.
    loadGeneration.current++
    // eslint-disable-next-line react/set-state-in-effect
    setPlaces([])
    setCollections(['LA weekend', 'Weekend ideas'])
    setSelectedId('')
    setCursor(null)
    setCloudError('')
    setCloudLoading(false)
    setView('list')
    if (
      session?.sub &&
      draftOwner.current &&
      draftOwner.current !== session.sub
    ) {
      setDraft(null)
      draftOwner.current = null
      setSaveState(null)
      setResumeSave(false)
    }
    if (session?.sub) void loadPlaces()
  }, [session?.sub, loadPlaces])
  const photoIds = session?.sub ? places.filter(p => p.saved && p.collection === collection).slice(0,12).map(p=>p.id).join('|') : ''
  useEffect(() => {
    if (!photoIds) return
    return prefetchPhotos(photoIds.split('|'))
  }, [photoIds, session?.sub])
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
  const updatePlace = async (place: Place, changes: Partial<Place>) => {
    if (cloudEnabled) {
      if (!place.saved) {
        setNotice('Only confirmed cloud places can be updated.')
        return false
      }
      try {
        const allowed = {
          ...('note' in changes ? { note: changes.note } : {}),
          ...('visited' in changes ? { visited: changes.visited } : {}),
          ...('bookmarked' in changes
            ? { bookmarked: changes.bookmarked }
            : {}),
        }
        const result = await patchSaved(place.saved, allowed)
        setPlaces((items) =>
          items.map((p) =>
            p.id === place.id ? toUIPlace(result.item) : p,
          ),
        )
        setNotice('Changes saved.')
        return true
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Update failed.')
        return false
      }
    }
    setPlaces((items) =>
      items.map((p) => (p.id === place.id ? { ...p, ...changes } : p)),
    )
    return true
  }
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
    <div
      className={`app-shell view-${view} ${saveState ? 'has-save' : ''} ${cloudEnabled ? 'cloud-enabled' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to places
      </a>
      {cloudEnabled && (
        <header
          className="account-bar"
          inert={Boolean(saveState || authOpen || newCollection)}
        >
          <span>pinWish</span>
          <div>
            {session ? (
              <>
                <span className="account-email">{session.email}</span>
                <button
                  onClick={() => {
                    setDraft(null)
                    setSaveState(null)
                    setPlaces([])
                    setCollections(['LA weekend', 'Weekend ideas'])
                    setSelectedId('')
                    setView('list')
                    void signOut()
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                className="primary small"
                onClick={() => {
                  setAuthReason('')
                  setAuthOpen(true)
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </header>
      )}
      <div inert={Boolean(saveState || newCollection || authOpen)}>
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
          onAccount={
            cloudEnabled
              ? () => {
                  if (session) setNotice(`Signed in as ${session.email}`)
                  else {
                    setAuthReason('')
                    setAuthOpen(true)
                  }
                }
              : undefined
          }
        />
        <main className="workspace" id="main-content">
          {view !== 'detail' && !view.startsWith('list_') && (
            <MobileHeader
              view={view}
              onView={navigate}
              onNotice={setNotice}
              onAccount={
                cloudEnabled
                  ? () => {
                      if (!session) setAuthOpen(true)
                      else setNotice(`Signed in as ${session.email}`)
                    }
                  : undefined
              }
            />
          )}
          {cloudEnabled && view === 'list' && (
            <section
              className="cloud-list-status"
              aria-label="Cloud storage status"
            >
              {!session ? (
                <p>Sign in to keep your saved places across visits.</p>
              ) : (
                <>
                  <button
                    disabled={cloudLoading}
                    onClick={() => void loadPlaces()}
                  >
                    Refresh places
                  </button>
                  {cloudLoading && (
                    <p role="status">Loading your places…</p>
                  )}
                  {cloudError && (
                    <p role="alert" className="field-error">
                      {cloudError}
                    </p>
                  )}
                  {cursor && (
                    <button
                      disabled={cloudLoading}
                      onClick={() => void loadPlaces(cursor)}
                    >
                      Load more places
                    </button>
                  )}
                </>
              )}
            </section>
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
                refreshTimer.current = setTimeout(
                  () => navigate('list'),
                  1000,
                )
              }}
            />
          ) : cloudEnabled ? (
            <Suspense
              fallback={
                <section className="map-view" aria-label="Loading map">
                  Loading map…
                </section>
              }
            >
              <LiveMap
                key={session?.sub ?? 'guest'}
                places={mapPlaces}
                selectedId={selectedId}
                onSelect={openDetail}
                loading={cloudLoading}
                loadError={cloudError}
                onRetryPlaces={() => void loadPlaces()}
              />
            </Suspense>
          ) : (
            <MapView
              places={view === 'empty' || cloudEnabled ? [] : mapPlaces}
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
          {view === 'detail' &&
            (!cloudEnabled || places.some((p) => p.id === selectedId)) && (
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
                onPhotoUpdated={(saved) => setPlaces(items => items.map(p => p.id === saved.id && (p.saved?.version ?? 0) <= saved.version ? toUIPlace(saved) : p))}
                onShare={() => void share(selected)}
                onDirections={() => directions(selected)}
                onNote={async (note) => updatePlace(selected, { note })}
                onDelete={
                  cloudEnabled
                    ? async () => {
                        if (!selected.saved) return
                        await deleteSaved(selected.saved)
                        forgetPhoto(selected.id)
                        setPlaces((items) =>
                          items.filter((p) => p.id !== selected.id),
                        )
                        navigate('list')
                      }
                    : undefined
                }
                onNotice={setNotice}
                onSelect={(id) => setSelectedId(id)}
              />
            )}
          {view === 'empty' && (
            <div className="mobile-empty">
              <h1>Weekend ideas</h1>
              <p>No places in this collection yet.</p>
              <button
                className="primary"
                onClick={() => setSaveState('entry')}
              >
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
              <button onClick={() => openDetail(selected)}>
                View place
              </button>
            </div>
          )}
        </main>
      </div>
      {saveState && (
        <SavePlace
          draft={draft}
          authenticated={!!session}
          onRequireLogin={
            cloudEnabled
              ? (pending) => {
                  setDraft(pending)
                  closeSave()
                  setResumeSave(true)
                  setAuthReason(
                    'Sign in to save this place. Your link and review will be kept.',
                  )
                  setAuthOpen(true)
                }
              : undefined
          }
          onPersist={
            cloudEnabled
              ? async (confirmed, note, targetCollection) => {
                  if (!targetCollection.trim())
                    throw new Error('Enter a collection name.')
                  const owner = getSession()?.sub
                  if (!owner) throw new Error('Sign in to save places.')
                  let saved = 0
                  const failures: string[] = []
                  const savedCollections: string[] = []
                  for (const [index, place] of confirmed.entries()) {
                    // Stay below the development API's two-request-per-second limit.
                    if (index > 0)
                      await new Promise((resolve) =>
                        setTimeout(resolve, 550),
                      )
                    if (getSession()?.sub !== owner)
                      throw new Error(
                        'Your session changed. Sign in and retry.',
                      )
                    try {
                      const result = await saveConfirmed(
                        place,
                        note,
                        targetCollection,
                      )
                      saved++
                      const next = toUIPlace(result.item)
                      savedCollections.push(next.collection)
                      setPlaces((items) => [
                        next,
                        ...items.filter((p) => p.id !== next.id),
                      ])
                    } catch (e) {
                      failures.push(
                        `${place.displayName}: ${e instanceof Error ? e.message : 'Save failed'}`,
                      )
                    }
                  }
                  setCollections((items) => [
                    ...new Set([...items, ...savedCollections]),
                  ])
                  if (savedCollections[0])
                    setCollection(savedCollections[0])
                  setSelectedId('')
                  setView('list')
                  if (failures.length)
                    throw new Error(
                      `${saved} of ${confirmed.length} saved. Retry safely; already saved places will not be duplicated. ${failures.join(' ')}`,
                    )
                }
              : undefined
          }
          onDraft={keepDraft}
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
              window.matchMedia('(min-width: 768px)').matches && !cloudEnabled
                ? 'saved'
                : 'map',
            )
          }}
        />
      )}
      {authOpen && (
        <AuthModal
          reason={authReason}
          onClose={() => {
            setAuthOpen(false)
            if (resumeSave) {
              setResumeSave(false)
              setSaveState(draft?.state ?? 'entry')
            }
          }}
          onSuccess={() => {
            setAuthOpen(false)
            if (resumeSave) {
              setResumeSave(false)
              setSaveState(draft?.state ?? 'entry')
            }
          }}
        />
      )}
      {notice && (
        <div className="notice-toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => setNotice('')}
          >
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
