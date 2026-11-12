import { LoadingOverlay } from './LoadingOverlay'
import { useEffect, useRef, useState } from 'react'
import { processingRequest } from '../lib/processing-api'
import {
  isPlaceDetails,
  isPlaceSearchResponse,
  placeSearchErrors,
  type PlaceMatch,
  type PlaceSearchResponse,
} from '../lib/place-search'
import type { SavedCollection } from '../lib/storage-api'

export interface DirectDraft {
  query: string
  region: string
  note: string
  collectionId: string
  newCollectionName?: string
  newCollectionId?: string
}
interface Props {
  draft: DirectDraft
  onDraft: (draft: DirectDraft) => void
  collections: SavedCollection[]
  authenticated: boolean
  onRequireLogin: () => void
  onClose: () => void
  onImport: () => void
  onCreateCollection: (id: string, name: string) => Promise<SavedCollection>
  onSave: (jobId: string, draft: DirectDraft) => Promise<void>
}
export function DirectPlace(props: Props) {
  const { draft, onDraft } = props
  const [results, setResults] = useState<PlaceSearchResponse | null>(null)
  const [selected, setSelected] = useState<PlaceMatch | null>(null)
  const [jobId, setJobId] = useState('')
  const [busy, setBusy] = useState<
    'search' | 'details' | 'save' | 'collection' | null
  >(null)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const locked = useRef(false)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  }, [props])
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  function cancel() {
    request.current++
    controller.current?.abort()
    controller.current = null
    setBusy(null)
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (busyRef.current !== 'save' && busyRef.current !== 'collection')
          latest.current.onClose()
      }
      if (e.key !== 'Tab') return
      const controls = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
        ) ?? []),
      ].filter((el) => el.getClientRects().length)
      const first = controls[0],
        last = controls.at(-1)
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        e.preventDefault()
        last?.focus()
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialog.current)
      ) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++
      // eslint-disable-next-line react-hooks/exhaustive-deps
      controller.current?.abort()
      document.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
  }, [])
  useEffect(() => {
    if (!draft.collectionId && props.collections.length)
      onDraft({ ...draft, collectionId: props.collections[0].id })
  }, [draft, props.collections, onDraft])
  function editSearch(field: 'query' | 'region', value: string) {
    cancel()
    setResults(null)
    setSelected(null)
    setJobId('')
    setError('')
    onDraft({ ...draft, [field]: value })
  }
  async function fetchOperation(
    operation: string,
    body: object,
    signal: AbortSignal,
  ) {
    const response = await processingRequest(`/api/places/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const data = await response.json()
    if (!response.ok)
      throw Error(
        placeSearchErrors[data.code] ??
          'Place search is temporarily unavailable. Your input is kept; try again.',
      )
    return { data, response }
  }
  async function search() {
    if (!props.authenticated) {
      props.onRequireLogin()
      return
    }
    if (
      !draft.query.trim() ||
      [...(draft.query + draft.region)].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      )
    ) {
      setError('Enter a place name or address.')
      return
    }
    cancel()
    const generation = request.current
    const next = new AbortController()
    controller.current = next
    setBusy('search')
    setError('')
    setSelected(null)
    setJobId('')
    setResults(null)
    try {
      const { data } = await fetchOperation(
        'search',
        {
          query: draft.query.trim(),
          region: draft.region.trim(),
          countryCode: '',
        },
        next.signal,
      )
      if (generation !== request.current) return
      if (!isPlaceSearchResponse(data))
        throw Error('The search returned incomplete results. Please try again.')
      setResults(data)
    } catch (e) {
      if (generation === request.current)
        setError(
          e instanceof Error ? e.message : 'Search failed. Please try again.',
        )
    } finally {
      if (generation === request.current) setBusy(null)
    }
  }
  async function choose(match: PlaceMatch) {
    if (!props.authenticated) {
      props.onRequireLogin()
      return
    }
    cancel()
    const generation = request.current
    const next = new AbortController()
    controller.current = next
    setBusy('details')
    setError('')
    setSelected(null)
    setJobId('')
    try {
      const { data, response } = await fetchOperation(
        'details',
        { selectionToken: match.selectionToken },
        next.signal,
      )
      if (generation !== request.current) return
      const verifiedId = response.headers.get('X-Pinwish-Job')
      if (
        !isPlaceDetails(data) ||
        data.place.placeId !== match.placeId ||
        data.place.countryCode !== match.countryCode ||
        !verifiedId ||
        !/^[0-9a-f-]{36}$/.test(verifiedId)
      )
        throw Error(
          'This result could not be verified. Search again and select the place.',
        )
      if (!data.place.englishName)
        throw Error(
          'An English place name is unavailable. Try a more specific search.',
        )
      setSelected(data.place)
      setJobId(verifiedId)
    } catch (e) {
      if (generation === request.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load this place. Please try again.',
        )
    } finally {
      if (generation === request.current) setBusy(null)
    }
  }
  async function save() {
    if (locked.current || !selected || !jobId) return
    if (!props.authenticated) {
      props.onRequireLogin()
      return
    }
    if (!props.collections.some((c) => c.id === draft.collectionId)) {
      setError('Choose a collection before saving.')
      return
    }
    locked.current = true
    setBusy('save')
    setError('')
    try {
      await props.onSave(jobId, draft)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save this place. Please retry.',
      )
    } finally {
      locked.current = false
      setBusy(null)
    }
  }
  async function createNewCollection() {
    if (locked.current) return
    if (!props.authenticated) {
      props.onRequireLogin()
      return
    }
    const name = (draft.newCollectionName ?? '').normalize('NFKC').trim()
    if (!name || name.length > 60 || /[\p{Cc}]/u.test(name)) {
      setError('Use a collection name with 1–60 characters.')
      return
    }
    const id = draft.newCollectionId ?? crypto.randomUUID()
    onDraft({ ...draft, newCollectionId: id })
    locked.current = true
    setBusy('collection')
    setError('')
    try {
      const created = await props.onCreateCollection(id, name)
      onDraft({
        ...draft,
        collectionId: created.id,
        newCollectionName: '',
        newCollectionId: undefined,
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not create the collection. Please retry.',
      )
    } finally {
      locked.current = false
      setBusy(null)
    }
  }
  const saving = busy === 'save' || busy === 'collection'
  return (
    <div className="save-overlay direct-overlay">
      <LoadingOverlay active={!!busy} onCancel={!saving ? cancel : undefined} />
      <div
        className="save-dialog direct-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="direct-title"
        ref={dialog}
        tabIndex={-1}
      >
        <header className="save-header">
          <h1 id="direct-title">Save a place</h1>
          <button
            className="direct-close"
            type="button"
            aria-label="Close save dialog"
            disabled={saving}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <div className="save-methods" aria-label="Choose how to add a place">
          <button
            type="button"
            aria-pressed="false"
            disabled={saving}
            onClick={props.onImport}
          >
            Instagram link
          </button>
          <button type="button" aria-pressed="true">
            Place search
          </button>
        </div>
        <div className="direct-body">
          {!results && !selected && (
            <p className="direct-intro">
              Somewhere in mind?
              <br />
              <span>
                Find it by name or address, then make it part of your
                collection.
              </span>
            </p>
          )}
          {!selected && (
            <form
              className="direct-search-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!busy) void search()
              }}
            >
              <label htmlFor="direct-query">Place name or address</label>
              <input
                id="direct-query"
                value={draft.query}
                maxLength={200}
                disabled={saving}
                placeholder="The Gamble House"
                onChange={(e) => editSearch('query', e.target.value)}
              />
              <label htmlFor="direct-region">
                City or region <span className="optional-label">optional</span>
              </label>
              <div className="direct-search-row">
                <input
                  id="direct-region"
                  value={draft.region}
                  maxLength={200}
                  disabled={saving}
                  placeholder="Pasadena, California"
                  onChange={(e) => editSearch('region', e.target.value)}
                />
                <button className="primary" type="submit" disabled={!!busy}>
                  {busy === 'search' ? 'Searching…' : 'Search'}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="direct-error" role="alert">
              {error}
            </p>
          )}
          {error && !props.authenticated && (
            <button
              type="button"
              className="direct-signin"
              onClick={props.onRequireLogin}
            >
              Sign in to continue
            </button>
          )}
          {results && !selected && (
            <section
              className="direct-results"
              aria-label="Place search results"
            >
              <p className="direct-section-label">
                {results.matches.length ? 'Choose a place' : 'No places found'}
              </p>
              {!results.matches.length && (
                <p className="field-help">
                  Try a more specific name, street address, or city.
                </p>
              )}
              {results.queryConversion?.status === 'translated' && (
                <p className="field-help">
                  Searching as {results.queryConversion.searchQuery}
                </p>
              )}
              {results.matches.map((match) => (
                <button
                  className="direct-result"
                  type="button"
                  key={match.placeId}
                  disabled={!!busy}
                  onClick={() => void choose(match)}
                >
                  <strong>
                    {match.englishName || 'Place name unavailable'}
                  </strong>
                  <span>{match.address}</span>
                  <small>{match.countryName}</small>
                </button>
              ))}
              {!!results.unsupportedCountries.length && (
                <p className="field-help">
                  Detailed place search is not available for South Korea.
                </p>
              )}
              <p className="direct-attribution">{results.attribution}</p>
            </section>
          )}
          {selected && (
            <section className="direct-selection" aria-label="Selected place">
              <div className="direct-selection-heading">
                <p className="direct-section-label">Selected place</p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelected(null)
                    setJobId('')
                    setError('')
                  }}
                >
                  Change
                </button>
              </div>
              <h2>{selected.englishName}</h2>
              <p>{selected.address}</p>
              <small>{selected.countryName}</small>
              <div className="direct-save-fields">
                <label htmlFor="direct-collection">Collection</label>
                <select
                  id="direct-collection"
                  value={draft.collectionId}
                  disabled={saving}
                  onChange={(e) =>
                    onDraft({ ...draft, collectionId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Choose a collection
                  </option>
                  {props.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">Create a new collection…</option>
                </select>
                {draft.collectionId === '__new__' ? (
                  <div className="direct-new-collection">
                    <label htmlFor="direct-collection-name">
                      New collection name
                    </label>
                    <div className="direct-new-collection-row">
                      <input
                        id="direct-collection-name"
                        value={draft.newCollectionName ?? ''}
                        maxLength={60}
                        disabled={saving}
                        placeholder="A weekend in San Diego"
                        onChange={(e) => {
                          setError('')
                          onDraft({
                            ...draft,
                            newCollectionName: e.target.value,
                            newCollectionId: crypto.randomUUID(),
                          })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void createNewCollection()
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="direct-create-collection"
                        disabled={!!busy || !draft.newCollectionName?.trim()}
                        onClick={() => void createNewCollection()}
                      >
                        {busy === 'collection' ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                    <p>You can rename or delete this collection later.</p>
                  </div>
                ) : (
                  <p className="direct-collection-help">
                    Choose an existing collection or create a new one.
                  </p>
                )}
                <label htmlFor="direct-note">
                  Personal note <span className="optional-label">optional</span>
                </label>
                <textarea
                  id="direct-note"
                  value={draft.note}
                  maxLength={1000}
                  rows={3}
                  disabled={saving}
                  placeholder="What would you like to remember?"
                  onChange={(e) => onDraft({ ...draft, note: e.target.value })}
                />
              </div>
            </section>
          )}
        </div>
        <footer className="direct-footer">
          <span>
            {selected
              ? 'Save it now. Visit when you’re ready.'
              : 'Select a result to add it to your map.'}
          </span>
          <button
            type="button"
            className="primary"
            disabled={
              !selected ||
              !!busy ||
              !props.collections.some((c) => c.id === draft.collectionId)
            }
            onClick={() => void save()}
          >
            {saving ? 'Adding…' : 'Add to map'}
          </button>
        </footer>
      </div>
    </div>
  )
}
