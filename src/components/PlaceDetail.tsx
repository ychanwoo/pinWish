import { PlaceHours } from './PlaceHours'
import type { PlaceDetails } from '../lib/map-appearance'
import { savedDate } from '../lib/place-presentation'
import { PlaceCoverPhoto } from './PlaceCoverPhoto'
import type { SavedPlace } from '../lib/storage-api'
import { useState } from 'react'
import { asset, placeTags, type Place } from '../data/places'
import { Icon } from './Icon'
import { useModalFocus } from '../hooks/useModalFocus'
interface Props {
  metadata?: PlaceDetails
  metadataError?: string
  onRefreshMetadata?: () => Promise<void>
  collections?: string[]
  onMove?: (collection: string) => Promise<boolean>
  place: Place
  places: Place[]
  onClose: () => void
  onBookmark: () => void
  onVisited: () => void
  onShare: () => void
  onDirections: () => void
  onNote: (note: string) => void | Promise<boolean>
  onDelete?: () => Promise<void>
  onPhotoUpdated?: (place: SavedPlace) => void
  onNotice: (value: string) => void
  onSelect: (id: string) => void
}
export function PlaceDetail({
  metadata, metadataError, onRefreshMetadata,
  collections,
  onMove,
  place,
  places,
  onClose,
  onBookmark,
  onVisited,
  onShare,
  onDirections,
  onNote,
  onNotice,
  onSelect,
  onDelete,
  onPhotoUpdated,
}: Props) {
  const [deleting, setDeleting] = useState(false),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState(''),
    [noteBusy, setNoteBusy] = useState(false)
  const [moveTarget, setMoveTarget] = useState(place.collection)
  const [moveBusy, setMoveBusy] = useState(false)
  const [moveError, setMoveError] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(place.note)
  const [photo, setPhoto] = useState(0)
  const [gallery, setGallery] = useState(false)
  const galleryRef = useModalFocus(gallery, () => setGallery(false))
  const photos =
    place.id === 'grand-central'
      ? [
          '056c4.png',
          '50a7c.png',
          '0bfd6.png',
          'e22ea.png',
          'acf8a.png',
          'be729.png',
        ]
      : [place.photo]
  return (
    <>
      <header className="mobile-detail-header">
        <button
          className="icon-button"
          aria-label="Back to places"
          onClick={onClose}
        >
          <Icon name="f0e6c" />
        </button>
        <h1>Place Detail</h1>
        <button
          className="icon-button"
          aria-label="Toggle bookmark"
          aria-pressed={place.bookmarked}
          onClick={onBookmark}
        >
          <Icon name="1aa6e" />
        </button>
      </header>
      <section
        inert={gallery}
        className="detail-panel"
        aria-label={`${place.name} details`}
      >
        <div className="sheet-handle" />
        <div className="desktop-dossier">
          <button
            className="icon-button"
            aria-label="Close place details"
            onClick={onClose}
          >
            <Icon name="c8142" />
          </button>
          <span>Place dossier</span>
          <button
            className="icon-button"
            aria-label="Toggle bookmark"
            aria-pressed={place.bookmarked}
            onClick={onBookmark}
          >
            <Icon name="35768" />
          </button>
          {!place.saved && (
            <>
              <button
                className="icon-button"
                aria-label="More place options"
                onClick={() =>
                  onNotice(
                    'Use the bookmark, visited, and note controls to update this sample place.',
                  )
                }
              >
                <Icon name="447ad" />
              </button>
            </>
          )}
        </div>
        <div className="detail-scroll">
          <div className="detail-heading">
            <div>
              <p className="detail-category">
                <Icon name="05b16" />
                {place.id === 'grand-central'
                  ? 'DTLA FOOD HALL'
                  : place.saved && place.category === 'Other'
                    ? place.kind
                    : place.category.toUpperCase()}
              </p>
              <h1 tabIndex={-1} id="place-heading">
                {place.name}
                {!place.saved && (
                  <span className="mobile-only">
                    <Icon name="bc707" />
                  </span>
                )}
              </h1>
              <p>
                {place.kind} · {place.district}
                {place.id.split(':')[0] === 'grand-central' && (
                  <span className="desktop-only"> · South Broadway</span>
                )}
              </p>
            </div>
            <button
              className="mobile-detail-close"
              aria-label="Close place details"
              onClick={onClose}
            >
              <Icon name="75bc9" />
            </button>
          </div>
          {place.saved && onPhotoUpdated ? (
            <PlaceCoverPhoto
              key={place.id}
              place={place.saved}
              name={place.name}
              onUpdated={onPhotoUpdated}
            />
          ) : (
            <>
              <button
                className="detail-hero"
                aria-label="Open place photos"
                onClick={() => setGallery(true)}
              >
                <picture>
                  {place.id === 'grand-central' && (
                    <source
                      media="(max-width: 767px)"
                      srcSet={asset('acf8a.png')}
                    />
                  )}
                  <img
                    src={asset(photos[photo])}
                    alt={
                      place.saved
                        ? `No photo available for ${place.name}`
                        : `Inside ${place.name}`
                    }
                  />
                </picture>
                {place.id.split(':')[0] === 'grand-central' && (
                  <span className="photo-caption">
                    DTLA Landmark · Est. 1917
                  </span>
                )}
                <span className="photo-count">
                  <span className="mobile-only">
                    <Icon name="fae89" />
                    {photos.length} photos
                  </span>
                  <span className="desktop-only">
                    {photo + 1} / {photos.length}
                  </span>
                </span>
              </button>
              <div className="photo-thumbnails">
                {photos.slice(1, 4).map((p, i) => (
                  <button
                    key={p}
                    aria-label={`View photo ${i + 2}`}
                    onClick={() => setPhoto(i + 1)}
                  >
                    <img src={asset(p)} alt="" />
                    {i === 2 && <span>+4</span>}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="detail-actions">
            <button
              className="directions-action"
              onClick={onDirections}
              aria-label={
                place.saved ? 'Open directions in Google Maps' : undefined
              }
              title={place.saved ? 'Opens Google Maps in a new tab' : undefined}
            >
              <span className="mobile-only">
                <Icon name="de629" />
              </span>
              <span className="desktop-only">
                <Icon name="47332" />
              </span>
              Directions
            </button>
            <button
              className={`visited-action ${place.visited ? 'is-visited' : ''}`}
              aria-pressed={place.visited}
              onClick={onVisited}
            >
              <span className="visit-status-icon" aria-hidden="true" />
              {place.visited ? 'Visited' : 'Unvisited'}
            </button>
            <button
              className="share-action"
              onClick={onShare}
              title={
                place.saved
                  ? 'Only your account can open this saved place'
                  : undefined
              }
            >
              <Icon name="3a7b9" />
              {place.saved ? 'Copy Link' : 'Share'}
            </button>
          </div>
          {place.saved && (
            <p className="private-link-hint">
              Private link · available only when signed in to your account.
            </p>
          )}
          {!onMove && (
            <div className="mobile-collection-label">
              In collection:{' '}
              <span>
                <Icon name="0c15e" />
                {place.collection}
              </span>
            </div>
          )}
          {onMove && collections && (
            <form
              className="move-collection"
              onSubmit={async (e) => {
                e.preventDefault()
                if (moveBusy || moveTarget === place.collection) return
                setMoveBusy(true)
                setMoveError('')
                try {
                  if (!(await onMove(moveTarget)))
                    setMoveError(
                      'Could not move this place. Refresh your places and try again.',
                    )
                } catch (e) {
                  setMoveError(
                    e instanceof Error
                      ? e.message
                      : 'Could not move this place.',
                  )
                } finally {
                  setMoveBusy(false)
                }
              }}
            >
              <label htmlFor="move-collection">Collection</label>
              <div>
                <select
                  id="move-collection"
                  value={moveTarget}
                  disabled={moveBusy}
                  onChange={(e) => {
                    setMoveTarget(e.target.value)
                    setMoveError('')
                  }}
                >
                  {collections.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <button
                  className="secondary"
                  disabled={moveBusy || moveTarget === place.collection}
                >
                  {moveBusy ? 'Moving…' : 'Move'}
                </button>
              </div>
              {moveError && (
                <p role="alert" className="field-error">
                  {moveError}
                </p>
              )}
            </form>
          )}
          <section className="personal-note">
            <div>
              <strong>
                <Icon name="c21e2" />
                <span className="mobile-only">Personal Notes</span>
                <span className="desktop-only">Personal Field Note</span>
              </strong>
              <button
                aria-label={
                  editing ? 'Cancel note editing' : 'Edit personal note'
                }
                onClick={() => {
                  setNote(place.note)
                  setEditing(!editing)
                }}
              >
                {editing ? (
                  'Cancel'
                ) : (
                  <>
                    <span className="desktop-only">Edit</span>
                    <span className="mobile-only">
                      {place.saved ? 'Edit' : 'Updated 2d ago'}
                    </span>
                  </>
                )}
              </button>
            </div>
            {editing ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (noteBusy) return
                  setNoteBusy(true)
                  try {
                    const ok = await onNote(note)
                    if (ok !== false) setEditing(false)
                  } finally {
                    setNoteBusy(false)
                  }
                }}
              >
                <textarea
                  autoFocus
                  aria-label="Personal note"
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button disabled={noteBusy} className="primary small">
                  {noteBusy ? 'Saving…' : 'Save note'}
                </button>
              </form>
            ) : (
              <p>
                {place.note ? '“' : 'No note yet.'}
                {place.id === 'grand-central' &&
                note ===
                  'Try the carnitas at Villa Morelianas. Great coffee at G&B near the hill street entrance.' ? (
                  <>
                    <span className="desktop-only">{note}</span>
                    <span className="mobile-only">
                      Try the carnitas at Villa Morelianas. Great coffee at
                      G&amp;B.
                    </span>
                  </>
                ) : (
                  note
                )}
                {place.note ? '”' : ''}
              </p>
            )}
          </section>
          <div className="mobile-address">
            <Icon name="dbfc5" />
            <p>{place.address}</p>
            <button
              className="icon-button"
              aria-label="Copy address"
              onClick={() => {
                if (!navigator.clipboard) {
                  onNotice(place.address)
                  return
                }
                void navigator.clipboard
                  .writeText(place.address)
                  .then(() => onNotice('Address copied.'))
                  .catch(() => onNotice(place.address))
              }}
            >
              <Icon name="95284" />
            </button>
          </div>
          <dl className={`place-facts ${place.saved && onRefreshMetadata ? 'has-live-hours' : ''}`}>
            <div>
              <dt>Assigned Collection</dt>
              <dd>
                <span className="collection-tag">
                  <span className="dot" />
                  {place.collection}
                  {!place.saved && ' ›'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                {place.saved ? (
                  Object.keys(place.saved.sources).length === 0 ? (
                    <span>
                      {place.saved.searchOrigin
                        ? 'Added from place search'
                        : 'Source unavailable'}
                    </span>
                  ) : (
                    Object.values(place.saved.sources).map((source) => (
                      <a
                        key={source.canonicalUrl + source.slides.join(',')}
                        href={source.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Instagram · photos {source.slides.join(', ')}
                        {place.saved?.countryCode === 'KR'
                          ? ` · ${source.correctedName || source.extractedName}`
                          : ''}
                      </a>
                    ))
                  )
                ) : (
                  <button
                    onClick={() =>
                      onNotice(
                        'This is a sample saved place. Live source links will be connected with the backend.',
                      )
                    }
                  >
                    Saved from Google Maps link <Icon name="a21ff" />
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Date Saved</dt>
              <dd>
                {place.saved
                  ? savedDate(place.saved.createdAt)
                  : 'Saved on Oct 14, 2025'}
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{place.address}</dd>
            </div>
            <div className="place-hours-row">
              <dt>Operating Hours</dt>
              <dd>{place.saved && onRefreshMetadata ? <PlaceHours data={metadata} error={metadataError} onRefresh={onRefreshMetadata} /> : 'Hours not available'}</dd>
            </div>
          </dl>
          {onDelete && (
            <div className={`delete-place ${deleting ? 'is-confirming' : ''}`}>
              {deleting ? (
                <>
                  <p>Delete this saved place and its source references?</p>
                  {deleteError && (
                    <p role="alert" className="field-error">
                      {deleteError}
                    </p>
                  )}
                  <button
                    disabled={deleteBusy}
                    className="delete-cancel"
                    onClick={() => setDeleting(false)}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={deleteBusy}
                    className="delete-confirm"
                    onClick={async () => {
                      setDeleteBusy(true)
                      setDeleteError('')
                      try {
                        await onDelete()
                      } catch (e) {
                        setDeleteError(
                          e instanceof Error ? e.message : 'Delete failed.',
                        )
                      } finally {
                        setDeleteBusy(false)
                      }
                    }}
                  >
                    {deleteBusy ? 'Deleting…' : 'Confirm delete'}
                  </button>
                </>
              ) : (
                <button
                  className="delete-trigger"
                  onClick={() => setDeleting(true)}
                >
                  Delete place
                </button>
              )}
            </div>
          )}
          {placeTags(place).length > 0 && (
            <div className="detail-tags">
              <p className="eyebrow">Tags</p>
              <div>
                {placeTags(place).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </div>
          )}
          <div className="nearby-places">
            <div>
              More Saved Places
              <span>
                {Math.min(
                  2,
                  places.filter(
                    (p) =>
                      p.id !== place.id && p.collection === place.collection,
                  ).length,
                )}{' '}
                saved places
              </span>
            </div>
            {places
              .filter(
                (p) => p.id !== place.id && p.collection === place.collection,
              )
              .slice(0, 2)
              .map((p) => (
                <button key={p.id} onClick={() => onSelect(p.id)}>
                  <Icon name="8bedb" />
                  <span>
                    {p.name}
                    <small>
                      {p.kind} · {p.district}
                    </small>
                  </span>
                  <Icon name="14812" />
                </button>
              ))}
          </div>
        </div>
        <footer className="detail-footer">
          <button className="primary" onClick={onDirections}>
            <Icon name="d7ebc" />
            {place.saved ? 'Open in Google Maps' : 'Start Walking Route'}
          </button>
        </footer>
      </section>
      {gallery && (
        <div
          ref={galleryRef}
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Place photos"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setGallery(false)
          }}
        >
          <button
            autoFocus
            className="lightbox-close"
            onClick={() => setGallery(false)}
          >
            Close ×
          </button>
          <img
            src={asset(photos[photo])}
            alt={`${place.name}, photo ${photo + 1}`}
          />
          <div>
            <button
              onClick={() =>
                setPhoto((photo + photos.length - 1) % photos.length)
              }
            >
              ← Previous
            </button>
            <span>
              {photo + 1} / {photos.length}
            </span>
            <button onClick={() => setPhoto((photo + 1) % photos.length)}>
              Next →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
