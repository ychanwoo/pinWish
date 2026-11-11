import { createEnglishQueryResolver } from './english-query.mjs'
import { randomUUID } from 'node:crypto'
import { GeoPlacesClient, SearchTextCommand, GetPlaceCommand } from '@aws-sdk/client-geo-places'

export class PlaceError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status }
}
const selectableTypes = new Set(['PointOfInterest', 'PointAddress', 'InterpolatedAddress', 'Street', 'Intersection'])
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
export function validateSearch(input) {
  if (!input || !text(input.query, 200) || typeof input.region !== 'string' || input.region.length > 200 ||
    typeof input.countryCode !== 'string' || !/^(|[A-Z]{2})$/.test(input.countryCode) ||
    [...(input.query + input.region)].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new PlaceError('invalid_search', 400)
  if (input.countryCode === 'KR') throw new PlaceError('unsupported_country', 422)
  return { query: input.query.trim(), region: input.region.trim(), countryCode: input.countryCode }
}
export function normalizePlace(item, language) {
  const countryCode = item?.Address?.Country?.Code2
  const position = item?.Position
  if (!item || !selectableTypes.has(item.PlaceType) || countryCode === 'KR' ||
    !text(item.PlaceId, 500) || !text(item.Title, 500) || !text(item.Address?.Label, 1000) ||
    typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode) || countryCode === 'ZZ' ||
    !Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite) ||
    Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) return null
  // AWS may fall back to an entry's default language. Never label non-Latin text English.
  const localized = language === 'en' && !/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(item.Title)
  return {
    provider: 'amazon-location', placeId: item.PlaceId, name: item.Title,
    address: item.Address.Label, countryCode, countryName: item.Address.Country.Name ?? countryCode,
    coordinates: { longitude: position[0], latitude: position[1] }, placeType: item.PlaceType,
    englishName: localized ? item.Title : null, koreanName: null,
  }
}
export function placeError(error) {
  if (error instanceof PlaceError) return error
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return new PlaceError('places_timeout', 504)
  if (['AccessDeniedException', 'CredentialsProviderError', 'UnrecognizedClientException', 'ExpiredTokenException'].includes(error?.name)) return new PlaceError('places_access_denied', 503)
  if (error?.name === 'ThrottlingException') return new PlaceError('places_throttled', 429)
  if (error?.name === 'ResourceNotFoundException') return new PlaceError('place_unavailable', 404)
  return new PlaceError('places_unavailable')
}
export function createPlaceService({ client, region = process.env.PINWISH_PLACES_REGION ?? process.env.AWS_REGION ?? 'us-east-1', now = Date.now, queryResolver = createEnglishQueryResolver(), selectionStore } = {}) {
  const owned = !client
  client ??= new GeoPlacesClient({ region, maxAttempts: 1 })
  const selections = selectionStore ?? new Map()
  const ttl = 15 * 60 * 1000
  function prune() {
    if (selectionStore) return
    for (const [key, value] of selections) if (value.expires <= now()) selections.delete(key)
  }
  async function send(command, signal) {
    try { return await client.send(command, { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }) }
    catch (error) { throw placeError(error) }
  }
  return {
    async search(input, signal) {
      const { query, region: area, countryCode } = validateSearch(input)
      const queryConversion = await queryResolver.resolve({ query, region: area, countryCode }, signal)
      // No arbitrary LA bias: a world bounding box lets explicit query/region drive ranking.
      const response = await send(new SearchTextCommand({
        QueryText: [queryConversion.searchQuery, queryConversion.searchRegion].filter(Boolean).join(', '), MaxResults: 5, Language: 'en',
        Filter: { BoundingBox: [-180, -90, 180, 90], ...(countryCode ? { IncludeCountries: [countryCode] } : {}) },
        IntendedUse: 'Storage',
      }), signal)
      if (!Array.isArray(response.ResultItems)) throw new PlaceError('invalid_places_response')
      prune()
      const seen = new Set()
      const matches = []
      for (const item of response.ResultItems) {
        const place = normalizePlace(item, 'en')
        if (!place || seen.has(place.placeId) || (countryCode && place.countryCode !== countryCode)) continue
        seen.add(place.placeId)
        const selectionToken = randomUUID()
        await selections.set(selectionToken, { place, expires: now() + ttl })
        matches.push({ ...place, selectionToken })
      }
      while (!selectionStore && selections.size > 250) selections.delete(selections.keys().next().value)
      return { queryConversion, matches, excludedResults: response.ResultItems.length - matches.length,
        unsupportedCountries: response.ResultItems.some(p => p.Address?.Country?.Code2 === 'KR') ? ['KR'] : [],
        attribution: 'Search results provided by Amazon Location Service',
      }
    },
    async details(input, signal) {
      if (!input || typeof input.selectionToken !== 'string' || !/^[0-9a-f-]{36}$/.test(input.selectionToken)) throw new PlaceError('invalid_selection', 400)
      prune()
      const selection = await selections.get(input.selectionToken)
      if (!selection || selection.expires <= now()) throw new PlaceError('selection_expired', 409)
      // Retrieve fresh provider data. Never accept client-supplied country, name or coordinates.
      const response = await send(new GetPlaceCommand({ PlaceId: selection.place.placeId, Language: 'en', IntendedUse: 'Storage' }), signal)
      const place = normalizePlace(response, 'en')
      if (!place || place.placeId !== selection.place.placeId || place.countryCode !== selection.place.countryCode) throw new PlaceError('place_changed', 409)
      return { place: { ...place, retrievedAt: new Date(now()).toISOString() },
        attribution: 'Place details provided by Amazon Location Service' }
    },
    close() { queryResolver.close(); if (!selectionStore) selections.clear(); if (owned) client.destroy() },
  }
}
