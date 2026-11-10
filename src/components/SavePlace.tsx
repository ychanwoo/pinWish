import { PlaceConfirmation } from './PlaceConfirmation'
import type {
  ConfirmedPlace,
  CandidateLocationDraft,
} from '../lib/place-search'
import {
  isInstagramPreview,
  importErrorMessages,
  type InstagramPreview,
} from '../lib/instagram-preview'
import { getPlaceDisplayName } from '../lib/place-name'
import { isUrlInput, parseInstagramLink } from '../lib/instagram'
import { useEffect, useRef, useState } from 'react'
import {
  initialPlaces,
  resolveSample,
  sampleLink,
  validInput,
  type Place,
  type SaveState,
} from '../data/places'
import { Icon } from './Icon'
import { MiniMap } from './MapView'
export interface SaveDraft {
  state: SaveState
  input: string
  address: string
  note: string
  collection: string
  resolved: Place
  manual: boolean
  preview?: InstagramPreview | null
  importError?: string
  locationReviews?: Record<number, CandidateLocationDraft>
}
interface Props {
  draft: SaveDraft | null
  onDraft: (draft: SaveDraft | null) => void
  initialState: SaveState
  collections: string[]
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
    collection: string,
  ) => Promise<void>
  onRequireLogin?: (draft: SaveDraft) => void
  authenticated?: boolean
}
export function SavePlace({
  draft,
  onDraft,
  initialState,
  collections,
  defaultCollection,
  places,
  scenario,
  onClose,
  onSaved,
  onView,
  onMap,
  onPersist,
  onRequireLogin,
  authenticated,
}: Props) {
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
  const [collection, setCollection] = useState(
    draft?.collection ??
      (collections.includes(defaultCollection)
        ? defaultCollection
        : collections[0]),
  )
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
  const [editingCandidate, setEditingCandidate] = useState<number | null>(null)
  const [candidateName, setCandidateName] = useState('')
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
  const busy = state === 'saving' || state === 'resolving' || persisting
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
  const lookup = async () => {
    const value = (manual ? address : input).trim()
    cancelPending()
    if (!validInput(value)) {
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
      isUrlInput(value) &&
      value !== sampleLink &&
      value !== 'https://maps.app.goo.gl/grandcentral'
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
      setState('resolving')
      const deadline = setTimeout(() => controller.abort(), 110000)
      try {
        const response = await fetch('/api/instagram/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value }),
          signal: controller.signal,
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
              slides: place.slides,
              evidence: place.evidence,
              needsLocationConfirmation: true,
            })),
          },
        })
        setState('import_review')
      } catch {
        if (id !== request.current) return
        setImportError(
          'The analysis service is unavailable or timed out. Your link is kept. Start the local API to test this experimental flow.',
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
        'Use a real Instagram post and confirm its locations before saving to your account.',
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
  const persistReview = async () => {
    const reviewDraft: SaveDraft = {
      state,
      input,
      address,
      note,
      collection,
      resolved,
      manual,
      preview,
      importError,
      locationReviews,
    }
    onDraft(reviewDraft)
    if (!authenticated && onRequireLogin) {
      onRequireLogin(reviewDraft)
      return
    }
    if (!onPersist || persisting) return
    const confirmedPlaces = Object.values(locationReviews).flatMap((r) =>
      r.targets.flatMap((t) =>
        t.status === 'confirmed' && t.confirmed ? [t.confirmed] : [],
      ),
    )
    if (!confirmedPlaces.length) {
      setPersistError('Confirm at least one location before saving.')
      return
    }
    setPersisting(true)
    setPersistError('')
    try {
      await onPersist(confirmedPlaces, note, collection)
      setPersistSuccess(true)
      onDraft(null)
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
  const messages: Partial<Record<SaveState, [string, string]>> = {
    resolving:
      instagramSource.ok && input.trim() !== sampleLink
        ? [
            'Reading post photos…',
            'Extracting place names for review. This can take up to 95 seconds; addresses are not being verified yet.',
          ]
        : [
            'Finding this place…',
            'Checking the link for a location. You can cancel and enter an address instead.',
          ],
    invalid: [
      'Check your link or address',
      isUrlInput(manual ? address : input)
        ? (() => {
            const result = parseInstagramLink(manual ? address : input)
            return result.ok ? 'Check your input.' : result.message
          })()
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
      'Review places and confirm locations',
      'Check extracted names, search for the intended locations, and confirm their addresses. Your review stays in this session; nothing is saved to the map yet.',
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
  return (
    <div className="save-overlay">
      <div
        className={`save-dialog save-${state}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        aria-busy={busy}
        tabIndex={-1}
        ref={dialog}
      >
        <header className="save-header">
          <button
            className="mobile-only icon-button"
            disabled={state === 'saving'}
            aria-label="Back to places"
            onClick={handleClose}
          >
            <Icon name="f0e6c" />
          </button>
          <h1 id="save-title">Save a place</h1>
          <button
            className="desktop-only icon-button"
            disabled={state === 'saving'}
            aria-label="Close save dialog"
            onClick={handleClose}
          >
            <Icon name="c8142" />
          </button>
        </header>
        <form
          className="save-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && !confirmed && state !== 'import_review') {
              if (hasPlace) save()
              else void lookup()
            }
          }}
        >
          <div className="save-body">
            {state === 'entry' && (
              <div className="save-intro">
                <h2>Save somewhere worth going.</h2>
                <p>Paste a social post, a map link, or a street address.</p>
              </div>
            )}
            {message && (
              <div
                className={`inline-status ${error ? 'error' : ''}`}
                role={error ? 'alert' : 'status'}
                id="save-status"
              >
                <strong>{message[0]}</strong>
                <p>{message[1]}</p>
              </div>
            )}
            {state === 'import_unavailable' && instagramSource.ok && (
              <div className="field-help">
                <p>
                  One post can contain several photos. The selected photo number
                  does not limit the intended import.
                </p>
                <a
                  href={instagramSource.source.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open original Instagram post
                </a>
              </div>
            )}
            {persistError && (
              <p role="alert" className="field-error">
                {persistError}
              </p>
            )}
            {persistSuccess && (
              <p role="status">
                Confirmed places saved to your account. You can find them in
                your saved places.
              </p>
            )}
            {state === 'import_review' && preview && (
              <section
                aria-label="Extracted place candidates"
                className="import-candidates"
                inert={persisting || persistSuccess}
              >
                <p>
                  {preview.fetchedImages} photos analyzed ·{' '}
                  {preview.result.places.length} place candidates
                </p>
                <p className="field-help">
                  Original names are preserved. Confirmed locations use Korean
                  names in South Korea and English elsewhere when available.
                </p>
                {preview.result.places.length === 0 && (
                  <p>
                    No readable place names were extracted. This does not mean
                    the post contains no places. Review the original post.
                  </p>
                )}
                <ol>
                  {preview.result.places.map((place, index) => (
                    <li
                      key={`${place.name}-${index}`}
                      aria-label={`Place candidate ${index + 1}`}
                    >
                      {editingCandidate === index ? (
                        <div className="candidate-edit">
                          <p>Changing this name resets its location review.</p>
                          <label htmlFor={`candidate-name-${index}`}>
                            Place name
                          </label>
                          <input
                            id={`candidate-name-${index}`}
                            className="link-input"
                            value={candidateName}
                            maxLength={200}
                            onChange={(event) =>
                              setCandidateName(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            disabled={!candidateName.trim()}
                            onClick={() => {
                              setPreview({
                                ...preview,
                                result: {
                                  ...preview.result,
                                  places: preview.result.places.map((p, i) =>
                                    i === index
                                      ? {
                                          ...p,
                                          correctedName: candidateName.trim(),
                                        }
                                      : p,
                                  ),
                                },
                              })
                              setLocationReviews((previous) => {
                                const next = { ...previous }
                                delete next[index]
                                return next
                              })
                              setEditingCandidate(null)
                            }}
                          >
                            Keep name correction
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCandidate(null)}
                          >
                            Cancel correction
                          </button>
                        </div>
                      ) : (
                        <>
                          <strong>
                            {locationReviews[index]?.targets.length === 1 &&
                            locationReviews[index].targets[0].status ===
                              'confirmed'
                              ? locationReviews[index].targets[0].confirmed
                                  ?.displayName
                              : getPlaceDisplayName({
                                  sourceName: place.name,
                                  correctedName: place.correctedName,
                                })}
                          </strong>{' '}
                          <button
                            type="button"
                            aria-label={`Edit candidate ${index + 1} name`}
                            onClick={() => {
                              setCandidateName(
                                getPlaceDisplayName({
                                  sourceName: place.name,
                                  correctedName: place.correctedName,
                                }),
                              )
                              setEditingCandidate(index)
                            }}
                          >
                            Edit name
                          </button>
                          {place.correctedName && (
                            <small>
                              {' '}
                              · Name edited by you; location still unverified
                            </small>
                          )}
                        </>
                      )}
                      <p>
                        {place.regionHint || 'Region needs confirmation'} ·
                        Photos {place.slides.join(', ')}
                      </p>
                      <small>Read from photo: {place.evidence}</small>
                      {place.correctedName && (
                        <p className="field-help">
                          Originally extracted name: {place.name}
                        </p>
                      )}
                      {instagramSource.ok && (
                        <PlaceConfirmation
                          key={`${index}-${place.correctedName ?? ''}`}
                          candidateNumber={index + 1}
                          source={{
                            instagram: instagramSource.source,
                            slides: place.slides,
                            extractedName: place.name,
                            correctedName: place.correctedName,
                            evidence: place.evidence,
                          }}
                          initialRegion={place.regionHint}
                          value={locationReviews[index]}
                          confirmedIds={confirmedIds}
                          onChange={(review) =>
                            setLocationReviews((previous) => ({
                              ...previous,
                              [index]: review,
                            }))
                          }
                        />
                      )}
                      {instagramSource.ok && (
                        <p>
                          {place.slides.map((slide) => (
                            <a
                              key={slide}
                              href={`${instagramSource.source.canonicalUrl}?img_index=${slide}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Review photo {slide}{' '}
                            </a>
                          ))}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
                {preview.result.ignoredSlides.length > 0 && (
                  <p>
                    No candidate extracted from photos{' '}
                    {preview.result.ignoredSlides.join(', ')}. These may be
                    covers, promotions or unreadable text; check the original.
                  </p>
                )}
                {onPersist && (
                  <div className="cloud-save-fields">
                    <label>
                      Note for these places
                      <textarea
                        value={note}
                        maxLength={1000}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <label>
                      Collection name
                      <input
                        value={collection}
                        maxLength={60}
                        onChange={(e) => setCollection(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <p>
                  Confirm each location or skip it. For a photo listing multiple
                  places, add a separate location search for each. Saving to a
                  live map comes next.
                </p>
                {instagramSource.ok && (
                  <a
                    href={instagramSource.source.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open original Instagram post
                  </a>
                )}
              </section>
            )}
            {!confirmed && (
              <>
                <label className="field-label" htmlFor="place-input">
                  {manual && !hasPlace
                    ? 'Place name or address'
                    : 'Link or address'}
                </label>
                <div className="link-input-wrap">
                  <input
                    ref={inputRef}
                    id="place-input"
                    className="link-input"
                    placeholder="Paste a link or enter an address"
                    maxLength={2048}
                    value={manual && !hasPlace ? address : input}
                    readOnly={busy || hasPlace || state === 'import_review'}
                    disabled={state === 'saving'}
                    aria-invalid={state === 'invalid' || state === 'not_found'}
                    aria-describedby={message ? 'save-status' : undefined}
                    onChange={(e) => {
                      if (manual && !hasPlace) setAddress(e.target.value)
                      else setInput(e.target.value)
                    }}
                  />
                  <button
                    className="desktop-paste"
                    type="button"
                    disabled={busy || hasPlace || state === 'import_review'}
                    onClick={() => void paste()}
                  >
                    <Icon name="61e58" />
                    Paste
                  </button>
                </div>
              </>
            )}
            {state === 'entry' && (
              <>
                <button
                  type="button"
                  className="secondary paste-button"
                  onClick={() => void paste()}
                >
                  Paste from clipboard
                </button>
                <p className="field-help">
                  We’ll ask you to confirm the location before saving.
                </p>
                <p className="field-help">
                  UI demo: sample places only. Instagram photo import and cloud
                  saving are not connected yet.
                </p>
              </>
            )}
            {clipboardMessage && (
              <p className="field-help" role="status">
                {clipboardMessage}
              </p>
            )}
            {state === 'resolving' && (
              <div className="lookup-skeletons" aria-hidden="true">
                <div />
                <div />
              </div>
            )}
            {hasPlace && (
              <>
                <div className="resolved-place">
                  <div>
                    <strong>{resolved.name}</strong>
                    <p>{resolved.address}</p>
                  </div>
                  {!confirmed && (
                    <button
                      type="button"
                      className="desktop-change"
                      disabled={busy}
                      onClick={() => {
                        setManual(true)
                        setAddress(resolved.name + ', Los Angeles')
                        setState('not_found')
                      }}
                    >
                      Change
                    </button>
                  )}
                </div>
                <MiniMap desktop />
                <button
                  type="button"
                  className={`secondary change-location ${confirmed ? 'hidden' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setManual(true)
                    setAddress(resolved.name + ', Los Angeles')
                    setState('not_found')
                  }}
                >
                  Change location
                </button>
              </>
            )}
            {hasPlace && !confirmed && (
              <>
                <label className="field-label" htmlFor="personal-note">
                  Personal note
                </label>
                <textarea
                  id="personal-note"
                  value={note}
                  maxLength={1000}
                  disabled={busy}
                  placeholder="What do you want to remember?"
                  onChange={(e) => setNote(e.target.value)}
                />
                <label className="field-label" htmlFor="save-collection">
                  Collection
                </label>
                <div className="collection-select-wrap">
                  <select
                    id="save-collection"
                    value={collection}
                    disabled={busy}
                    onChange={(e) => setCollection(e.target.value)}
                  >
                    {collections.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <span className="mobile-only">Change</span>
                </div>
              </>
            )}
          </div>
          <footer className="save-footer">
            {state === 'saving' && (
              <p className="field-help" role="status">
                Saving in progress. Please wait.
              </p>
            )}
            <button
              type="button"
              className="secondary desktop-cancel"
              disabled={state === 'saving'}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              className="primary"
              type={
                confirmed || state === 'import_review' ? 'button' : 'submit'
              }
              disabled={busy || (state === 'import_review' && !reviewComplete)}
              onClick={
                state === 'import_review'
                  ? persistSuccess
                    ? handleClose
                    : onPersist
                      ? () => void persistReview()
                      : handleClose
                  : confirmed
                    ? () => onView(resolved)
                    : undefined
              }
            >
              {state === 'ready' && (
                <span className="desktop-only">
                  <Icon name="41542" />
                </span>
              )}
              {state === 'import_review'
                ? persisting
                  ? 'Saving places…'
                  : persistSuccess
                    ? 'Done'
                    : reviewComplete
                      ? onPersist
                        ? authenticated
                          ? 'Save confirmed places'
                          : 'Sign in to save'
                        : 'Done reviewing'
                      : 'Location confirmation pending'
                : action}
            </button>
            {[
              'resolving',
              'not_found',
              'lookup_error',
              'import_unavailable',
              'import_review',
              'success',
            ].includes(state) && (
              <button
                className="secondary"
                type="button"
                disabled={persisting}
                onClick={
                  state === 'success'
                    ? () => {
                        onDraft(null)
                        onMap()
                      }
                    : editOriginal
                }
              >
                {state === 'resolving'
                  ? 'Cancel lookup'
                  : state === 'success'
                    ? 'Back to map'
                    : 'Edit original link'}
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  )
}
