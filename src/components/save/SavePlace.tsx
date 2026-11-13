import { LoadingOverlay } from '../shared/LoadingOverlay'
import { AutomaticPlaces } from './AutomaticPlaces'
import { Icon } from '../shared/Icon'
import { MiniMap } from '../maps/MapView'
export type { SaveDraft } from './useSavePlace'
import { useSavePlace, type SavePlaceProps } from './useSavePlace'
export function SavePlace({
  onDirectSearch,
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
}: SavePlaceProps) {
  const {
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
  } = useSavePlace({
    onDirectSearch,
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
  })
  return (
    <div className="save-overlay">
      <LoadingOverlay
        active={busy}
        onCancel={state === 'resolving' ? editOriginal : undefined}
      />
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
        {onDirectSearch &&
          ['entry', 'invalid', 'lookup_error'].includes(state) && (
            <div
              className="save-methods"
              aria-label="Choose how to add a place"
            >
              <button type="button" aria-pressed="true">
                Instagram link
              </button>
              <button
                type="button"
                aria-pressed="false"
                onClick={() => {
                  onDraft({
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
                  })
                  onDirectSearch()
                }}
              >
                Place search
              </button>
            </div>
          )}
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
                <p>
                  {onPersist
                    ? 'Paste an Instagram post link to find its places. Use Place search to add a place by name or address.'
                    : 'Paste a social post, a map link, or a street address.'}
                </p>
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
                Located places were added to your map. Some locations may still
                need another lookup.
              </p>
            )}
            {state === 'import_review' && preview && instagramSource.ok && (
              <AutomaticPlaces
                preview={preview}
                source={instagramSource.source}
                value={locationReviews}
                onChange={setLocationReviews}
                saving={persisting}
                saved={persistSuccess}
                onBusy={(value) => {
                  setAutoBusy(value)
                  if (value) setPersistSuccess(false)
                }}
                onComplete={(reviews) => {
                  setLocationReviews(reviews)
                  if (
                    onPersist &&
                    Object.values(reviews).some((r) =>
                      r.targets.some((t) => t.status === 'confirmed'),
                    )
                  )
                    void persistReview(reviews, true)
                }}
              />
            )}
            {!confirmed && (
              <>
                <label className="field-label" htmlFor="place-input">
                  {onPersist
                    ? 'Instagram post link'
                    : manual && !hasPlace
                      ? 'Place name or address'
                      : 'Link or address'}
                </label>
                <div className="link-input-wrap">
                  <input
                    ref={inputRef}
                    id="place-input"
                    className="link-input"
                    placeholder={
                      onPersist
                        ? 'https://www.instagram.com/p/...'
                        : 'Paste a link or enter an address'
                    }
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
                  {onPersist
                    ? 'Found locations will be added automatically to your map. You can edit or delete them afterwards.'
                    : 'Locations will be looked up automatically. This preview does not save to an account.'}
                </p>
                {!onPersist && (
                  <p className="field-help">
                    Demo mode: account storage is not connected.
                  </p>
                )}
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
          <footer
            className={`save-footer ${state === 'import_review' ? 'review-footer' : ''}`}
          >
            {state === 'import_review' && !persistSuccess && !persisting && (
              <p className="field-help" id="map-save-help">
                {!reviewComplete
                  ? 'Finding locations automatically…'
                  : !confirmedIds.length
                    ? 'No locations could be found. Retry the missing places or try another post.'
                    : 'Located places are ready to add to your map.'}
              </p>
            )}
            {state === 'saving' && (
              <p className="field-help" role="status">
                Saving in progress. Please wait.
              </p>
            )}
            {state !== 'resolving' && (
              <button
                type="button"
                className="secondary desktop-cancel"
                disabled={state === 'saving' || persisting}
                onClick={handleClose}
              >
                Cancel
              </button>
            )}
            <button
              className="primary"
              type={
                confirmed || state === 'import_review' ? 'button' : 'submit'
              }
              disabled={
                busy ||
                (state === 'import_review' &&
                  (!reviewComplete || (!!onPersist && !confirmedIds.length)))
              }
              aria-describedby={
                state === 'import_review' && !persistSuccess && !persisting
                  ? 'map-save-help'
                  : undefined
              }
              onClick={
                state === 'import_review'
                  ? persistSuccess
                    ? onMap
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
                  ? 'Adding to map…'
                  : persistSuccess
                    ? 'View map'
                    : reviewComplete
                      ? onPersist
                        ? authenticated
                          ? 'Add to map'
                          : 'Sign in to save'
                        : 'Done'
                      : 'Add to map'
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
                className={
                  state === 'import_review' ? 'save-edit-link' : 'secondary'
                }
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
                  ? 'Stop searching'
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
