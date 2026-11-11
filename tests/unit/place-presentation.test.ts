import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortPlaces,
  savedDate,
  placeKind,
} from '../../src/lib/place-presentation.ts'
import type { Place } from '../../src/data/places.ts'
const place = (id: string, name: string, date?: string) =>
  ({ id, name, saved: { createdAt: date } }) as Place

test('recent ordering uses creation time rather than API order, edits or record IDs', () => {
  const old = place('a', 'Zulu', '2026-10-01T00:00:00Z'),
    recent = place('z', 'Alpha', '2026-11-01T00:00:00Z')
  const rows = [
    old,
    place('b', 'Unknown', 'bad'),
    recent,
    place('c', 'Missing'),
  ]
  assert.deepEqual(
    sortPlaces(rows, 'recent', true).map((p) => p.id),
    ['z', 'a', 'b', 'c'],
  )
  assert.equal(rows[0], old)
  assert.deepEqual(sortPlaces(rows, 'recent', false), rows)
})
test('date ties and alphabetical ties are deterministic', () => {
  const rows = [
    place('b', 'alpha', '2026-11-01T00:00:00Z'),
    place('a', 'Alpha', '2026-11-01T00:00:00Z'),
  ]
  assert.deepEqual(
    sortPlaces(rows, 'recent', true).map((p) => p.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    sortPlaces(rows, 'name', true).map((p) => p.id),
    ['a', 'b'],
  )
})
test('unknown dates and provider types have honest human-readable fallbacks', () => {
  assert.equal(savedDate('invalid'), 'Date unavailable')
  assert.equal(savedDate(undefined), 'Date unavailable')
  assert.match(savedDate('2026-11-10T12:00:00Z'), /Nov 10, 2026/)
  assert.equal(placeKind('PointAddress'), 'Address')
  assert.equal(placeKind('InterpolatedAddress'), 'Address')
  assert.equal(placeKind('UnrecognizedProviderEnum'), 'Saved place')
})
