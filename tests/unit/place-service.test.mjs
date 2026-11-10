import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceService, normalizePlace, validateSearch, PlaceError, placeError } from '../../scripts/places/service.mjs'
const raw = { PlaceId: 'test-place', Title: 'Test Museum', PlaceType: 'PointOfInterest', Address: { Label: '123 Example St', Country: { Code2: 'US', Name: 'United States' } }, Position: [-118,34] }
const query = { query: 'Museum', region: 'LA', countryCode: 'US' }

test('search input and results reject invalid coordinates, broad regions and unsupported Korea', () => {
  for (const input of [null, {}, { ...query, query: '' }, { ...query, region: 10 }, { ...query, query: 'x'.repeat(201) }, { ...query, countryCode: 'USA' }, { ...query, query: 'a\nb' }]) assert.throws(() => validateSearch(input), /invalid_search/)
  assert.throws(() => validateSearch({ ...query, countryCode: 'KR' }), /unsupported_country/)
  for (const item of [null, { ...raw, PlaceType: 'Country' }, { ...raw, PlaceType: 'Locality' }, { ...raw, Position: [181,34] }, { ...raw, Position: [1,NaN] }, { ...raw, Address: { ...raw.Address, Country: { Code2: 'KR' } } }]) assert.equal(normalizePlace(item, 'en'), null)
  assert.deepEqual(normalizePlace(raw,'en').coordinates, { longitude: -118, latitude: 34 })
  assert.equal(normalizePlace({ ...raw, Title: '東京タワー' },'en').englishName, null)
})
test('bounded search uses explicit region/country, filters bad results, and returns opaque selections', async () => {
  let command
  const service = createPlaceService({ client: { async send(c) { command = c; return { ResultItems: [raw, raw, { ...raw, PlaceType: 'Country' }] } } } })
  const result = await service.search(query)
  assert.equal(result.matches.length, 1)
  assert.equal(result.excludedResults, 2)
  assert.equal(command.input.QueryText, 'Museum, LA')
  assert.equal(command.input.IntendedUse, 'Storage')
  assert.equal(command.input.MaxResults, 5)
  assert.deepEqual(command.input.Filter, { BoundingBox: [-180,-90,180,90], IncludeCountries: ['US'] })
  assert.match(result.matches[0].selectionToken, /^[0-9a-f-]{36}$/)
  service.close()
})
test('details retrieve selected ID only; client-forged metadata is ignored and expired tokens rejected', async () => {
  let time = 1000, calls = 0, detailCommand
  const service = createPlaceService({ now: () => time, client: { async send(c) {
    calls++; if (c.constructor.name === 'SearchTextCommand') return { ResultItems: [raw] }
    detailCommand = c; return raw
  } } })
  await assert.rejects(service.details({ selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }), /selection_expired/)
  assert.equal(calls,0)
  const result = await service.search(query)
  const detail = await service.details({ selectionToken: result.matches[0].selectionToken, placeId: 'evil', countryCode: 'KR', coordinates: [0,0] })
  assert.equal(detailCommand.input.PlaceId, raw.PlaceId)
  assert.equal(detailCommand.input.Language, 'en')
  assert.equal(detailCommand.input.IntendedUse, 'Storage')
  assert.equal(detail.place.countryCode, 'US')
  assert.deepEqual(detail.place.coordinates, { longitude: -118, latitude: 34 })
  time += 15*60*1000
  await assert.rejects(service.details({ selectionToken: result.matches[0].selectionToken }), /selection_expired/)
  service.close()
})
test('changed or malformed details never become selectable confirmations', async () => {
  for (const bad of [{ ...raw, PlaceId: 'other' }, { ...raw, Position: [] }, { ...raw, Address: { ...raw.Address, Country: { Code2: 'CA' } } }]) {
    const service = createPlaceService({ client: { async send(c) { return c.constructor.name === 'SearchTextCommand' ? { ResultItems: [raw] } : bad } } })
    const r = await service.search(query)
    await assert.rejects(service.details({ selectionToken: r.matches[0].selectionToken }), /place_changed/)
    service.close()
  }
})
test('Korean country-centre fallback reports unsupported coverage, not a cafe match', async () => {
  const service = createPlaceService({ client: { async send() { return { ResultItems: [{ ...raw, PlaceType: 'Country', Address: { ...raw.Address, Country: { Code2: 'KR' } } }] } } } })
  const result = await service.search({ ...query, countryCode: '' })
  assert.deepEqual(result.matches, [])
  assert.deepEqual(result.unsupportedCountries, ['KR'])
  service.close()
})
test('provider errors are actionable and sanitized; no account IDs or provider messages escape', () => {
  for (const [name, code] of [['AccessDeniedException','places_access_denied'],['ThrottlingException','places_throttled'],['AbortError','places_timeout'],['ResourceNotFoundException','place_unavailable'],['Error','places_unavailable']]) {
    assert.equal(placeError({ name, message: 'private account diagnostic' }).code,code)
  }
  assert.equal(placeError(new PlaceError('invalid_selection',400)).status,400)
})
