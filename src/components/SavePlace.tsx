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
  const [clipboardMessage, setClipboardMessage] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const request = useRef(0)
  const lookupAttempts = useRef(0)
  const saveAttempts = useRef(0)
  const closeRef = useRef<() => void>(() => {})
  const handleClose = () => {
    if (state === 'saving') return
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
          },
    )
    onClose()
  }
  useEffect(() => {
    closeRef.current = handleClose
  })
  const busy = state === 'saving' || state === 'resolving'
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
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
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
      clearTimeout(timer.current)
      request.current += 1
      document.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [onClose])
  const lookup = () => {
    const value = manual ? address : input
    if (!validInput(value)) {
      setState('invalid')
      inputRef.current?.focus()
      return
    }
    cancelPending()
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
    cancelPending()
    setManual(false)
    setState('entry')
  }
  const messages: Partial<Record<SaveState, [string, string]>> = {
    resolving: [
      'Finding this place…',
      'Checking the link for a location. You can cancel and enter an address instead.',
    ],
    invalid: [
      'Check your link or address',
      'Enter a complete https:// link or a street address. Your input has been kept.',
    ],
    not_found: [
      'We couldn’t identify the place',
      'The post may be private or may not include a location. Enter the place name and street address instead.',
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
  const error = ['invalid', 'not_found', 'lookup_error', 'save_error'].includes(
    state,
  )
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
            if (!busy && !confirmed) {
              if (hasPlace) save()
              else lookup()
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
                    readOnly={busy || hasPlace}
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
                    disabled={busy || hasPlace}
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
                  Your original link stays with the place so you can revisit the
                  post.
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
              type={confirmed ? 'button' : 'submit'}
              disabled={busy}
              onClick={confirmed ? () => onView(resolved) : undefined}
            >
              {state === 'ready' && (
                <span className="desktop-only">
                  <Icon name="41542" />
                </span>
              )}
              {action}
            </button>
            {['resolving', 'not_found', 'lookup_error', 'success'].includes(
              state,
            ) && (
              <button
                className="secondary"
                type="button"
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
