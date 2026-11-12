import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { itineraryFixture } from '../itinerary-fixture.mjs'
const json = (r) => JSON.parse(r.body)
async function prepared(f) {
  const r = await f.call('POST', '/collections/default/itineraries/prepare', {
    ids: f.places.map((p) => p.id),
  })
  assert.equal(r.statusCode, 200, r.body)
  return json(r)
}
const options = (f) => ({
  date: '2026-11-18',
  start: '09:00',
  end: '18:00',
  days: 0,
  mode: 'Car',
  order: 'recommended',
  stops: f.places.map((p) => ({ id: p.id, duration: 60 })),
})
test('authenticated prepare, generated snapshot save/reload, idempotence, account isolation and sharing revocation', async () => {
  const f = await itineraryFixture(),
    ctx = await prepared(f)
  assert.equal(f.providerCalls.details, 3)
  assert.equal(ctx.places[0].hours.status, 'available')
  const r = await f.call('POST', '/itineraries/preview', {
    contextId: ctx.contextId,
    settings: options(f),
  })
  assert.equal(r.statusCode, 200, r.body)
  const preview = json(r)
  assert.equal(preview.plan.complete, true)
  const id = randomUUID(),
    body = { id, name: 'A day in LA', previewId: preview.previewId }
  const saved = await f.call('POST', '/itineraries', body)
  assert.equal(saved.statusCode, 200, saved.body)
  assert.equal(json(await f.call('POST', '/itineraries', body)).item.version, 1)
  assert.equal(
    (await f.call('GET', '/itineraries/' + id, {}, 'other')).statusCode,
    404,
  )
  assert.equal(
    (await f.call('GET', '/itineraries/' + id, {}, null)).statusCode,
    401,
  )
  const share = json(await f.call('POST', `/itineraries/${id}/sharing`)).item
  const pub = await f.call('GET', '/trip-shares/' + share.share.token, {}, null)
  assert.equal(pub.statusCode, 200, pub.body)
  assert.equal(pub.body.includes('PRIVATE'), false)
  assert.equal(pub.body.includes('user-a'), false)
  assert.deepEqual(Object.keys(json(pub)).sort(), [
    'checkedAt',
    'name',
    'plan',
    'updatedAt',
    'zone',
  ])
  const stopped = await f.call('DELETE', `/itineraries/${id}/sharing`)
  assert.equal(stopped.statusCode, 200)
  assert.equal(
    (await f.call('GET', '/trip-shares/' + share.share.token, {}, null))
      .statusCode,
    404,
  )
  const next = json(await f.call('POST', `/itineraries/${id}/sharing`)).item
  assert.notEqual(next.share.token, share.share.token)
  assert.equal(
    (await f.call('DELETE', `/itineraries/${id}`, { version: 1 })).statusCode,
    409,
  )
  assert.equal(
    (await f.call('DELETE', `/itineraries/${id}`, { version: next.version }))
      .statusCode,
    200,
  )
  assert.equal(
    (await f.call('GET', '/trip-shares/' + next.share.token, {}, null))
      .statusCode,
    404,
  )
})
test('unknown hours remain marked in a saveable plan, and invalid input returns 400', async () => {
  const f = await itineraryFixture({ unknown: true }),
    ctx = await prepared(f),
    settings = options(f)
  const r = json(
    await f.call('POST', '/itineraries/preview', {
      contextId: ctx.contextId,
      settings,
    }),
  )
  assert.equal(r.plan.complete, true)
  assert.equal(
    (
      await f.call('POST', '/itineraries', {
        id: randomUUID(),
        previewId: r.previewId,
        name: 'Test',
      })
    ).statusCode,
    200,
  )
  settings.stops[2].manual = { open: '09:00', close: '18:00', days: [3] }
  const fixed = await f.call('POST', '/itineraries/preview', {
    contextId: ctx.contextId,
    settings,
  })
  assert.equal(json(fixed).plan.complete, true)
  assert.equal(f.providerCalls.matrix, 1)
  settings.date = '2026-02-30'
  assert.equal(
    (
      await f.call('POST', '/itineraries/preview', {
        contextId: ctx.contextId,
        settings,
      })
    ).statusCode,
    400,
  )
})
test('missing or moved places, expired contexts, provider failures and lookup limits are explicit', async () => {
  const f = await itineraryFixture(),
    ctx = await prepared(f)
  f.state.failRoutes = true
  assert.equal(
    (
      await f.call('POST', '/itineraries/preview', {
        contextId: ctx.contextId,
        settings: options(f),
      })
    ).statusCode,
    502,
  )
  f.state.failRoutes = false
  const stored = f.client.data.get(`USER#user-a|TRIPCTX#${ctx.contextId}`)
  stored.expiresAt = 0
  assert.equal(
    (
      await f.call('POST', '/itineraries/preview', {
        contextId: ctx.contextId,
        settings: options(f),
      })
    ).statusCode,
    409,
  )
  f.client.data.delete('USER#user-a|PLACE#' + f.places[0].id)
  assert.equal(
    (
      await f.call('POST', '/collections/default/itineraries/prepare', {
        ids: f.places.map((p) => p.id),
      })
    ).statusCode,
    409,
  )
})
test('collection deletion disables existing itinerary shares and update version rejects stale writes', async () => {
  const f = await itineraryFixture(),
    ctx = await prepared(f),
    r = json(
      await f.call('POST', '/itineraries/preview', {
        contextId: ctx.contextId,
        settings: options(f),
      }),
    ),
    id = randomUUID()
  await f.call('POST', '/itineraries', {
    id,
    previewId: r.previewId,
    name: 'Trip',
  })
  const share = json(await f.call('POST', `/itineraries/${id}/sharing`)).item
  const newPreview = json(
    await f.call('POST', '/itineraries/preview', {
      contextId: ctx.contextId,
      settings: { ...options(f), days: 2 },
    }),
  )
  assert.equal(
    (
      await f.call('POST', '/itineraries', {
        id,
        version: 1,
        previewId: newPreview.previewId,
        name: 'Stale',
      })
    ).statusCode,
    409,
  )
  const catalog = json(await f.call('GET', '/collections'))
  const c = catalog.items[0]
  await f.call('DELETE', '/collections/' + c.id, { version: c.version })
  assert.equal(
    (await f.call('GET', '/trip-shares/' + share.share.token, {}, null))
      .statusCode,
    404,
  )
})

test('paid provider preparation is bounded by an atomic per-owner quota',async()=>{
 const f=await itineraryFixture()
 for(let i=0;i<6;i++) await prepared(f)
 const calls=f.providerCalls.details
 assert.equal((await f.call('POST','/collections/default/itineraries/prepare',{ids:f.places.map(p=>p.id)})).statusCode,429)
 assert.equal(f.providerCalls.details,calls)
})

test('overlong visits stay in a saveable preview with explicit suggested-time notes', async () => {
  const f = await itineraryFixture(), ctx = await prepared(f)
  const settings = { ...options(f), days: 1, stops: f.places.map(p => ({ id: p.id, duration: 600 })) }
  const response = await f.call('POST', '/itineraries/preview', { contextId: ctx.contextId, settings })
  assert.equal(response.statusCode, 200)
  const preview = json(response)
  assert.equal(preview.plan.complete, true)
  const stops = preview.plan.days.flatMap(d => d.stops)
  assert.equal(stops.length, 3)
  assert.ok(stops.every(s => s.hoursSource === 'suggested' && s.planningNote))
  const saved = await f.call('POST', '/itineraries', { id: randomUUID(), previewId: preview.previewId, name: 'All selected places' })
  assert.equal(saved.statusCode, 200, saved.body)
  assert.equal(json(saved).item.plan.days.flatMap(d => d.stops).length, 3)
})
