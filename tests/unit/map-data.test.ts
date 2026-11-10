import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapCoordinates, placeFeatures } from '../../src/lib/map-data.ts'
import type { Place } from '../../src/data/places.ts'
const place = (longitude: number, latitude: number) =>
  ({
    id: 'saved-id',
    name: '<not HTML>',
    saved: { coordinates: { longitude, latitude } },
  }) as Place
test('map uses stored longitude/latitude and rejects missing, non-finite and out-of-range positions', () => {
  assert.deepEqual(mapCoordinates(place(-118.3, 34.1)), [-118.3, 34.1])
  for (const p of [
    place(NaN, 34),
    place(181, 34),
    place(0, -91),
    place(Infinity, 34),
    {} as Place,
  ])
    assert.equal(mapCoordinates(p), null)
  assert.deepEqual(mapCoordinates(place(0, 0)), [0, 0])
})
test('map features keep owner record identifiers, omit invalid points, and handle empty filters', () => {
  const result = placeFeatures([place(-118, 34), place(999, 34)])
  assert.equal(result.features.length, 1)
  assert.equal(result.features[0].properties?.id, 'saved-id')
  assert.equal(result.features[0].properties?.name, '<not HTML>')
  assert.deepEqual(placeFeatures([]).features, [])
})
