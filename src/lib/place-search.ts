import type { InstagramSource } from './instagram'
import { getPlaceDisplayName } from './place-name.ts'

export interface PlaceMatch {
  provider: 'amazon-location'
  placeId: string
  name: string
  address: string
  countryCode: string
  countryName: string
  coordinates: { longitude: number; latitude: number }
  placeType: string
  englishName: string | null
  koreanName: string | null
  selectionToken?: string
  retrievedAt?: string
}
export interface ConfirmedPlace extends PlaceMatch {
  retrievedAt: string
  confirmedAt: string
  displayName: string
  source: { instagram: InstagramSource; slides: number[]; extractedName: string; correctedName?: string; evidence: string }
}
export interface LocationTarget {
  id: string
  query: string
  region: string
  countryCode: string
  displayQuery?: string
  autoError?: string
  status: 'pending' | 'skipped' | 'confirmed'
  confirmed?: ConfirmedPlace
}
export interface CandidateLocationDraft { targets: LocationTarget[] }
export interface QueryConversion { originalQuery: string; searchQuery: string; searchRegion: string; status: 'unchanged' | 'translated' | 'needs_review' | 'unavailable' }
export interface PlaceSearchResponse { queryConversion?: QueryConversion; matches: PlaceMatch[]; excludedResults: number; unsupportedCountries: string[]; attribution: string }
const nonempty = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const nullableName = (s: unknown) => s === null || nonempty(s, 500)
export function isPlaceMatch(value: unknown): value is PlaceMatch {
  if (!value || typeof value !== 'object') return false
  const p = value as PlaceMatch
  return p.provider === 'amazon-location' && nonempty(p.placeId, 500) && nonempty(p.name, 500) &&
    nonempty(p.address, 1000) && nonempty(p.countryName, 200) && /^[A-Z]{2}$/.test(p.countryCode) &&
    p.countryCode !== 'ZZ' && ['PointOfInterest', 'PointAddress', 'InterpolatedAddress', 'Street', 'Intersection'].includes(p.placeType) &&
    Number.isFinite(p.coordinates?.longitude) && Math.abs(p.coordinates.longitude) <= 180 &&
    Number.isFinite(p.coordinates?.latitude) && Math.abs(p.coordinates.latitude) <= 90 &&
    nullableName(p.englishName) && nullableName(p.koreanName)
}
export function isPlaceSearchResponse(value: unknown): value is PlaceSearchResponse {
  if (!value || typeof value !== 'object') return false
  const r = value as PlaceSearchResponse
  return (r.queryConversion === undefined || (nonempty(r.queryConversion.originalQuery, 200) && nonempty(r.queryConversion.searchQuery, 200) && typeof r.queryConversion.searchRegion === 'string' && r.queryConversion.searchRegion.length <= 200 && ['unchanged','translated','needs_review','unavailable'].includes(r.queryConversion.status))) && Array.isArray(r.matches) && r.matches.length <= 5 && r.matches.every(p => isPlaceMatch(p) &&
    typeof p.selectionToken === 'string' && /^[0-9a-f-]{36}$/.test(p.selectionToken)) &&
    new Set(r.matches.map(p => p.placeId)).size === r.matches.length &&
    Number.isInteger(r.excludedResults) && r.excludedResults >= 0 && Array.isArray(r.unsupportedCountries) &&
    r.unsupportedCountries.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) && typeof r.attribution === 'string'
}
export function isPlaceDetails(value: unknown): value is { place: PlaceMatch & { retrievedAt: string } } {
  if (!value || typeof value !== 'object') return false
  const r = value as { place: PlaceMatch }
  return isPlaceMatch(r.place) && typeof r.place.retrievedAt === 'string' && Number.isFinite(Date.parse(r.place.retrievedAt))
}
export function confirmPlace(place: PlaceMatch & { retrievedAt: string }, source: ConfirmedPlace['source']): ConfirmedPlace {
  // This is a local review record, not a persisted map pin. The caller may use explicit selection or automatic provider matching.
  return {
    provider: place.provider, placeId: place.placeId, name: place.name, address: place.address,
    countryCode: place.countryCode, countryName: place.countryName, coordinates: { ...place.coordinates },
    placeType: place.placeType, englishName: place.englishName, koreanName: place.koreanName,
    retrievedAt: place.retrievedAt, confirmedAt: new Date().toISOString(),
    displayName: getPlaceDisplayName({ sourceName: source.extractedName, correctedName: source.correctedName,
      confirmedLocation: { countryCode: place.countryCode, englishName: place.englishName, koreanName: place.koreanName } }),
    source: { ...source, instagram: { ...source.instagram }, slides: [...source.slides] },
  }
}
export const placeSearchErrors: Record<string, string> = {
  processing_throttled: 'The service is busy. Your input is kept; please try again shortly.',
  processing_busy: 'Other places are being processed. Wait a moment and try again.',
  daily_limit: 'The daily test limit has been reached. Please try again tomorrow.',
  unauthorized: 'Please sign in again to continue.',
  processing_timeout: 'Processing took too long. Your input is kept; please try again.',
  processing_unavailable: 'The test service is unavailable. Your input is kept; try again when the test session is open.',
  invalid_search: 'Enter a place name and check the region or country filter.',
  unsupported_country: 'Amazon Location does not support detailed places in South Korea. Keep or skip this candidate for now.',
  places_access_denied: 'The server cannot access place search. Please try again later.',
  places_throttled: 'AWS temporarily limited requests. Your input is kept; try again shortly.',
  places_busy: 'Other searches are still running. Try again shortly.',
  places_session_limit: 'This local session reached its 100 place-request limit. Restart the API to continue testing.',
  places_timeout: 'Place search timed out. Your input and confirmed locations are kept. Try again.',
  selection_expired: 'This search result expired. Search again to refresh it.',
  place_unavailable: 'This place is no longer available. Search again or choose another match.',
  place_changed: 'The place details changed. Search again before confirming a location.',
}
