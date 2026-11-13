import { LoadingOverlay } from '../shared/LoadingOverlay'
export type { DirectDraft } from './useDirectPlace'
import { useDirectPlace, type DirectPlaceProps } from './useDirectPlace'
export function DirectPlace(props: DirectPlaceProps) {
  const {
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
  } = useDirectPlace(props)
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
