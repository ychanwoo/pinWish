import { collectionColor, type PlaceDetails } from './map-appearance.ts'
import type { Place } from '../data/places'
import type { FeatureCollection, Point } from 'geojson'
export function mapCoordinates(place: Place): [number, number] | null {
  const c = place.coordinates ?? place.saved?.coordinates
  if (
    !c ||
    !Number.isFinite(c.longitude) ||
    !Number.isFinite(c.latitude) ||
    Math.abs(c.longitude) > 180 ||
    Math.abs(c.latitude) > 90
  )
    return null
  return [c.longitude, c.latitude]
}
export function placeFeatures(
  places: Place[],
  _details: Record<string, PlaceDetails> = {},
  colors: Record<string, string> = {},
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: places.flatMap((place) => {
      const coordinates = mapCoordinates(place)
      return coordinates
        ? [
            {
              type: 'Feature' as const,
              id: place.id,
              properties: {
                id: place.id,
                name: place.name,
                visited: place.visited,
                color: collectionColor(
                  place.saved?.collectionId ?? place.collection ?? 'default',
                  colors,
                ),
              },
              geometry: { type: 'Point' as const, coordinates },
            },
          ]
        : []
    }),
  }
}
