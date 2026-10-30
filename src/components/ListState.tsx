import { Icon } from './Icon'
export function ListState({
  loading,
  onBack,
  onRetry,
  onMap,
}: {
  loading: boolean
  onBack: () => void
  onRetry: () => void
  onMap: () => void
}) {
  return (
    <section className="list-state" aria-busy={loading}>
      <header className="save-header">
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="Back to places"
        >
          <Icon name="f0e6c" />
        </button>
        <h1>Your places</h1>
      </header>
      <div className="list-state-body">
        <h2>LA weekend</h2>
        <p role={loading ? 'status' : undefined}>
          {loading ? 'Loading your saved places…' : 'Saved in Los Angeles'}
        </p>
        {loading ? (
          <div aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="list-skeleton" key={i}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="inline-status error" role="alert">
              <strong>Couldn’t load your places</strong>
              <p>
                Check your connection and try again. Your saved places have not
                been deleted.
              </p>
            </div>
            <button className="primary" onClick={onRetry}>
              Try again
            </button>
            <button className="secondary" onClick={onMap}>
              Back to map
            </button>
          </>
        )}
      </div>
    </section>
  )
}
