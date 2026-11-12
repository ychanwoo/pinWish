import { useMapAppearance } from './hooks/useMapAppearance'
import { ItineraryPlanner } from './components/ItineraryPlanner'
import { CollectionSharing } from './components/CollectionSharing'
import { lazy, Suspense } from 'react'
import { forgetPhoto, prefetchPhotos } from './lib/place-photo'
const LiveMap = lazy(() => import('./components/LiveMap'))
import { DirectPlace, type DirectDraft } from './components/DirectPlace'
import { AuthModal } from './components/AuthModal'
import {
  cloudEnabled,
  getSession,
  subscribeSession,
  signOut,
} from './lib/cloud-auth'
import {
  listSaved,
  listCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  type SavedCollection,
  type SavedPlace,
  saveConfirmed,
  saveDirectPlace,
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
  filterPlaces,
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
import { CollectionDialog } from './components/CollectionDialog'
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
const initialView =
  !cloudEnabled && views.includes(params.get('view') as View)
    ? (params.get('view') as View)
    : 'list'
const initialSave =
  (!cloudEnabled || params.get('state') === 'entry') &&
  saveStates.includes(params.get('state') as SaveState)
    ? (params.get('state') as SaveState)
    : null
function App() {
  const session = useSyncExternalStore(subscribeSession, getSession)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authReason, setAuthReason] = useState('')
  const [resumeSave, setResumeSave] = useState(false)
  const [saveMethod, setSaveMethod] = useState<'instagram' | 'search'>(
    'instagram',
  )
  const [directDraft, setDirectDraft] = useState<DirectDraft>({
    query: '',
    region: '',
    note: '',
    collectionId: '',
  })
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const pendingPlaceLink = useRef(
    cloudEnabled && params.get('view') === 'detail'
      ? params.get('place')
      : null,
  )
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
    cloudEnabled
      ? 'Saved places'
      : initialView === 'empty'
        ? 'Weekend ideas'
        : 'LA weekend',
  )
  const [collections, setCollections] = useState(
    cloudEnabled ? ['Saved places'] : ['LA weekend', 'Weekend ideas'],
  )
  const [catalog, setCatalog] = useState<SavedCollection[]>([])
  const mapAppearance = useMapAppearance(cloudEnabled ? session?.sub : undefined, places, catalog)
  const catalogRef = useRef(catalog)
  useEffect(() => {
    catalogRef.current = catalog
  }, [catalog])
  const canonicalPlace = (saved: SavedPlace) => {
    const c =
      catalogRef.current.find((c) => c.id === saved.collectionId) ??
      (saved.collectionId
        ? catalogRef.current.find((c) => c.isDefault)
        : undefined)
    return toUIPlace(
      c ? { ...saved, collectionId: c.id, collection: c.name } : saved,
    )
  }
  const [collectionDialogMode, setCollectionDialogMode] = useState<'manage' | 'rename' | 'delete'>('manage')
  const [managedCollection, setManagedCollection] = useState<
    SavedCollection | undefined
  >()
  const [draft, setDraft] = useState<SaveDraft | null>(null)
  const draftOwner = useRef<string | null>(null)
  const directOwner = useRef<string | null>(null)
  const keepDraft = (value: SaveDraft | null) => {
    setDraft(value)
    draftOwner.current = value
      ? (getSession()?.sub ?? draftOwner.current)
      : null
  }
  const [saveState, setSaveState] = useState<SaveState | null>(initialSave)
  const [notice, setNotice] = useState('')
  const [newCollection, setNewCollection] = useState(false)
  const sharingReturnFocus = useRef<HTMLElement | null>(null)
  const [tripCollection, setTripCollection] = useState<SavedCollection | null>(null)
  const [sharingCollection, setSharingCollection] = useState<SavedCollection | null>(null)
  const loadPlaces = useCallback(async (next: string | null = null) => {
    if (!getSession()) return
    const owner = getSession()!.sub,
      generation = ++loadGeneration.current
    setCloudLoading(true)
    setCloudError('')
    try {
      const collectionResult = await listCollections()
      collectionResult.items.sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault),
      )
      const result = await listSaved(next)
      if (result.collectionVersion !== collectionResult.version)
        throw new Error(
          'Your collections changed while loading. Please refresh your places.',
        )
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
        if (page.collectionVersion !== collectionResult.version)
          throw new Error(
            'Your collections changed while loading. Please refresh your places.',
          )
        result.items.push(...page.items)
        result.cursor = page.cursor
      }
      if (getSession()?.sub !== owner || generation !== loadGeneration.current)
        return
      const incoming = result.items.map(toUIPlace)
      setPlaces((previous) =>
        next
          ? [
              ...previous.filter((p) => !incoming.some((i) => i.id === p.id)),
              ...incoming,
            ]
          : incoming,
      )
      setCatalog(collectionResult.items)
      setCollections(collectionResult.items.map((c) => c.name))
      setCursor(result.cursor)
      setCollection((current) =>
        collectionResult.items.some((c) => c.name === current)
          ? current
          : 'Saved places',
      )
      if (pendingPlaceLink.current) {
        const linked = incoming.find((p) => p.id === pendingPlaceLink.current)
        pendingPlaceLink.current = null
        if (linked) {
          setSelectedId(linked.id)
          setCollection(linked.collection)
          setSearch('')
          setCategory('All')
          setOnlyUnvisited(false)
          setView('detail')
        } else
          setNotice('This private place link is not available in your account.')
      }
    } catch (e) {
      if (getSession()?.sub === owner && generation === loadGeneration.current)
        setCloudError(e instanceof Error ? e.message : 'Could not load places.')
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
    setTripCollection(null); setSharingCollection(null)
    setCollections(['Saved places'])
    setCatalog([])
    setCollection('Saved places')
    setNewCollection(false)
    setManagedCollection(undefined)
    setSelectedId('')
    setCursor(null)
    setCloudError('')
    setCloudLoading(false)
    setView('list')
    if (
      session?.sub &&
      ((draftOwner.current && draftOwner.current !== session.sub) ||
        (directOwner.current && directOwner.current !== session.sub))
    ) {
      setDraft(null)
      setDirectDraft({ query: '', region: '', note: '', collectionId: '' })
      setSaveMethod('instagram')
      draftOwner.current = null
      directOwner.current = null
      setSaveState(null)
      setResumeSave(false)
    }
    if (session?.sub) void loadPlaces()
  }, [session?.sub, loadPlaces])
  const photoIds = session?.sub
    ? places
        .filter((p) => p.saved && p.collection === collection)
        .slice(0, 12)
        .map((p) => p.id)
        .join('|')
    : ''
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
      !cloudEnabled && name === 'Coffee'
        ? p.category === 'Coffee'
        : !cloudEnabled && name === 'Galleries'
          ? p.category === 'Culture'
          : p.collection === name,
    )
    if (first) setSelectedId(first.id)
    setView('list')
  }
  const openNewCollection = () => {
    if (cloudEnabled && !getSession()) {
      setAuthReason('Sign in to create and keep your collections.')
      setAuthOpen(true)
      return
    }
    if (cloudEnabled && (!catalog.length || cloudLoading)) {
      setNotice('Wait for your collections to load, then try again.')
      return
    }
    setManagedCollection(undefined)
    setCollectionDialogMode('manage')
    setNewCollection(true)
  }
  const currentCollection = catalog.find((c) => c.name === collection)
  const manageCollection =
    currentCollection
      ? () => {
          setCollectionDialogMode('manage')
          setManagedCollection(currentCollection)
          setNewCollection(true)
        }
      : undefined
  const requireOwner = (owner: string | undefined) => {
    if (!owner || getSession()?.sub !== owner)
      throw new Error('Your account changed. Please try again.')
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
      const owner = getSession()?.sub
      try {
        const target =
          'collection' in changes
            ? catalog.find((c) => c.name === changes.collection)
            : undefined
        if ('collection' in changes && !target)
          throw new Error(
            'This collection no longer exists. Refresh your places.',
          )
        const allowed = {
          ...(target ? { collectionId: target.id } : {}),
          ...('note' in changes ? { note: changes.note } : {}),
          ...('visited' in changes ? { visited: changes.visited } : {}),
          ...('bookmarked' in changes
            ? { bookmarked: changes.bookmarked }
            : {}),
        }
        const result = await patchSaved(place.saved, allowed)
        requireOwner(owner)
        loadGeneration.current++
        setCloudLoading(false)
        setPlaces((items) =>
          items.map((p) => (p.id === place.id ? toUIPlace(result.item) : p)),
        )
        if (target) {
          setCollection(result.item.collection)
          setCategory('All')
          setSearch('')
          setOnlyUnvisited(false)
        }
        setNotice('Changes saved.')
        return true
      } catch (e) {
        if (getSession()?.sub !== owner) return false
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
      setNotice(
        place.saved
          ? 'Private link copied. Only your account can open this place.'
          : 'Place link copied.',
      )
    } catch {
      setNotice(
        `${place.saved ? 'Only your account can open this private link. Copy:' : 'Copy this place link:'} ${url}`,
      )
    }
  }
  const mapPlaces = filterPlaces(
    places,
    collection,
    view === 'detail' ? 'All' : category,
    view === 'detail' ? false : onlyUnvisited,
    view === 'detail' ? '' : search,
  )
  const mapSelected =
    mapPlaces.find((p) => p.id === selected.id) ?? mapPlaces[0] ?? selected
  return (
    <div
      className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} view-${view} ${saveState ? 'has-save' : ''} ${cloudEnabled ? 'cloud-enabled' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to places
      </a>
      {cloudEnabled && (
        <header
          className="account-bar"
          inert={Boolean(saveState || authOpen || newCollection || sharingCollection || tripCollection)}
        >
          <span>pinWish</span>
          <div>
            {session ? (
              <>
                <span className="account-email">{session.email}</span>
                <button
                  onClick={() => {
                    setDraft(null)
                    setDirectDraft({ query: '', region: '', note: '', collectionId: '' })
                    setSaveMethod('instagram')
                    directOwner.current = null
                    draftOwner.current = null
                    setSaveState(null)
                    setPlaces([])
                    setCollections(['Saved places'])
                    setCatalog([])
                    setCollection('Saved places')
                    setNewCollection(false)
                    setManagedCollection(undefined)
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
      <div inert={Boolean(saveState || newCollection || authOpen || sharingCollection || tripCollection)}>
        <DesktopNavigation
          appearance={mapAppearance}
          sidebarOpen={sidebarOpen}
          onSidebarOpen={setSidebarOpen}
          view={view}
          places={places}
          collections={collections}
          onNewCollection={openNewCollection}
          onCollectionAction={cloudEnabled ? (name, action) => {
            const item = catalog.find(c => c.name === name)
            if (!item) return
            if (action === 'plan') { sharingReturnFocus.current = document.activeElement as HTMLElement; setTripCollection(item); return }
            if (action === 'share') { sharingReturnFocus.current = document.activeElement as HTMLElement; setSharingCollection(item); return }
            setManagedCollection(item)
            setCollectionDialogMode(action)
            setNewCollection(true)
          } : undefined}
          canManageCollection={name => catalog.some(c => c.name === name)}
          persistent={cloudEnabled}
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
                  {cloudLoading && <p role="status">Loading your places…</p>}
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
              loading={cloudEnabled && cloudLoading}
              loadError={cloudEnabled ? cloudError : undefined}
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
              onNewCollection={openNewCollection}
              persistent={cloudEnabled}
              onManageCollection={manageCollection}
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
          ) : cloudEnabled ? (
            <Suspense
              fallback={
                <section className="map-view" aria-label="Loading map">
                  Loading map…
                </section>
              }
            >
              <LiveMap
                appearance={mapAppearance}
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
                metadata={mapAppearance.details[selected.id]}
                metadataError={mapAppearance.errors[selected.id]}
                onRefreshMetadata={() => mapAppearance.refresh(selected.id)}
                key={selected.id}
                place={selected}
                places={places}
                collections={cloudEnabled ? collections : undefined}
                onMove={
                  cloudEnabled
                    ? async (name) =>
                        updatePlace(selected, { collection: name })
                    : undefined
                }
                onClose={() => navigate(returnView.current)}
                onBookmark={() => bookmark(selected)}
                onVisited={() =>
                  updatePlace(selected, {
                    visited: !selected.visited,
                    badge: selected.visited ? 'Must try' : 'Visited',
                  })
                }
                onPhotoUpdated={(saved) =>
                  setPlaces((items) =>
                    items.map((p) =>
                      p.id === saved.id &&
                      (p.saved?.version ?? 0) <= saved.version
                        ? canonicalPlace(saved)
                        : p,
                    ),
                  )
                }
                onShare={() => void share(selected)}
                onDirections={() => directions(selected)}
                onNote={async (note) => updatePlace(selected, { note })}
                onDelete={
                  cloudEnabled
                    ? async () => {
                        if (!selected.saved) return
                        const owner = getSession()?.sub
                        await deleteSaved(selected.saved)
                        requireOwner(owner)
                        loadGeneration.current++
                        setCloudLoading(false)
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
      {saveState && saveMethod === 'search' && cloudEnabled ? (
        <DirectPlace
          draft={directDraft}
          onDraft={(value) => {
            directOwner.current = getSession()?.sub ?? directOwner.current
            setDirectDraft(value)
          }}
          collections={catalog}
          authenticated={!!session}
          onClose={closeSave}
          onImport={() => setSaveMethod('instagram')}
          onRequireLogin={() => {
            closeSave()
            setResumeSave(true)
            setAuthReason(
              'Sign in to search and save places. Your search will be kept.',
            )
            setAuthOpen(true)
          }}
          onCreateCollection={async (id, name) => {
            const owner = getSession()?.sub
            if (!owner) throw new Error('Sign in to create a collection.')
            const result = await createCollection(id, name)
            requireOwner(owner)
            loadGeneration.current++
            setCloudLoading(false)
            setCatalog(items => [...items.filter(c => c.id !== result.item.id), result.item])
            setCollections(items => [...new Set([...items, result.item.name])])
            return result.item
          }}
          onSave={async (jobId, input) => {
            const owner = getSession()?.sub
            if (!owner) throw new Error('Sign in to save places.')
            const result = await saveDirectPlace(
              jobId,
              input.query,
              input.region,
              input.note,
              input.collectionId,
            )
            requireOwner(owner)
            loadGeneration.current++
            setCloudLoading(false)
            const next = toUIPlace(result.item)
            setPlaces((items) => [
              next,
              ...items.filter((p) => p.id !== next.id),
            ])
            setCollection(next.collection)
            setSelectedId(next.id)
            setSearch('')
            setCategory('All')
            setOnlyUnvisited(false)
            setView('detail')
            closeSave()
            setDirectDraft({
              query: '',
              region: '',
              note: '',
              collectionId: '',
            })
            setNotice(
              result.duplicate
                ? 'Already saved. Your existing note and collection have been kept.'
                : 'Place added to your map.',
            )
          }}
        />
      ) : (
        saveState && (
          <SavePlace
            onDirectSearch={
              cloudEnabled
                ? () => {
                    setDirectDraft((current) => ({
                      ...current,
                      collectionId: catalog.some(
                        (c) => c.id === current.collectionId,
                      )
                        ? current.collectionId
                        : (catalog.find((c) => c.name === collection)?.id ??
                          catalog[0]?.id ??
                          ''),
                    }))
                    setSaveMethod('search')
                  }
                : undefined
            }
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
                    const target = catalog.find(
                      (c) => c.name === targetCollection,
                    )
                    if (!target)
                      throw new Error(
                        'This collection is no longer available. Close this dialog, refresh your places, and choose another collection.',
                      )
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
                        await new Promise((resolve) => setTimeout(resolve, 550))
                      if (getSession()?.sub !== owner)
                        throw new Error(
                          'Your session changed. Sign in and retry.',
                        )
                      try {
                        const result = await saveConfirmed(
                          place,
                          note,
                          target.id,
                        )
                        requireOwner(owner)
                        loadGeneration.current++
                        setCloudLoading(false)
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
                    requireOwner(owner)
                    if (savedCollections[0]) setCollection(savedCollections[0])
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
        )
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
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {tripCollection && session && <ItineraryPlanner key={`${session.sub}:${tripCollection.id}`} collection={tripCollection} places={places.flatMap(p => p.saved && p.saved.collectionId === tripCollection.id ? [p.saved] : [])} onClose={() => { setTripCollection(null); requestAnimationFrame(() => sharingReturnFocus.current?.focus()) }} />}
      {sharingCollection && session && <CollectionSharing key={`${session.sub}:${sharingCollection.id}`} collection={sharingCollection} onClose={() => { setSharingCollection(null); requestAnimationFrame(() => sharingReturnFocus.current?.focus()) }} />}
      {newCollection && (
        <CollectionDialog
          onPlan={managedCollection && cloudEnabled ? () => { sharingReturnFocus.current = document.querySelector<HTMLElement>('.collection-manage'); setNewCollection(false); setTripCollection(managedCollection) } : undefined}
          onShare={managedCollection && cloudEnabled ? () => { sharingReturnFocus.current = document.querySelector<HTMLElement>('.collection-manage'); setNewCollection(false); setSharingCollection(managedCollection) } : undefined}
          mode={collectionDialogMode}
          collection={managedCollection}
          onClose={() => setNewCollection(false)}
          onCreate={async (id, name) => {
            if (!cloudEnabled) {
              if (
                [...collections, 'Coffee', 'Galleries'].some(
                  (c) => c.toLowerCase() === name.toLowerCase(),
                )
              )
                throw new Error('A collection with this name already exists.')
              setCollections((items) => [...items, name])
              changeCollection(name)
              return
            }
            const owner = getSession()?.sub
            const result = await createCollection(id, name)
            requireOwner(owner)
            loadGeneration.current++
            setCloudLoading(false)
            setCatalog((items) => [
              ...items.filter((c) => c.id !== result.item.id),
              result.item,
            ])
            setCollections((items) => [
              ...new Set([...items, result.item.name]),
            ])
            changeCollection(result.item.name)
            setNotice('Collection created.')
          }}
          onRename={async (item, name) => {
            const owner = getSession()?.sub
            const result = await renameCollection(item, name)
            requireOwner(owner)
            loadGeneration.current++
            setCloudLoading(false)
            setCatalog((items) =>
              items.map((c) => (c.id === item.id ? result.item : c)),
            )
            setCollections((items) =>
              items.map((c) => (c === item.name ? result.item.name : c)),
            )
            setPlaces((items) =>
              items.map((p) =>
                p.saved?.collectionId === item.id
                  ? toUIPlace({ ...p.saved, collection: result.item.name })
                  : p,
              ),
            )
            changeCollection(result.item.name)
            setNotice('Collection renamed.')
          }}
          onDelete={async (item) => {
            const owner = getSession()?.sub
            const result = await deleteCollection(item)
            requireOwner(owner)
            loadGeneration.current++
            setCloudLoading(false)
            const fallback = result.defaultCollection
            setCatalog((items) => [...items.filter((c) => c.id !== item.id && c.id !== fallback.id).map(c => ({ ...c, isDefault: false })), fallback])
            setCollections((items) => [...new Set([...items.filter((c) => c !== item.name), fallback.name])])
            setPlaces((items) =>
              items.map((p) =>
                p.saved?.collectionId === item.id
                  ? toUIPlace({
                      ...p.saved,
                      collectionId: fallback.id,
                      collection: fallback.name,
                    })
                  : p,
              ),
            )
            changeCollection(fallback.name)
            setNotice(
              `Collection deleted. Your places were kept in ${fallback.name}.`,
            )
          }}
        />
      )}
    </div>
  )
}
export default App
