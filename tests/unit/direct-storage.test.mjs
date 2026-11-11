import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { place, event } from './storage-fixture.mjs'
import { db } from './storage-fake.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../../backend/storage.cjs',
)
const jobId = '11111111-1111-4111-8111-111111111111'
function fixture(overrides = {}) {
  const client = db()
  client.data.set(`USER#user-a|JOB#${jobId}`, {
    pk: 'USER#user-a',
    sk: `JOB#${jobId}`,
    operation: 'details',
    status: 'complete',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    result: JSON.stringify({ place }),
    ...overrides,
  })
  return {
    client,
    handler: createHandler({ client, table: 'places', jobsTable: 'jobs' }),
  }
}
const body = {
  directSearch: {
    detailsJobId: jobId,
    query: '박물관',
    region: 'Los Angeles',
  },
  note: 'Visit soon',
  collectionId: 'default',
}
test('direct save uses server-verified data, keeps original query, and creates no Instagram source', async () => {
  const { handler } = fixture()
  const response = await handler(
    event('POST', {
      ...body,
      place: {
        ...place,
        name: 'Forged',
        coordinates: { latitude: 0, longitude: 0 },
      },
    }),
  )
  assert.equal(response.statusCode, 201)
  const saved = JSON.parse(response.body).item
  assert.equal(saved.name, 'Museum')
  assert.deepEqual(saved.coordinates, place.coordinates)
  assert.equal(saved.displayName, 'Museum')
  assert.deepEqual(saved.sources, {})
  assert.deepEqual(saved.searchOrigin, {
    query: '박물관',
    region: 'Los Angeles',
  })
  assert.equal(saved.note, 'Visit soon')
  const reload = JSON.parse((await handler(event('GET'))).body)
  assert.equal(reload.items[0].id, saved.id)
  const repeat = JSON.parse(
    (await handler(event('POST', { ...body, note: 'Replace' }))).body,
  )
  assert.equal(repeat.duplicate, true)
  assert.equal(repeat.item.note, 'Visit soon')
  assert.equal(repeat.item.version, saved.version)
})
test('direct save rejects foreign, expired, failed and non-details jobs and invalid coordinates', async () => {
  const { handler } = fixture()
  assert.equal((await handler(event('POST', body, 'user-b'))).statusCode, 409)
  assert.equal(
    JSON.parse((await handler(event('GET', {}, 'user-b'))).body).items.length,
    0,
  )
  for (const override of [
    { expiresAt: 1 },
    { operation: 'search' },
    { status: 'failed' },
    { result: '{bad' },
    {
      result: JSON.stringify({
        place: { ...place, coordinates: { longitude: 900, latitude: 0 } },
      }),
    },
    { result: JSON.stringify({ place: { ...place, englishName: null } }) },
  ]) {
    const f = fixture(override)
    assert.ok((await f.handler(event('POST', body))).statusCode >= 400)
    assert.equal(
      [...f.client.data.values()].filter((r) => r.sk.startsWith('PLACE#'))
        .length,
      0,
    )
  }
})
test('direct and Instagram saves merge by provider ID without replacing existing notes or collection', async () => {
  const { handler } = fixture()
  const first = JSON.parse((await handler(event('POST', body))).body).item
  const imported = JSON.parse(
    (await handler(event('POST', { place, note: 'Other' }))).body,
  )
  assert.equal(imported.duplicate, true)
  assert.equal(imported.item.id, first.id)
  assert.equal(imported.item.note, first.note)
  assert.equal(Object.keys(imported.item.sources).length, 1)
  const directAgain = JSON.parse((await handler(event('POST', body))).body)
  assert.equal(Object.keys(directAgain.item.sources).length, 1)
  assert.equal(directAgain.item.version, imported.item.version)
})
