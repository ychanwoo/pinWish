import { useEffect, useRef, useState } from 'react'
import { processingRequest } from '../../lib/processing-api'
import {
  isPlaceDetails,
  isPlaceSearchResponse,
  placeSearchErrors,
  type PlaceMatch,
  type PlaceSearchResponse,
} from '../../lib/place-search'
import type { SavedCollection } from '../../lib/storage-api'

export interface DirectDraft {
  query: string
  region: string
  note: string
  collectionId: string
  newCollectionName?: string
  newCollectionId?: string
}
export interface DirectPlaceProps {
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
export function useDirectPlace(props: DirectPlaceProps) {
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
  return {
    busy,
    cancel,
    choose,
    createNewCollection,
    dialog,
    draft,
    editSearch,
    error,
    onDraft,
    results,
    save,
    saving,
    search,
    selected,
    setError,
    setJobId,
    setSelected,
  }
}
