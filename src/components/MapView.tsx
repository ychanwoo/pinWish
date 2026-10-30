import { useState } from 'react'
import { asset, type Place } from '../data/places'
import { Icon } from './Icon'
interface Props {
  places: Place[]
  selected: Place
  mode?: 'workspace' | 'map' | 'detail' | 'empty' | 'saved'
  onSelect: (place: Place) => void
  onDetail: (place: Place) => void
  onSave: () => void
  onNotice: (text: string) => void
  onBookmark: (place: Place) => void
  onDirections: (place: Place) => void
}
const positions = [
  { x: 52, y: 45 },
  { x: 76, y: 53.6 },
  { x: 41, y: 32.5 },
  { x: 23, y: 65 },
  { x: 77, y: 69 },
]
const desktopPositions = [
  { x: 48, y: 40.5 },
  { x: 53, y: 46 },
  { x: 46, y: 38 },
  { x: 24, y: 63 },
  { x: 55, y: 48 },
]
const savedPositions = [
  { x: 52, y: 49 },
  { x: 47, y: 42 },
  { x: 38, y: 32 },
  { x: 63, y: 27 },
  { x: 72, y: 55 },
]
const mobilePinIcons = ['17d91', '4d672', 'bde4a', 'cea1b', '5041c'] as const
const pinIcons = ['17d91', '29c3d', 'e6913', 'b24f2', '5f3e4'] as const
export function MapView({
  places,
  selected,
  mode = 'workspace',
  onSelect,
  onDetail,
  onSave,
  onNotice,
  onBookmark,
  onDirections,
}: Props) {
  const [zoom, setZoom] = useState(1)
  const [layers, setLayers] = useState(false)
  const detail = mode === 'detail'
  return (
    <section
      className={`map-view map-${mode}`}
      aria-label="Illustrative Los Angeles map"
    >
      <div className="map-artwork" style={{ transform: `scale(${zoom})` }}>
        <img
          className="map-background"
          src={asset('bc7b9.png')}
          alt="Illustrative street map of downtown Los Angeles"
        />
        {mode !== 'empty' &&
          places.map((p) => {
            const index = [
              'grand-central',
              'maru',
              'broad',
              'gjusta',
              'hauser',
            ].indexOf(p.id.split(':')[0])
            const n = Math.max(0, index)
            const pos = positions[n]
            const desktop =
              mode === 'saved'
                ? savedPositions[n]
                : detail
                  ? positions[n]
                  : desktopPositions[n]
            return (
              <div
                key={p.id}
                className={`map-pin ${selected.id === p.id ? 'selected' : ''} ${detail && selected.id !== p.id ? 'detail-secondary' : ''}`}
                style={
                  {
                    '--pin-x': `${pos.x}%`,
                    '--pin-y': `${pos.y}%`,
                    '--desktop-x': `${desktop.x}%`,
                    '--desktop-y': `${desktop.y}%`,
                  } as React.CSSProperties
                }
              >
                <button
                  className="map-pin-trigger"
                  onClick={() => onSelect(p)}
                  aria-label={`Select ${p.name}`}
                  aria-pressed={selected.id === p.id}
                >
                  {(detail ||
                    selected.id === p.id ||
                    (mode === 'saved' && p.id === 'broad')) && (
                    <span
                      className={`pin-label ${selected.id !== p.id ? 'secondary-pin-label' : ''}`}
                    >
                      {!detail && (
                        <span className="mobile-only">
                          <Icon name="460f1" />
                        </span>
                      )}
                      {detail || mode === 'saved'
                        ? p.name
                        : p.name === 'Grand Central Market'
                          ? 'Grand Central Mkt'
                          : p.name}
                    </span>
                  )}
                  {((detail && selected.id === p.id) || mode === 'saved') && (
                    <span
                      className={`vector-pin ${mode === 'saved' && selected.id !== p.id ? 'secondary-vector' : ''}`}
                    >
                      <Icon
                        name={
                          detail
                            ? '2c5cb'
                            : selected.id === p.id
                              ? '59208'
                              : p.id === 'broad'
                                ? '6d818'
                                : 'd01d2'
                        }
                      />
                      {(detail || selected.id === p.id || p.id === 'broad') && (
                        <span className="vector-ring">
                          <Icon
                            name={
                              detail
                                ? '804eb'
                                : selected.id === p.id
                                  ? '3bcbb'
                                  : '6dbbe'
                            }
                          />
                        </span>
                      )}
                      {(detail || selected.id === p.id) && (
                        <span className="vector-center">
                          <Icon name={detail ? 'bf2c3' : '84ffb'} />
                        </span>
                      )}
                    </span>
                  )}
                  <span className="pin-circle">
                    <span className="desktop-only">
                      <Icon name={pinIcons[n]} />
                    </span>
                    <span className="mobile-only">
                      <Icon name={detail ? '912b4' : mobilePinIcons[n]} />
                    </span>
                    <span className="pin-dot" />
                  </span>
                </button>
                {selected.id === p.id &&
                  (mode === 'workspace' || mode === 'map') && (
                    <button
                      className="desktop-map-callout"
                      aria-label={`View details for ${p.name}`}
                      onClick={() => onDetail(p)}
                    >
                      <span className="dot" />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.kind} · {p.visited ? 'Visited' : 'Unvisited'}
                        </small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )}
              </div>
            )
          })}
      </div>
      {mode === 'workspace' && (
        <div className="desktop-layers">
          <span>Layer:</span>
          <button className="active" onClick={() => setLayers(!layers)}>
            Standard Street
          </button>
          <button
            onClick={() =>
              onNotice(
                'Transit layers will be available with live map integration.',
              )
            }
          >
            Transit
          </button>
        </div>
      )}
      {detail && (
        <>
          <div className="desktop-coordinates">
            <Icon name="bd00b" />
            34.0505° N, 118.2494° W <span>|</span> DTLA SUB-SECTOR 04
          </div>
          <span className="mobile-coordinates">34.0506° N, 118.2486° W</span>
        </>
      )}
      {!detail && mode !== 'empty' && (
        <div className="mobile-map-top">
          <span className="saved-count">
            <span className="dot" />
            {places.length} saved in view
          </span>
          <button className="primary" onClick={onSave}>
            + Save place
          </button>
        </div>
      )}
      <div className="map-mobile-controls">
        <button aria-label="Center map preview" onClick={() => setZoom(1)}>
          <Icon name="6303b" />
        </button>
        <button
          aria-label="Map layers"
          aria-expanded={layers}
          onClick={() => setLayers(!layers)}
        >
          <Icon name="f0780" />
        </button>
      </div>
      {layers && (
        <div className="map-layer-menu">
          <strong>Map preview</strong>
          <p>Standard Street</p>
          <small>Live map layers will be connected in the map feature.</small>
        </div>
      )}
      <div className="map-zoom">
        <button
          aria-label="Zoom in on preview"
          disabled={zoom >= 1.6}
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))}
        >
          <Icon name="611aa" />
        </button>
        <button
          aria-label="Zoom out of preview"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
        >
          <Icon name="ba74f" />
        </button>
        <button aria-label="Reset map preview" onClick={() => setZoom(1)}>
          <Icon name="bf2e1" />
        </button>
      </div>
      {(detail || mode === 'saved') && (
        <div className="map-scale">
          <span>{detail ? '200' : 'DOWNTOWN LA'}</span>
          <span className="scale-line" />
          {!detail && <span>500 m</span>}
        </div>
      )}
      {mode === 'saved' && (
        <div className="saved-map-collection">
          <span className="dot" />
          {selected.collection}
          <small>{places.length} pins</small>
          <button aria-label="Map layers" onClick={() => setLayers(!layers)}>
            <Icon name="4517b" />
          </button>
        </div>
      )}
      <span className="map-preview-label">Map preview</span>
      {places.length === 0 && mode !== 'empty' && (
        <div className="map-no-results" role="status">
          No places in this view
        </div>
      )}
      {mode === 'map' && places.length > 0 && (
        <article className="map-peek">
          <div className="peek-main">
            <button
              className="peek-photo"
              onClick={() => onDetail(selected)}
              aria-label={`View ${selected.name}`}
            >
              <img
                src={asset(
                  selected.id === 'grand-central'
                    ? '49b5a.png'
                    : selected.photo,
                )}
                alt={selected.name}
              />
            </button>
            <button className="peek-text" onClick={() => onDetail(selected)}>
              <h2>{selected.name}</h2>
              <p>
                {selected.id === 'grand-central'
                  ? '317 S Broadway, DTLA'
                  : selected.address}
              </p>
              <p>
                {selected.kind} <span>•</span> Saved 3w ago
              </p>
            </button>
            <button
              className="peek-bookmark"
              aria-label="Toggle bookmark"
              aria-pressed={selected.bookmarked}
              onClick={() => onBookmark(selected)}
            >
              <Icon name="6f9eb" />
            </button>
          </div>
          <div className="peek-footer">
            <button onClick={() => onDetail(selected)}>
              <Icon name="958a7" />
              Tap card for notes &amp; photos
            </button>
            <button
              className="primary small"
              onClick={() => onDirections(selected)}
            >
              Route <Icon name="a72ac" />
            </button>
          </div>
        </article>
      )}
    </section>
  )
}
export function MiniMap({ desktop = false }: { desktop?: boolean }) {
  return (
    <div className={`mini-map ${desktop ? 'mini-map-desktop' : ''}`}>
      <img
        className="map-background"
        src={asset('bc7b9.png')}
        alt="Illustrative location preview"
      />
      <span className="mini-map-pin">
        <Icon name="b1f01" />
      </span>
      {desktop && (
        <span className="mini-map-address">Broadway &amp; 3rd St</span>
      )}
      <span className="mini-map-caption">Preview</span>
    </div>
  )
}
