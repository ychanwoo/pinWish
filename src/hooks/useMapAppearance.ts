import { useEffect, useMemo, useRef, useState } from 'react'
import type { Place } from '../data/places'
import type { PlaceDetails } from '../lib/map-appearance'
import { type SavedCollection, storageRequest } from '../lib/storage-api'
import { getSession } from '../lib/cloud-auth'
interface Preferences {
  colors: Record<string, string>
  version: number
}
export function useMapAppearance(
  owner: string | undefined,
  places: Place[],
  catalog: SavedCollection[] = [],
) {
  const [dataOwner, setDataOwner] = useState(owner)
  const [details, setDetails] = useState<Record<string, PlaceDetails>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preferences, setPreferences] = useState<Preferences>({
    colors: {},
    version: 0,
  })
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [saving, setSaving] = useState(false)
  const generation = useRef(0),
    busy = useRef(false)
  const cache = useRef<Record<string, PlaceDetails>>({})
  const signature = useMemo(
    () =>
      places
        .filter((p) => p.saved)
        .map((p) => p.id)
        .sort()
        .join('|'),
    [places],
  )
  useEffect(() => {
    generation.current++
    cache.current = {}
    busy.current = false
    // Clear private appearance state on account changes.
    // eslint-disable-next-line react/set-state-in-effect
    setDataOwner(owner)
    setDetails({})
    setErrors({})
    setPreferences({ colors: {}, version: 0 })
    setPreferencesReady(false)
    setPreferenceError('')
    setSaving(false)
    if (!owner) return
    const g = generation.current
    void storageRequest<Preferences>('/map-preferences', 'GET', undefined, '')
      .then((p) => {
        if (g !== generation.current || getSession()?.sub !== owner) return
        if (!p.colors || !Number.isInteger(p.version))
          throw Error('Map preferences are unavailable.')
        setPreferences(p)
        setPreferencesReady(true)
      })
      .catch((e) => {
        if (g === generation.current) setPreferenceError(e.message)
      })
    return () => {
      generation.current = g + 1
    }
  }, [owner])
  useEffect(() => {
    if (!owner || !signature) return
    let cancelled = false
    const g = generation.current,
      ids = signature.split('|').filter((id) => !cache.current[id])
    async function work() {
      while (ids.length && !cancelled) {
        const id = ids.shift()!
        try {
          const data = await storageRequest<PlaceDetails>(`/${id}/details`)
          if (
            cancelled ||
            g !== generation.current ||
            getSession()?.sub !== owner
          )
            return
          if (!data.region?.key || !Array.isArray(data.hours?.windows))
            throw Error('Place details are unavailable.')
          cache.current[id] = data
          setDetails((d) => ({ ...d, [id]: data }))
        } catch (e) {
          if (!cancelled && g === generation.current)
            setErrors((d) => ({
              ...d,
              [id]:
                e instanceof Error
                  ? e.message
                  : 'Could not load place details.',
            }))
        }
      }
    }
    void Promise.all([work(), work(), work()])
    return () => {
      cancelled = true
    }
  }, [owner, signature])
  async function refresh(id: string) {
    const g = generation.current
    setErrors((e) => ({ ...e, [id]: '' }))
    try {
      const d = await storageRequest<PlaceDetails>(`/${id}/details`)
      if (g !== generation.current || getSession()?.sub !== owner) return
      if (!d.region?.key || !Array.isArray(d.hours?.windows))
        throw Error('Place details are unavailable.')
      cache.current[id] = d
      setDetails((v) => ({ ...v, [id]: d }))
    } catch (e) {
      if (g === generation.current)
        setErrors((v) => ({
          ...v,
          [id]:
            e instanceof Error ? e.message : 'Could not load place details.',
        }))
    }
  }
  async function reloadPreferences() {
    const g = generation.current
    setPreferenceError('')
    try {
      const p = await storageRequest<Preferences>(
        '/map-preferences',
        'GET',
        undefined,
        '',
      )
      if (g === generation.current && p.colors && Number.isInteger(p.version)) {
        setPreferences(p)
        setPreferencesReady(true)
      }
    } catch (e) {
      if (g === generation.current)
        setPreferenceError(
          e instanceof Error ? e.message : 'Could not load map colors.',
        )
    }
  }
  async function saveColor(collectionId: string, color: string | null) {
    if (busy.current || !preferencesReady) return
    const g = generation.current
    busy.current = true
    setSaving(true)
    setPreferenceError('')
    try {
      const result = await storageRequest<Preferences>(
        '/map-preferences',
        'PATCH',
        { collectionId, color, version: preferences.version },
        '',
      )
      if (g === generation.current && getSession()?.sub === owner)
        setPreferences(result)
    } catch (e) {
      if (g === generation.current) {
        setPreferenceError(
          e instanceof Error ? e.message : 'Could not save color.',
        )
        try {
          const fresh = await storageRequest<Preferences>(
            '/map-preferences',
            'GET',
            undefined,
            '',
          )
          if (g === generation.current) setPreferences(fresh)
        } catch {
          /* retain current colors */
        }
      }
    } finally {
      if (g === generation.current) {
        busy.current = false
        setSaving(false)
      }
    }
  }
  const collections = useMemo(() => {
    const counts = new Map<string, number>()
    for (const place of places) {
      const id = place.saved?.collectionId
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return catalog.map((c) => ({
      id: c.id,
      name: c.name,
      count: counts.get(c.id) ?? 0,
    }))
  }, [catalog, places])
  return {
    collections,
    details: dataOwner === owner ? details : {},
    errors: dataOwner === owner ? errors : {},
    refresh,
    reloadPreferences,
    colors: dataOwner === owner ? preferences.colors : {},
    saveColor,
    saving,
    preferenceError,
    preferencesReady,
  }
}
export type MapAppearance = ReturnType<typeof useMapAppearance>
