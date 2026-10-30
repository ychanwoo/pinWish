import { useState } from 'react'
import { asset, placeTags, type Place } from '../data/places'
import { Icon } from './Icon'
import { useModalFocus } from '../hooks/useModalFocus'
interface Props {
  place: Place
  places: Place[]
  onClose: () => void
  onBookmark: () => void
  onVisited: () => void
  onShare: () => void
  onDirections: () => void
  onNote: (note: string) => void
  onNotice: (value: string) => void
  onSelect: (id: string) => void
}
export function PlaceDetail({
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
}: Props) {
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
        </div>
        <div className="detail-scroll">
          <div className="detail-heading">
            <div>
              <p className="detail-category">
                <Icon name="05b16" />
                {place.id === 'grand-central'
                  ? 'DTLA FOOD HALL'
                  : place.category.toUpperCase()}
              </p>
              <h1 tabIndex={-1} id="place-heading">
                {place.name}
                <span className="mobile-only">
                  <Icon name="bc707" />
                </span>
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
              <img src={asset(photos[photo])} alt={`Inside ${place.name}`} />
            </picture>
            {place.id.split(':')[0] === 'grand-central' && (
              <span className="photo-caption">DTLA Landmark · Est. 1917</span>
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
          <div className="detail-actions">
            <button className="directions-action" onClick={onDirections}>
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
              <Icon name="792fb" />
              {place.visited ? 'Visited' : 'Unvisited'}
            </button>
            <button className="share-action" onClick={onShare}>
              <Icon name="3a7b9" />
              Share
            </button>
          </div>
          <div className="mobile-collection-label">
            In collection:{' '}
            <span>
              <Icon name="0c15e" />
              {place.collection}
            </span>
          </div>
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
                    <span className="mobile-only">Updated 2d ago</span>
                  </>
                )}
              </button>
            </div>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  onNote(note)
                  setEditing(false)
                }}
              >
                <textarea
                  autoFocus
                  aria-label="Personal note"
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button className="primary small">Save note</button>
              </form>
            ) : (
              <p>
                “
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
                ”
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
          <dl className="place-facts">
            <div>
              <dt>Assigned Collection</dt>
              <dd>
                <span className="collection-tag">
                  <span className="dot" />
                  {place.collection} ›
                </span>
              </dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                <button
                  onClick={() =>
                    onNotice(
                      'This is a sample saved place. Live source links will be connected with the backend.',
                    )
                  }
                >
                  Saved from Google Maps link <Icon name="a21ff" />
                </button>
              </dd>
            </div>
            <div>
              <dt>Date Saved</dt>
              <dd>Saved on Oct 14, 2025</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{place.address}</dd>
            </div>
            <div>
              <dt>Operating Hours</dt>
              <dd>
                <span className="open-dot" />
                Hours not verified
              </dd>
            </div>
          </dl>
          <div className="detail-tags">
            <p className="eyebrow">Tags</p>
            <div>
              {placeTags(place).map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
          </div>
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
            Start Walking Route
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
