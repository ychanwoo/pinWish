import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmPlace, isPlaceMatch, isPlaceSearchResponse, isPlaceDetails } from '../../src/lib/place-search.ts'
import { parseInstagramLink } from '../../src/lib/instagram.ts'
const match = { provider: 'amazon-location' as const, placeId: 'test', name: 'Point Dume', address: 'Malibu, CA',
  countryCode: 'US', countryName: 'United States', coordinates: { longitude: -118.8, latitude: 34 },
  placeType: 'PointOfInterest', englishName: 'Point Dume', koreanName: null, retrievedAt: '2026-11-10T00:00:00Z' }
test('client rejects malformed search results and false coarse locations', () => {
  assert.equal(isPlaceMatch(match),true)
  for (const bad of [null, {}, { ...match, coordinates: { longitude: 400, latitude: 30 } }, { ...match, countryCode: '' }, { ...match, placeType: 'Country' }]) assert.equal(isPlaceMatch(bad),false)
  assert.equal(isPlaceDetails({ place: { ...match, retrievedAt: 'invalid' } }),false)
  const response = { matches: [{ ...match, selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], excludedResults: 0, unsupportedCountries: [], attribution: 'Amazon Location Service' }
  assert.equal(isPlaceSearchResponse(response),true)
  assert.equal(isPlaceSearchResponse({ ...response, matches: [...response.matches,...response.matches] }),false)
})
test('confirmation separates source/correction from localized name and preserves coordinate order', () => {
  const parsed = parseInstagramLink('https://www.instagram.com/p/Example/?img_index=4')
  assert.ok(parsed.ok)
  const source = { instagram: parsed.source, slides: [4], extractedName: '포인트 듑', correctedName: '포인트 둠', evidence: '포인트 듑' }
  const confirmed = confirmPlace(match, source)
  assert.equal(confirmed.displayName,'Point Dume')
  assert.equal(confirmed.source.extractedName,'포인트 듑')
  assert.equal(confirmed.source.correctedName,'포인트 둠')
  assert.equal(confirmed.source.instagram.selectedSlide,4)
  assert.equal(confirmed.selectionToken,undefined)
  assert.equal(confirmed.coordinates.longitude,-118.8)
  source.slides.push(5)
  assert.deepEqual(confirmed.source.slides,[4])
  assert.equal(confirmPlace({ ...match, englishName: null }, source).displayName,'포인트 둠')
  assert.equal(confirmPlace({ ...match, countryCode:'KR', koreanName:'묵호다방' }, source).displayName,'묵호다방')
})
