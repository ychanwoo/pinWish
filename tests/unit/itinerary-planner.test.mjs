import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { hoursFromAWS, settingsFor, schedule, localISO } = createRequire(
  import.meta.url,
)('../../backend/itinerary-planner.cjs')
const h = (start = 'T090000', duration = 'PT09H', recurrence = 'FREQ:DAILY') =>
  hoursFromAWS([
    {
      Display: ['09:00–18:00'],
      Components: [
        { OpenTime: start, OpenDuration: duration, Recurrence: recurrence },
      ],
    },
  ])
const places = [0, 1, 2].map((i) => ({
  id: String(i),
  name: 'Place ' + i,
  address: 'LA',
  coordinates: { latitude: 34, longitude: -118 },
  hours: h(),
}))
const settings = (extra = {}) =>
  settingsFor(
    {
      date: '2026-11-16',
      start: '09:00',
      end: '18:00',
      mode: 'Car',
      days: 0,
      stops: places.map((p) => ({ id: p.id, duration: 120 })),
      ...extra,
    },
    places,
  )
const matrix = [
  [0, 30, 45],
  [30, 0, 20],
  [45, 20, 0],
]
test('plans include real leg estimates, buffers, lunch and different visit durations without overlapping closure', () => {
  const s = settings({
    stops: [
      { id: '0', duration: 300 },
      { id: '1', duration: 180 },
      { id: '2', duration: 45 },
    ],
  })
  const result = schedule(places, matrix, s)
  assert.equal(result.complete, true)
  assert.ok(result.dayCount >= 2)
  assert.deepEqual(
    result.days
      .flatMap((d) => d.stops.map((s) => s.duration))
      .sort((a, b) => a - b),
    [45, 180, 300],
  )
  for (const day of result.days)
    for (const stop of day.stops) {
      assert.ok(stop.arrival >= 540)
      assert.ok(stop.departure <= 1080)
      assert.ok(stop.departure <= 720 || stop.arrival >= 780)
    }
})
test('closed weekdays move visits to a later day rather than treating missing windows as all-day access', () => {
  const ps = places.map((p) => ({
    ...p,
    hours: h('T090000', 'PT09H', 'FREQ:DAILY;BYDAY:TU'),
  }))
  const result = schedule(ps, matrix, settings())
  assert.equal(result.days[0].stops.length, 0)
  assert.equal(result.days[1].date, '2026-11-17')
  assert.equal(result.complete, true)
})
test('unknown hours are scheduled with explicit uncertainty; manual hours override estimates', () => {
  const ps = places.map((p) => ({ ...p, hours: hoursFromAWS([]) }))
  const result = schedule(ps, matrix, settings())
  assert.equal(result.complete, true)
  assert.equal(result.unscheduled.length, 0)
  assert.ok(
    result.days
      .flatMap((d) => d.stops)
      .every((s) => s.hoursSource === 'unknown'),
  )
  const fixed = settings({
    stops: places.map((p) => ({
      id: p.id,
      duration: 60,
      manual: { open: '09:00', close: '18:00', days: [1] },
    })),
  })
  const manual = schedule(ps, matrix, fixed)
  assert.equal(manual.complete, true)
  assert.ok(manual.days[0].stops.every((s) => s.hoursSource === 'manual'))
  assert.equal(
    hoursFromAWS([
      {
        Components: [
          {
            OpenTime: 'T090000',
            OpenDuration: 'PT8H',
            Recurrence: 'FREQ:DAILY;UNTIL:20260101',
          },
        ],
      },
    ]).status,
    'unknown',
  )
  assert.equal(
    hoursFromAWS([{ Components: [] }, { Components: [] }]).status,
    'unknown',
  )
})
test('unreachable routes remain explicit while all places receive dedicated days', () => {
  const r = schedule(
    places,
    [
      [0, null, null],
      [null, 0, null],
      [null, null, 0],
    ],
    settings({ days: 1 }),
  )
  assert.equal(r.complete, true)
  assert.equal(r.unscheduled.length, 0)
  const stops = r.days.flatMap(d => d.stops)
  assert.equal(stops.length, 3)
  assert.equal(stops.filter(s => s.travel === null).length, 2)
})
test('manual order stays in order and durations are not shortened to squeeze into a day', () => {
  const s = settings({
    days: 1,
    order: 'manual',
    stops: [
      { id: '2', duration: 60 },
      { id: '0', duration: 120 },
      { id: '1', duration: 600 },
    ],
  })
  const r = schedule(places, matrix, s)
  assert.deepEqual(
    r.days[0].stops.map((s) => s.id),
    ['2', '0'],
  )
  assert.equal(r.unscheduled.length, 0)
  const last = r.days.flatMap(d => d.stops).at(-1)
  assert.equal(last.id, '1')
  assert.equal(last.duration, 600)
  assert.equal(last.hoursSource, 'suggested')
})
test('invalid dates, overnight day ranges, malformed manual hours and duplicate stops are rejected', () => {
  for (const extra of [
    { date: '2026-02-30' },
    { start: '20:00', end: '09:00' },
    { stops: [] },
    {
      stops: [
        { id: '0', duration: 60 },
        { id: '0', duration: 60 },
        { id: '1', duration: 60 },
      ],
    },
  ])
    assert.throws(() => settings(extra))
})
test('local departures follow daylight saving offsets and overnight hours carry into the next day', () => {
  assert.equal(
    localISO('2026-07-01', 540, 'America/Los_Angeles'),
    '2026-07-01T16:00:00.000Z',
  )
  assert.equal(
    localISO('2026-11-18', 540, 'America/Los_Angeles'),
    '2026-11-18T17:00:00.000Z',
  )
  const hours = h('T220000', 'PT12H', 'FREQ:DAILY;BYDAY:SU')
  const ps = places.map((p) => ({ ...p, hours }))
  const r = schedule(
    ps,
    matrix,
    settings({
      days: 1,
      stops: places.map((p) => ({ id: p.id, duration: 15 })),
    }),
  )
  assert.ok(r.days[0].stops[0].departure <= 600)
})

test('a longer morning visit is considered before short stops to avoid a needless extra day', () => {
  const s = settings({
    stops: [
      { id: '0', duration: 180 },
      { id: '1', duration: 120 },
      { id: '2', duration: 120 },
    ],
  })
  const result = schedule(
    places,
    [
      [0, 20, 20],
      [20, 0, 20],
      [20, 20, 0],
    ],
    s,
  )
  assert.equal(result.complete, true)
  assert.equal(result.dayCount, 1)
  assert.equal(result.days[0].stops[0].id, '0')
})

test('visits that exceed opening windows remain clearly marked suggestions', () => {
  const ps = places.map((p) => ({ ...p, hours: h('T220000', 'PT1H') }))
  const result = schedule(ps, matrix, settings({ days: 3 }))
  assert.equal(result.complete, true)
  assert.equal(result.unscheduled.length, 0)
  const stops = result.days.flatMap(d => d.stops)
  assert.equal(stops.length, 3)
  assert.ok(stops.every(s => s.hoursSource === 'suggested'))
})
test('two-day trips distribute visits without dropping places or adding days', () => {
  const ps = Array.from({ length: 6 }, (_, i) => ({
    ...places[0],
    id: String(i),
  }))
  const opts = {
    ...settings(),
    stops: ps.map((p) => ({ id: p.id, duration: 120 })),
  }
  const result = schedule(
    ps,
    ps.map(() => ps.map(() => 10)),
    opts,
  )
  assert.equal(result.complete, true)
  assert.equal(result.dayCount, 2)
  assert.deepEqual(
    result.days.map((d) => d.stops.length),
    [3, 3],
  )
  assert.equal(
    new Set(result.days.flatMap((d) => d.stops.map((s) => s.id))).size,
    6,
  )
})


test('a full preferred day extends to the next opening weekday with every place exactly once', () => {
  const ps = places.map(p => ({ ...p, hours: h('T090000', 'PT09H', 'FREQ:WEEKLY;BYDAY:MO') }))
  const r = schedule(ps, matrix, settings({ days: 1, stops: places.map(p => ({ id: p.id, duration: 300 })) }))
  assert.equal(r.complete, true)
  assert.equal(r.unscheduled.length, 0)
  const stops = r.days.flatMap(d => d.stops)
  assert.equal(new Set(stops.map(s => s.id)).size, 3)
  assert.equal(stops.length, 3)
  assert.ok(r.dayCount > 7)
  assert.ok(r.days.filter(d => d.stops.length).every(d => new Date(d.date + 'T12:00:00Z').getUTCDay() === 1))
  assert.ok(stops.every(s => s.hoursSource === 'provider' && s.arrival >= 540 && s.departure <= 1080))
})

test('tentative late-night visits remain within a calendar day and never claim verified hours', () => {
  const ps = places.map(p => ({ ...p, hours: h('T220000', 'PT1H') }))
  const r = schedule(ps, matrix, settings({ days: 1, stops: places.map(p => ({ id: p.id, duration: 600 })) }))
  const stops = r.days.flatMap(d => d.stops)
  assert.equal(stops.length, 3)
  assert.ok(stops.every(s => s.hoursSource === 'suggested' && s.departure <= 1440 && s.duration === 600))
})
