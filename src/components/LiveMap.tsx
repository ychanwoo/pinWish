import type { MapAppearance } from '../hooks/useMapAppearance'
import { MapAppearancePanel } from './MapAppearancePanel'
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
maplibregl.setWorkerUrl(workerUrl)
import type { Place } from '../data/places'
import { mapCoordinates, placeFeatures } from '../lib/map-data'

interface Props {
  appearance?: MapAppearance
  places: Place[]
  selectedId: string
  onSelect: (place: Place) => void
  loading: boolean
  loadError: string
  onRetryPlaces: () => void
}
const region = import.meta.env.VITE_AWS_REGION || 'us-east-1'
const key = import.meta.env.VITE_MAP_API_KEY || ''
const duration = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450
export default function LiveMap(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const hoverLabel = useRef<maplibregl.Popup | null>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  }, [props])
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const valid = props.places.filter((p) => mapCoordinates(p))
  const fit = () => {
    const m = map.current
    const points = latest.current.places.flatMap((p) => {
      const c = mapCoordinates(p)
      return c ? [c] : []
    })
    if (!m || !points.length) return
    // Unwrap around the first point so trips across the date line stay together.
    const bounds = new maplibregl.LngLatBounds()
    const anchor = points[0][0]
    for (const [lng, lat] of points)
      bounds.extend([anchor + ((lng - anchor + 540) % 360) - 180, lat])
    m.fitBounds(bounds, {
      padding: { top: 100, bottom: 65, left: 50, right: 50 },
      maxZoom: 14,
      duration: duration(),
    })
  }
  useEffect(() => {
    if (!container.current || !key) return
    let disposed = false
    let m: MapInstance
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${encodeURIComponent(key)}&lang=en`,
        center: [0, 20],
        zoom: 1.5,
        maxZoom: 18,
        attributionControl: { compact: true },
      })
    } catch {
      queueMicrotask(() => {
        if (!disposed)
          setError(
            'Your browser could not start the map. Check WebGL support or try another browser.',
          )
      })
      return
    }
    map.current = m
    const label = new maplibregl.Popup({
      closeButton: false, closeOnClick: true, focusAfterOpen: false,
      offset: 20, maxWidth: '240px', className: 'place-hover-label',
    })
    hoverLabel.current = label
    const hideLabel = () => { label.remove() }
    const escapeLabel = (event: KeyboardEvent) => { if (event.key === 'Escape') hideLabel() }
    m.getCanvas().addEventListener('mouseleave', hideLabel)
    document.addEventListener('keydown', escapeLabel)
    m.on('movestart', hideLabel)
    m.on('click', hideLabel)
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right',
    )
    m.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    const timeout = setTimeout(() => {
      if (!disposed)
        setError('The map is taking too long to load. Please retry.')
    }, 20000)
    m.on('error', () => {
      if (!disposed)
        setError(
          'The map could not load completely. Check your connection and retry.',
        )
    })
    m.on('load', () => {
      if (disposed) return
      clearTimeout(timeout)
      m.addSource('places', {
        type: 'geojson',
        data: placeFeatures(
          latest.current.places,
          latest.current.appearance?.details,
          latest.current.appearance?.colors,
        ),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 44,
      })
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4b5650',
          'circle-radius': 22,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'places',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
        },
        paint: { 'text-color': '#fff' },
      })
      m.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'places',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 11,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      })
      m.addSource('selection', { type: 'geojson', data: placeFeatures([]) })
      m.addLayer({
        id: 'selected-pin',
        type: 'circle',
        source: 'selection',
        paint: {
          'circle-radius': 14,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#1b2923',
          'circle-stroke-width': 4,
        },
      })
      const check = document.createElement('canvas')
      check.width = 24
      check.height = 24
      const ctx = check.getContext('2d')!
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(6, 12)
      ctx.lineTo(10, 16)
      ctx.lineTo(18, 7)
      ctx.stroke()
      m.addImage('visited-check', ctx.getImageData(0, 0, 24, 24))
      for (const source of ['places', 'selection'])
        m.addLayer({
          id: source + '-visited',
          type: 'symbol',
          source,
          filter: [
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', 'visited'], true],
          ],
          layout: {
            'icon-image': 'visited-check',
            'icon-size': 0.75,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })
      m.on('click', 'pins', (event) => {
        const place = latest.current.places.find(
          (p) => p.id === event.features?.[0]?.properties.id,
        )
        if (place) latest.current.onSelect(place)
      })
      m.on('click', 'selected-pin', () => {
        const place = latest.current.places.find(
          (p) => p.id === latest.current.selectedId,
        )
        if (place) latest.current.onSelect(place)
      })
      m.on('click', 'clusters', async (event) => {
        const feature = event.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        try {
          const zoom = await (
            m.getSource('places') as GeoJSONSource
          ).getClusterExpansionZoom(Number(feature.properties.cluster_id))
          if (!disposed)
            m.easeTo({
              center: feature.geometry.coordinates as [number, number],
              zoom,
              duration: duration(),
            })
        } catch {
          if (!disposed)
            setError(
              'Could not expand these places. Use the place selector instead.',
            )
        }
      })
      m.on('mousemove', (event) => {
        if (!matchMedia('(hover: hover)').matches || m.isMoving()) return
        const features = m.queryRenderedFeatures(event.point, { layers: ['selected-pin', 'pins'] })
        const feature = features.find(f => f.layer.id === 'selected-pin') ?? features[0]
        const place = latest.current.places.find(p => p.id === feature?.properties.id)
        if (!place || feature?.geometry.type !== 'Point') { hideLabel(); return }
        const coordinates = [...feature.geometry.coordinates] as [number, number]
        while (Math.abs(event.lngLat.lng - coordinates[0]) > 180)
          coordinates[0] += event.lngLat.lng > coordinates[0] ? 360 : -360
        // Provider names are text, never HTML.
        label.setLngLat(coordinates).setText(place.name).addTo(m)
      })
      for (const layer of ['pins', 'clusters', 'selected-pin']) {
        m.on('mouseenter', layer, () => {
          m.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', layer, () => {
          m.getCanvas().style.cursor = ''
        })
      }
      setReady(true)
      fit()
    })
    const observer = new ResizeObserver(() => m.resize())
    observer.observe(container.current)
    return () => {
      disposed = true
      clearTimeout(timeout)
      observer.disconnect()
      hideLabel()
      hoverLabel.current = null
      m.getCanvas().removeEventListener('mouseleave', hideLabel)
      document.removeEventListener('keydown', escapeLabel)
      map.current = null
      m.remove()
    }
  }, [attempt])
  const signature = valid.map((p) => `${p.id}:${mapCoordinates(p)}`).join('|')
  useEffect(() => {
    if (!ready || !map.current) return
    hoverLabel.current?.remove()
    ;(map.current.getSource('places') as GeoJSONSource).setData(
      placeFeatures(
        latest.current.places,
        latest.current.appearance?.details,
        latest.current.appearance?.colors,
      ),
    )
  }, [
    signature,
    ready,
    props.places,
    props.appearance?.details,
    props.appearance?.colors,
  ])
  useEffect(() => {
    if (ready) fit()
  }, [signature, ready])
  useEffect(() => {
    if (!ready || !map.current) return
    const selected = latest.current.places.find(
      (p) => p.id === props.selectedId,
    )
    ;(map.current.getSource('selection') as GeoJSONSource).setData(
      placeFeatures(
        selected ? [selected] : [],
        latest.current.appearance?.details,
        latest.current.appearance?.colors,
      ),
    )
  }, [
    props.selectedId,
    signature,
    ready,
    props.places,
    props.appearance?.details,
    props.appearance?.colors,
  ])
  useEffect(() => {
    if (!ready || !map.current) return
    const selected = latest.current.places.find(
      (p) => p.id === props.selectedId,
    )
    const center = selected && mapCoordinates(selected)
    if (center)
      map.current.easeTo({
        center,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        zoom: Math.max(map.current.getZoom(), 14),
        duration: duration(),
      })
  }, [props.selectedId, signature, ready])
  return (
    <section className="map-view live-map" aria-label="Saved places map">
      <div className="live-map-canvas" ref={container} />
      <div className="live-map-toolbar">
        <label>
          Places on map
          <select
            aria-label="Select a saved place on the map"
            value={
              valid.some((p) => p.id === props.selectedId)
                ? props.selectedId
                : ''
            }
            onChange={(e) => {
              const p = valid.find((p) => p.id === e.target.value)
              if (p) props.onSelect(p)
            }}
          >
            <option value="" disabled>
              {valid.length
                ? `${valid.length} places`
                : 'No places in this view'}
            </option>
            {valid.map((p) => (
              <option key={p.id} value={p.id}>
                {p.visited ? '✓ ' : ''}
                {p.name}
                {p.visited ? ' · Visited' : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={fit} disabled={!ready || !valid.length}>
          Show all
        </button>
        {props.appearance && (
          <MapAppearancePanel
            appearance={props.appearance}
          />
        )}
      </div>
      {(!key ||
        error ||
        !ready ||
        props.loading ||
        props.loadError ||
        !valid.length) && (
        <div className="live-map-status" role="status">
          {!key
            ? 'Map configuration is missing. Your saved places are still available in the list.'
            : error ||
              (!ready
                ? 'Loading map…'
                : props.loading
                  ? 'Loading saved places…'
                  : props.loadError || 'No saved places in this view.')}
          {key && error && (
            <button
              onClick={() => {
                setReady(false)
                setError('')
                setAttempt((a) => a + 1)
              }}
            >
              Retry map
            </button>
          )}
          {props.loadError && (
            <button onClick={props.onRetryPlaces}>Retry places</button>
          )}
        </div>
      )}
      {valid.length < props.places.length && (
        <p className="live-map-invalid" role="status">
          {props.places.length - valid.length} places have invalid coordinates
          and are shown only in the list.
        </p>
      )}
    </section>
  )
}
