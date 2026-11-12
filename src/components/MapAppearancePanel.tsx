import { useEffect, useRef, useState } from 'react'
import type { MapAppearance } from '../hooks/useMapAppearance'
import { pinPalette, collectionColor } from '../lib/map-appearance'
export function MapAppearancePanel({
  appearance,
}: {
  appearance: MapAppearance
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div className="map-appearance" ref={root}>
      <button
        ref={trigger}
        aria-expanded={open}
        aria-controls="map-color-panel"
        onClick={() => setOpen(!open)}
      >
        Map colors
      </button>
      {open && (
        <section
          id="map-color-panel"
          className="map-color-panel"
          aria-label="Map colors"
        >
          <div className="map-color-heading">
            <h2>Collection colors</h2>
            <button
              aria-label="Close map colors"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              ×
            </button>
          </div>
          <p>
            One collection, one pin color. A check marks places you’ve visited.
          </p>
          <div className="map-color-regions">
            {[...appearance.collections]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => (
                <fieldset
                  key={group.id}
                  disabled={appearance.saving || !appearance.preferencesReady}
                >
                  <legend>
                    {group.name} <span>{group.count}</span>
                  </legend>
                  <div className="map-color-options">
                    {pinPalette.map((p) => (
                      <button
                        key={p.color}
                        type="button"
                        aria-label={`${p.name} for ${group.name}`}
                        aria-pressed={
                          collectionColor(group.id, appearance.colors) ===
                          p.color
                        }
                        style={{ '--swatch': p.color } as React.CSSProperties}
                        onClick={() =>
                          void appearance.saveColor(group.id, p.color)
                        }
                      />
                    ))}
                    <button
                      className="map-color-reset"
                      disabled={!appearance.colors[group.id]}
                      onClick={() => void appearance.saveColor(group.id, null)}
                    >
                      Reset
                    </button>
                  </div>
                </fieldset>
              ))}
          </div>
          {appearance.preferenceError && (
            <>
              <p role="alert">{appearance.preferenceError}</p>
              <button onClick={() => void appearance.reloadPreferences()}>
                Retry colors
              </button>
            </>
          )}
          {appearance.saving && <p role="status">Saving color…</p>}
          <div className="map-pin-legend">
            <span>✓ Visited</span>
            <span>Ring · Selected</span>
            <span>Number · Group of places</span>
          </div>
        </section>
      )}
    </div>
  )
}
