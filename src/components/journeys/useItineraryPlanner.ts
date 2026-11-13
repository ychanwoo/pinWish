import { useEffect, useRef, useState } from 'react'
import type { SavedCollection, SavedPlace } from '../../lib/storage-api'
import {
  tripAPI,
  type TripContext,
  type TripSettings,
  type TripPreview,
  type SavedTrip,
} from '../../lib/itineraries'
import { useModalFocus } from '../../hooks/useModalFocus'
export interface ItineraryPlannerProps {
  collection: SavedCollection
  places: SavedPlace[]
  onClose: () => void
}
const defaultSettings = (): TripSettings => ({
  date: new Date(Date.now() + 86400000).toLocaleDateString('en-CA'),
  start: '09:00',
  end: '18:00',
  days: 0,
  mode: 'Car',
  order: 'recommended',
  stops: [],
})
export function useItineraryPlanner({
  collection,
  places,
  onClose,
}: ItineraryPlannerProps) {
  const [step, setStep] = useState<'select' | 'review' | 'result' | 'saved'>(
      'select',
    ),
    [selected, setSelected] = useState<string[]>(
      places
        .filter((p) => !p.visited)
        .slice(0, 20)
        .map((p) => p.id),
    )
  const [settings, setSettings] = useState<TripSettings>(defaultSettings),
    [context, setContext] = useState<TripContext | null>(null),
    [preview, setPreview] = useState<TripPreview | null>(null),
    [saved, setSaved] = useState<SavedTrip | null>(null),
    [trips, setTrips] = useState<SavedTrip[]>([])
  const [name, setName] = useState(collection.name + ' trip'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [confirmation, setConfirmation] = useState<'delete' | 'stop' | null>(null)
  const [loadingTrips, setLoadingTrips] = useState(true)
  const pending = useRef(false),
    alive = useRef(true),
    saveId = useRef(crypto.randomUUID()),
    heading = useRef<HTMLHeadingElement>(null)
  const close = () => {
    if (!pending.current) onClose()
  }
  const root = useModalFocus(true, close)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    void tripAPI<{ items: SavedTrip[] }>(
      `/itineraries?collectionId=${encodeURIComponent(collection.id)}`,
    )
      .then((r) => {
        if (alive.current) setTrips(r.items)
      })
      .catch((e) => {
        if (alive.current) setError(e.message)
      })
      .finally(() => {
        if (alive.current) setLoadingTrips(false)
      })
  }, [collection.id])
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  async function run(label: string, action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(label)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      pending.current = false
      if (alive.current) setBusy('')
    }
  }
  function startEdit(item: SavedTrip) {
    setSaved(item)
    setName(item.name)
    setSettings(item.settings)
    setSelected(item.settings.stops.map((s) => s.id))
    setContext(null)
    setPreview(null)
    setStep('select')
    setConfirmation(null)
    setError('')
  }
  const prepare = () =>
    run('Checking opening hours…', async () => {
      const r = await tripAPI<TripContext>(
        `/collections/${collection.id}/itineraries/prepare`,
        'POST',
        { ids: selected },
      )
      if (!alive.current) return
      setContext(r)
      setSettings((s) => ({
        ...s,
        stops: r.places.map(
          (p) =>
            s.stops.find((x) => x.id === p.id) ?? {
              id: p.id,
              duration: p.suggestedDuration,
            },
        ),
      }))
      setStep('review')
    })
  const generate = () =>
    run('Building your journey…', async () => {
      if (!context) return
      const r = await tripAPI<TripPreview>('/itineraries/preview', 'POST', {
        contextId: context.contextId,
        settings,
      })
      if (!alive.current) return
      setPreview(r)
      setStep('result')
    })
  const save = () =>
    run('Saving journey…', async () => {
      if (!preview) return
      const r = await tripAPI<{ item: SavedTrip }>('/itineraries', 'POST', {
        previewId: preview.previewId,
        id: saved?.id ?? saveId.current,
        version: saved?.version,
        name,
      })
      if (!alive.current) return
      setSaved(r.item)
      setTrips((t) => [r.item, ...t.filter((x) => x.id !== r.item.id)])
      setStep('saved')
      setMessage('Journey saved.')
    })
  const sharing = (method: string) =>
    run(
      method === 'POST' ? 'Creating link…' : 'Stopping sharing…',
      async () => {
        const r = await tripAPI<{ item: SavedTrip }>(
          `/itineraries/${saved!.id}/sharing`,
          method,
        )
        if (!alive.current) return
        setSaved(r.item)
        setTrips((t) => t.map((x) => (x.id === r.item.id ? r.item : x)))
        setConfirmation(null)
      },
    )
  function changeStop(
    id: string,
    update: Partial<TripSettings['stops'][number]>,
  ) {
    setSettings((s) => ({
      ...s,
      stops: s.stops.map((p) => (p.id === id ? { ...p, ...update } : p)),
    }))
  }
  function move(index: number, delta: number) {
    setSettings((s) => {
      const stops = [...s.stops]
      ;[stops[index], stops[index + delta]] = [
        stops[index + delta],
        stops[index],
      ]
      return { ...s, order: 'manual', stops }
    })
  }
  const deleteJourney = () =>
    run('Deleting journey…', async () => {
      await tripAPI(`/itineraries/${saved!.id}`, 'DELETE', {
        version: saved!.version,
      })
      if (!alive.current) return
      setTrips((t) => t.filter((x) => x.id !== saved!.id))
      setSaved(null)
      setConfirmation(null)
      setStep('select')
      saveId.current = crypto.randomUUID()
    })
  function resetJourney() {
    setSaved(null)
    setContext(null)
    setPreview(null)
    setSettings(defaultSettings())
    saveId.current = crypto.randomUUID()
    setStep('select')
  }
  function removeStop(id: string) {
    setSelected((ids) => ids.filter((value) => value !== id))
    setSettings((s) => ({
      ...s,
      stops: s.stops.filter((stop) => stop.id !== id),
    }))
  }
  const current = step === 'saved' ? saved : preview
  return {
    removeStop,
    deleteJourney,
    resetJourney,
    run,
    busy,
    changeStop,
    close,
    confirmation,
    context,
    current,
    error,
    generate,
    heading,
    loadingTrips,
    message,
    move,
    name,
    prepare,
    preview,
    root,
    save,
    saved,
    selected,
    setConfirmation,
    setError,
    setMessage,
    setName,
    setSaved,
    setSelected,
    setSettings,
    setStep,
    settings,
    sharing,
    startEdit,
    step,
    trips,
  }
}
