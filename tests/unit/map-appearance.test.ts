import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  listedHoursStatus,
  collectionColor,
  type PlaceDetails,
} from '../../src/lib/map-appearance.ts'
import { placeFeatures } from '../../src/lib/map-data.ts'
import type { Place } from '../../src/data/places.ts'
const data: PlaceDetails = {
  region: {
    key: 'a'.repeat(64),
    label: 'LA',
    context: 'CA, US',
    level: 'city',
  },
  zone: 'America/Los_Angeles',
  checkedAt: '2026-11-12T07:00:00Z',
  stale: false,
  hours: {
    status: 'available',
    display: [],
    windows: [{ day: 3, start: 1320, end: 1560 }],
  },
}
test('listed hours use the venue time zone and overnight carryover, with closing boundary exclusive', () => {
  assert.match(
    listedHoursStatus(data, new Date('2026-11-12T09:00:00Z')),
    /^Open/,
  )
  assert.match(
    listedHoursStatus(data, new Date('2026-11-12T10:00:00Z')),
    /^Closed/,
  )
  assert.equal(
    listedHoursStatus({ ...data, stale: true }),
    'Hours may be out of date',
  )
  assert.equal(
    listedHoursStatus({
      ...data,
      zone: '',
      checkedAt: new Date().toISOString(),
    }),
    'Hours unverified',
  )
})
test('visited feature and region color update without depending on the source of the saved place', () => {
  const p = {
    id: 'p',
    name: 'Place',
    coordinates: { longitude: -118, latitude: 34 },
    visited: true,
    saved: { collectionId: 'default' },
  } as Place
  const f = placeFeatures([p], { p: data }, { default: '#426b57' }).features[0]
  assert.equal(f.properties?.visited, true)
  assert.equal(f.properties?.color, '#426b57')
  assert.notEqual(
    collectionColor(data.region.key, { [data.region.key]: 'javascript:bad' }),
    'javascript:bad',
  )
  assert.equal(
    placeFeatures([{ ...p, visited: false }], { p: data }, {}).features[0]
      .properties?.visited,
    false,
  )
})

test('listed-hour evaluation follows daylight saving rather than a fixed UTC offset', () => {
  const summer = { ...data, checkedAt: '2026-07-02T06:00:00Z' }
  assert.match(
    listedHoursStatus(summer, new Date('2026-07-02T08:00:00Z')),
    /^Open/,
  )
  assert.match(
    listedHoursStatus(summer, new Date('2026-07-02T09:00:00Z')),
    /^Closed/,
  )
  assert.equal(
    listedHoursStatus(
      { ...summer, zone: 'not-a-zone' },
      new Date('2026-07-02T08:00:00Z'),
    ),
    'Hours unverified',
  )
})

test('collection identity determines pin color across cities, renames and collection moves', () => {
  const base = {
    id: 'a',
    name: 'Place',
    collection: 'Trip',
    coordinates: { longitude: -118, latitude: 34 },
    visited: false,
    saved: { collectionId: 'default' },
  } as Place
  const other = { ...base, id: 'b', collection: 'Renamed Trip' }
  const colors = { default: '#426b57', other: '#426782' }
  const features = placeFeatures(
    [base, other],
    {
      a: data,
      b: {
        ...data,
        region: { ...data.region, key: 'b'.repeat(64), label: 'Another city' },
      },
    },
    colors,
  ).features
  assert.deepEqual(
    features.map((f) => f.properties?.color),
    ['#426b57', '#426b57'],
  )
  const moved = { ...base, saved: { ...base.saved!, collectionId: 'other' } }
  assert.equal(
    placeFeatures([moved], {}, colors).features[0].properties?.color,
    '#426782',
  )
})
