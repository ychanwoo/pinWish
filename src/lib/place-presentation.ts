import type { Place } from '../data/places'

export function sortPlaces(
  places: Place[],
  order: 'recent' | 'name',
  persistent: boolean,
): Place[] {
  const sorted = [...places]
  if (order === 'name')
    return sorted.sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    )
  if (!persistent) return sorted
  const timestamp = (place: Place) => {
    const value = Date.parse(place.saved?.createdAt ?? '')
    return Number.isFinite(value) ? value : -Infinity
  }
  return sorted.sort((a, b) => {
    const first = timestamp(a),
      second = timestamp(b)
    return first === second ? a.id.localeCompare(b.id) : first > second ? -1 : 1
  })
}

export function savedDate(value: string | undefined): string {
  const time = Date.parse(value ?? '')
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(time)
    : 'Date unavailable'
}

export function placeKind(type: string): string {
  return (
    (
      {
        PointOfInterest: 'Saved place',
        PointAddress: 'Address',
        InterpolatedAddress: 'Address',
        Street: 'Street',
        Intersection: 'Intersection',
      } as Record<string, string>
    )[type] ?? 'Saved place'
  )
}
