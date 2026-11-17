import { readImportHistory, restoreMatches } from '../../lib/import-history'
import { processingRequest, type ImportProgress } from '../../lib/processing-api'
import type {
  ConfirmedPlace,
  CandidateLocationDraft,
} from '../../lib/place-search'
import {
  isInstagramPreview,
  importErrorMessages,
  type InstagramPreview,
} from '../../lib/instagram-preview'
import { isUrlInput, parseInstagramLink } from '../../lib/instagram'
import { useEffect, useRef, useState } from 'react'
import {
  initialPlaces,
  resolveSample,
  sampleLink,
  validInput,
  type Place,
  type SaveState,
} from '../../data/places'
export interface SaveDraft {
  state: SaveState
  input: string
  address: string
  note: string
  collection: string
  collectionId?: string
  resolved: Place
  manual: boolean
  preview?: InstagramPreview | null
  importError?: string
  locationReviews?: Record<number, CandidateLocationDraft>
}
export interface SavePlaceProps {
  readPlaces?: () => Promise<Place[]>
  onDirectSearch?: () => void
  draft: SaveDraft | null
  onDraft: (draft: SaveDraft | null) => void
  initialState: SaveState
  collections: string[]
  collectionOptions?: { id: string; name: string }[]
  defaultCollection: string
  places: Place[]
  scenario: string | null
  onClose: () => void
  onSaved: (place: Place) => void
  onView: (place: Place) => void
  onMap: () => void
  onPersist?: (
    places: ConfirmedPlace[],
    note: string,
    title: string,
  ) => Promise<{ added: string[]; existing: string[]; failures: string[] }>
  onRequireLogin?: (draft: SaveDraft) => void
  authenticated?: boolean
}
export function useSavePlace({
  draft,
  readPlaces,
  onDraft,
  initialState,
  collections,
  collectionOptions,
  defaultCollection,
  places,
  scenario,
  onClose,
  onSaved,
  onMap,
  onPersist,
  onRequireLogin,
  authenticated,
}: SavePlaceProps) {
  const [state, setState] = useState<SaveState>(draft?.state ?? initialState)
  const [input, setInput] = useState(
    draft?.input ??
      (initialState === 'entry'
        ? ''
        : initialState === 'invalid'
          ? 'instagram / saved-post'
          : sampleLink),
  )
  const [address, setAddress] = useState(
    draft?.address ??
      (initialState === 'not_found' ? 'Grand Central Market, Los Angeles' : ''),
  )
  const [note, setNote] = useState(
    draft?.note ??
      (initialState === 'entry' ? '' : 'Try the carnitas at Villa Morelianas.'),
  )
  const [collection, setCollectionName] = useState(
    draft?.collection ??
      (collections.includes(defaultCollection)
        ? defaultCollection
        : collections[0]),
  )
  const collectionId = useRef(draft?.collectionId || collectionOptions?.find(c => c.name === collection)?.id)
  const setCollection = (name: string) => {
    setCollectionName(name)
    collectionId.current = collectionOptions?.find(c => c.name === name)?.id
  }
  const [resolved, setResolved] = useState<Place>(
    draft?.resolved ?? initialPlaces[0],
  )
  const [manual, setManual] = useState(
    draft?.manual ?? initialState === 'not_found',
  )
  const [preview, setPreview] = useState<InstagramPreview | null>(
    draft?.preview ?? null,
  )
  const [locationReviews, setLocationReviews] = useState<
    Record<number, CandidateLocationDraft>
  >(draft?.locationReviews ?? {})
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'reading_post' })
  const [previousImport, setPreviousImport] = useState<ReturnType<typeof readImportHistory> | null>(null)
  const [summary, setSummary] = useState<{ added: string[]; existing: string[] } | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
  const [persisting, setPersisting] = useState(false)
  const [persistError, setPersistError] = useState('')
  const [persistSuccess, setPersistSuccess] = useState(false)
  const [importError, setImportError] = useState(draft?.importError ?? '')
  const abortImport = useRef<AbortController | null>(null)
  const [clipboardMessage, setClipboardMessage] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const request = useRef(0)
  const lookupAttempts = useRef(0)
  const saveAttempts = useRef(0)
  const closeRef = useRef<() => void>(() => {})
  const handleClose = () => {
    if (state === 'saving' || persisting) return
    if (persistSuccess) {
      onDraft(null)
      onClose()
      return
    }
    onDraft(
      state === 'success'
        ? null
        : {
            state: state === 'resolving' ? 'entry' : state,
            input,
            address,
            note,
            collection,
            collectionId: collectionId.current,
            resolved,
            manual,
            preview,
            importError,
            locationReviews,
          },
    )
    onClose()
  }
  useEffect(() => {
    closeRef.current = handleClose
  })
  const busy =
    state === 'saving' || state === 'resolving' || persisting || autoBusy
  const confirmed = state === 'success' || state === 'duplicate'
  const hasPlace = [
    'ready',
    'saving',
    'save_error',
    'success',
    'duplicate',
  ].includes(state)
  const cancelPending = () => {
    request.current += 1
    abortImport.current?.abort()
    clearTimeout(timer.current)
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      }
      if (e.key === 'Tab') {
        const elements = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'summary, a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((el) => el.getClientRects().length > 0)
        const first = elements[0],
          last = elements.at(-1)
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
    }
    document.addEventListener('keydown', escape)
    return () => {
      abortImport.current?.abort()
      clearTimeout(timer.current)
      request.current += 1
      document.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [onClose])
  const lookup = async (recover = false) => {
    setPreviousImport(null)
    setSummary(null)
    const value = (manual ? address : input).trim()
    cancelPending()
    if (onPersist ? !parseInstagramLink(value).ok : !validInput(value)) {
      setState('invalid')
      inputRef.current?.focus()
      return
    }
    if (onRequireLogin && !authenticated) {
      const nextDraft: SaveDraft = {
        state: 'entry',
        input,
        address,
        note,
        collection,
        collectionId: collectionId.current,
        resolved,
        manual,
        preview,
        importError,
        locationReviews,
      }
      onDraft(nextDraft)
      onRequireLogin(nextDraft)
      return
    }
    // Only the explicitly labelled demo URL may resolve to a sample record.
    if (
      onPersist ||
      (isUrlInput(value) &&
        value !== sampleLink &&
        value !== 'https://maps.app.goo.gl/grandcentral')
    ) {
      setManual(false)
      setPreview(null)
      setLocationReviews({})
      setImportError('')
      if (import.meta.env.VITE_ENABLE_INSTAGRAM_PREVIEW !== 'true') {
        setState('import_unavailable')
        return
      }
      const id = request.current
      const controller = new AbortController()
      abortImport.current = controller
      setImportProgress({ stage: 'reading_post' })
      setState('resolving')
      const deadline = setTimeout(() => controller.abort(), 155000)
      try {
        const parsed = parseInstagramLink(value)
        const library = readPlaces ? await readPlaces() : places
        if (id !== request.current) return
        const history = readImportHistory(library, parsed.ok ? parsed.source.canonicalUrl : '')
        if (!recover && (history.complete || history.legacy)) {
          setPreviousImport(history)
          setState('entry')
          return
        }
        setPreviousImport(null)
        const response = await processingRequest('/api/instagram/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value }),
          signal: controller.signal,
        }, progress => {
          if (id === request.current && !controller.signal.aborted) setImportProgress(progress)
        })
        const data = await response.json()
        if (id !== request.current) return
        if (!response.ok || !isInstagramPreview(data)) {
          setImportError(
            importErrorMessages[data?.code] ??
              'The analysis could not be verified. No places have been saved. Your link is kept.',
          )
          setState('import_unavailable')
          return
        }
        // Accept only extraction fields. A model/provider cannot mark its own names as
        // user-corrected or attach a confirmed country/localized name to bypass review.
        setPreview({
          ...data,
          result: {
            ...data.result,
            places: data.result.places.map((place) => ({
              name: place.name,
              regionHint: place.regionHint,
              locationHint: place.locationHint,
              searchQuery: place.searchQuery,
              searchRegion: place.searchRegion,
              searchName: place.searchName,
              locationType: place.locationType,
              slides: place.slides,
              evidence: place.evidence,
              needsLocationConfirmation: true,
            })),
          },
        })
        if (parsed.ok) setLocationReviews(restoreMatches(history, data, parsed.source))
        setState('import_review')
      } catch {
        if (id !== request.current) return
        setImportError(
          controller.signal.aborted
            ? 'Analysis took too long. Your link is kept. Please try again.'
            : 'Could not start or resume analysis. Check your connection and sign-in session, then try again. Your link is kept.',
        )
        setState('import_unavailable')
      } finally {
        clearTimeout(deadline)
      }
      return
    }
    const id = request.current
    setState('resolving')
    timer.current = setTimeout(() => {
      if (id !== request.current) return
      if (scenario === 'lookup_error' && lookupAttempts.current++ === 0) {
        setState('lookup_error')
        return
      }
      const found = resolveSample(value)
      if (
        !found ||
        (scenario === 'not_found' && lookupAttempts.current++ === 0)
      ) {
        setManual(true)
        setState('not_found')
        return
      }
      setResolved(found)
      setState('ready')
    }, 1000)
  }
  const save = () => {
    if (onPersist) {
      setState('import_unavailable')
      setImportError(
        'Paste an Instagram post link to find and save its locations.',
      )
      return
    }
    if (state === 'saving' || !collection) return
    cancelPending()
    const id = request.current
    setState('saving')
    timer.current = setTimeout(() => {
      if (id !== request.current) return
      if (scenario === 'save_error' && saveAttempts.current++ === 0) {
        setState('save_error')
        return
      }
      const existing = places.find(
        (p) =>
          p.id.split(':')[0] === resolved.id.split(':')[0] &&
          p.collection === collection,
      )
      if (existing) {
        setResolved(existing)
        setState('duplicate')
        return
      }
      const saved = {
        ...resolved,
        id: `${resolved.id.split(':')[0]}:${collection}`,
        collection,
        note: note || resolved.note,
        bookmarked: true,
      }
      setResolved(saved)
      onDraft(null)
      onSaved(saved)
      setState('success')
    }, 1000)
  }
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setInput(text.slice(0, 2048))
      setClipboardMessage('Link pasted.')
      if (state === 'invalid') setState('entry')
    } catch {
      setClipboardMessage(
        'Clipboard access is unavailable. Paste into the field using your keyboard.',
      )
      inputRef.current?.focus()
    }
  }
  const editOriginal = () => {
    if (persisting) return
    setSummary(null)
    setPreviousImport(null)
    setPersistSuccess(false)
    setPersistError('')
    cancelPending()
    setManual(false)
    setPreview(null)
    setLocationReviews({})
    setImportError('')
    setState('entry')
  }
  const instagramSource = parseInstagramLink(input)
  const persistReview = async (
    reviews = locationReviews,
    automatic = false,
  ) => {
    const reviewDraft: SaveDraft = {
      state,
      input,
      address,
      note,
      collection,
      collectionId: collectionId.current,
      resolved,
      manual,
      preview,
      importError,
      locationReviews: reviews,
    }
    onDraft(reviewDraft)
    if (!authenticated && onRequireLogin) {
      onRequireLogin(reviewDraft)
      return
    }
    if (!onPersist || persisting) return
    const confirmedPlaces = Object.entries(reviews).flatMap(([index, r]) =>
      r.targets.flatMap((t) =>
        t.status === 'confirmed' && t.confirmed ? [{ ...t.confirmed, source: { ...t.confirmed.source, candidateIndex: Number(index), candidateCount: preview?.result.places.length } }] : [],
      ),
    )
    if (!confirmedPlaces.length) {
      setPersistError(
        'At least one location must be found before adding places.',
      )
      return
    }
    setPersisting(true)
    setPersistError('')
    try {
      const region = preview?.result.places.map(p => p.searchRegion || p.regionHint)
        .find(name => name && !/\p{Script=Hangul}/u.test(name))
      const title = (region || confirmedPlaces[0].countryName || 'Instagram places').trim().slice(0, 60)
      const result = await onPersist(confirmedPlaces, note, title)
      const added = new Set([...(summary?.added ?? []), ...result.added])
      const existing = [...new Set([...(summary?.existing ?? []), ...result.existing])].filter(id => !added.has(id))
      setSummary({ added: [...added], existing })
      if (result.failures.length) {
        setPersistError(`${result.added.length + result.existing.length} of ${confirmedPlaces.length} saved. Retry to finish adding these places. ${result.failures.join(' ')}`)
        return
      }
      setPersistSuccess(true)
      onDraft(null)
      if (
        automatic && !existing.length &&
        Object.values(reviews).every((r) =>
          r.targets.every((t) => t.status === 'confirmed'),
        )
      )
        onMap()
    } catch (e) {
      setPersistError(
        e instanceof Error
          ? e.message
          : 'Unable to save. Your draft is kept; try again.',
      )
    } finally {
      setPersisting(false)
    }
  }
  const confirmedIds = Object.values(locationReviews).flatMap((review) =>
    review.targets.flatMap((target) =>
      target.status === 'confirmed' && target.confirmed
        ? [target.confirmed.placeId]
        : [],
    ),
  )
  const reviewComplete =
    !!preview?.result.places.length &&
    preview.result.places.every(
      (_, index) =>
        locationReviews[index]?.targets.length &&
        locationReviews[index].targets.every(
          (target) => target.status !== 'pending',
        ),
    )
  const unresolved = Object.values(locationReviews).filter(r => r.targets.some(t => t.status !== 'confirmed')).length
  const countSummary = summary && [
    summary.added.length ? `${summary.added.length} added` : '',
    summary.existing.length ? `${summary.existing.length} already saved` : '',
    unresolved ? `${unresolved} unresolved` : '',
  ].filter(Boolean).join(' · ')
  const messages: Partial<Record<SaveState, [string, string]>> = {
    resolving:
      instagramSource.ok && (onPersist || input.trim() !== sampleLink)
        ? [
            'Reading post photos…',
            'Reading the photos for place names. This may take a couple of minutes; locations are looked up next.',
          ]
        : [
            'Finding this place…',
            'Checking the link for a location. You can cancel and enter an address instead.',
          ],
    invalid: [
      onPersist ? 'Check your Instagram link' : 'Check your link or address',
      isUrlInput(manual ? address : input)
        ? (() => {
            const result = parseInstagramLink(manual ? address : input)
            return result.ok ? 'Check your input.' : result.message
          })()
        : onPersist
          ? 'Enter an Instagram post link. Use Place search to add a place by name or address. Your input has been kept.'
          : 'Enter a supported Instagram post link or a sample place name. Your input has been kept.',
    ],
    not_found: [
      'We couldn’t identify the place',
      'No matching demo place was found. This preview does not perform live place search or determine whether a post is private.',
    ],
    import_unavailable: [
      importError
        ? 'Couldn’t analyze this post'
        : 'Instagram import is not connected yet',
      importError ||
        'Your link format is valid. We have not retrieved the post or its photos. No places have been added. You can open the original post or keep this link for later.',
    ],
    import_review: [
      persistSuccess
        ? summary?.added.length === 0
          ? unresolved ? 'Matched places are already saved' : 'All places are already saved'
          : 'Places added to your map'
        : 'Finding places for your map',
      persistSuccess
        ? countSummary || 'View the locations on your map.'
        : 'Locations are matched automatically. Found places will be added together; unavailable locations will be listed separately.',
    ],
    lookup_error: [
      'Couldn’t check this link',
      'Check your connection and try again. Your link is still here.',
    ],
    saving: [
      'Saving your place…',
      'Keep this screen open. Your note and collection are being saved.',
    ],
    save_error: [
      'Couldn’t save your place',
      'Your note and collection are kept. Check your connection, then try again.',
    ],
    duplicate: [
      `Already in ${collection}`,
      'This place is already in this collection. Open it to edit your existing note.',
    ],
    success: ['Place saved', `${resolved.name} is now in ${collection}.`],
  }
  const error = [
    'invalid',
    'not_found',
    'lookup_error',
    'save_error',
    'import_unavailable',
  ].includes(state)
  const message = messages[state]
  const action =
    state === 'resolving'
      ? 'Finding place…'
      : state === 'saving'
        ? 'Saving…'
        : state === 'not_found'
          ? 'Search address'
          : state === 'lookup_error'
            ? 'Try again'
            : state === 'save_error'
              ? 'Retry save'
              : state === 'ready'
                ? 'Save place'
                : state === 'duplicate'
                  ? 'View saved place'
                  : state === 'success'
                    ? 'View place'
                    : 'Find place'
  return {
    previousImport,
    summary,
    importProgress,
    action,
    address,
    busy,
    clipboardMessage,
    collection,
    confirmed,
    confirmedIds,
    dialog,
    editOriginal,
    error,
    handleClose,
    hasPlace,
    importError,
    input,
    inputRef,
    instagramSource,
    locationReviews,
    lookup,
    manual,
    message,
    note,
    paste,
    persistError,
    persistReview,
    persistSuccess,
    persisting,
    preview,
    resolved,
    reviewComplete,
    save,
    setAddress,
    setAutoBusy,
    setCollection,
    setInput,
    setLocationReviews,
    setManual,
    setNote,
    setPersistSuccess,
    setState,
    state,
  }
}
