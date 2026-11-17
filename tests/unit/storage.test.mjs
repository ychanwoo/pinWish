import {place,event} from './storage-fixture.mjs'
import { db } from './storage-fake.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  createHandler,
  validatePlace,
  marshal, unmarshal,
} = require('../../backend/storage.cjs')
test('storage rejects unauthenticated and ID-token requests and malformed records', async () => {
  const handler = createHandler({ client: db(), table: 'test' })
  assert.equal(
    (await handler({ requestContext: { http: { method: 'GET' } } })).statusCode,
    401,
  )
  const bad = event('GET')
  bad.requestContext.authorizer.jwt.claims.token_use = 'id'
  assert.equal((await handler(bad)).statusCode, 401)
  for (const p of [
    { ...place, coordinates: { longitude: 999, latitude: 0 } },
    { ...place, countryCode: 'KR' },
    { ...place, placeType: 'Country' },
    {
      ...place,
      source: {
        ...place.source,
        instagram: { originalUrl: 'https://evil.example/p/Example/' },
      },
    },
  ])
    assert.throws(() => validatePlace({ place: p }))
  assert.equal((await handler(event('POST', { place: {} }))).statusCode, 400)
})
test('storage is idempotent and merges original sources without overwriting notes', async () => {
  const client = db(),
    handler = createHandler({ client, table: 'test' })
  const first = await handler(
    event('POST', { place, note: 'Keep note', collection: 'Trip' }),
  )
  assert.equal(first.statusCode, 201)
  const a = JSON.parse(first.body).item
  const again = JSON.parse(
    (await handler(event('POST', { place, note: 'replacement' }))).body,
  ).item
  assert.equal(again.id, a.id)
  assert.equal(again.version, 1)
  assert.equal(again.note, 'Keep note')
  assert.equal([...client.data.values()].filter(x=>x.sk.startsWith('PLACE#')).length, 1)
  const other = {
    ...place,
    source: {
      ...place.source,
      instagram: { originalUrl: 'https://www.instagram.com/p/Another/' },
    },
  }
  const merged = JSON.parse(
    (await handler(event('POST', { place: other }))).body,
  ).item
  assert.equal(Object.keys(merged.sources).length, 2)
  assert.equal(merged.version, 2)
  assert.equal(merged.note, 'Keep note')
  assert.equal(
    merged.sources[Object.keys(merged.sources)[0]].extractedName,
    '박물관',
  )
  assert.equal('pk' in merged, false)
})
test('ownership isolation, optimistic updates and deletion are enforced on the server', async () => {
  const handler = createHandler({ client: db(), table: 'test' }),
    saved = JSON.parse((await handler(event('POST', { place }))).body).item
  assert.equal(
    (await handler(event('GET', null, 'user-b', saved.id))).statusCode,
    404,
  )
  assert.equal(
    (
      await handler(
        event('PATCH', { version: 1, note: 'attack' }, 'user-b', saved.id),
      )
    ).statusCode,
    404,
  )
  assert.equal(
    (await handler(event('DELETE', { version: 1 }, 'user-b', saved.id)))
      .statusCode,
    404,
  )
  assert.equal(
    JSON.parse((await handler(event('GET', null, 'user-b'))).body).items.length,
    0,
  )
  assert.equal(
    (
      await handler(
        event('PATCH', { version: 1, pk: 'user-b' }, 'user-a', saved.id),
      )
    ).statusCode,
    400,
  )
  assert.equal(
    (
      await handler(
        event(
          'PATCH',
          { version: 1, note: 'New', visited: true },
          'user-a',
          saved.id,
        ),
      )
    ).statusCode,
    200,
  )
  assert.equal(
    (
      await handler(
        event('PATCH', { version: 1, note: 'Stale' }, 'user-a', saved.id),
      )
    ).statusCode,
    409,
  )
  assert.equal(
    (await handler(event('DELETE', { version: 2 }, 'user-a', saved.id)))
      .statusCode,
    200,
  )
  assert.equal(
    (await handler(event('GET', null, 'user-a', saved.id))).statusCode,
    404,
  )
})
test('pagination cursor cannot cross owners and invalid body limits are rejected', async () => {
  const handler = createHandler({ client: db(), table: 'test' })
  const cursor = Buffer.from(
    JSON.stringify({ pk: 'USER#user-b', sk: 'PLACE#' + 'a'.repeat(64) }),
  ).toString('base64url')
  assert.equal(
    (await handler(event('GET', null, 'user-a', undefined, { cursor })))
      .statusCode,
    400,
  )
  assert.equal(
    (await handler(event('GET', null, 'user-a', undefined, { limit: '100' })))
      .statusCode,
    400,
  )
  const huge = event('POST')
  huge.body = 'x'.repeat(25000)
  assert.equal((await handler(huge)).statusCode, 413)
  const invalid = event('POST')
  invalid.body = '{'
  assert.equal((await handler(invalid)).statusCode, 400)
})

test('DynamoDB encoding preserves nested null without turning unknown values into zero', () => {
  const value = { stops: [{ travel: null, duration: 60, omitted: undefined }], note: '', visited: false }
  const encoded = marshal(value)
  assert.deepEqual(encoded.stops.L[0].M.travel, { NULL: true })
  assert.deepEqual(unmarshal(encoded), { stops: [{ travel: null, duration: 60 }], note: '', visited: false })
})

test('a verified named district is persisted without relabeling it as a venue', async () => {
  const handler = createHandler({ client: db(), table: 'test' })
  const response = await handler(event('POST', { place: { ...place, placeType: 'District', name: 'Example Quarter', displayName: 'Example Quarter' } }))
  assert.equal(response.statusCode, 201)
  const stored=JSON.parse(response.body).item
  assert.equal(stored.placeType,'District')
  assert.deepEqual(stored.coordinates,place.coordinates)
  assert.throws(() => validatePlace({place:{...place,placeType:'Locality'}}))
})

test('imports create one colored collection with its first new place, never for duplicates alone', async () => {
  const client = db(), handler = createHandler({ client, table: 'test' })
  async function save(id, post, title) {
    const response = await handler(event('POST', { place: { ...place, placeId: id, source: {
      ...place.source, instagram: { originalUrl: 'https://www.instagram.com/p/' + post + '/' },
      candidateIndex: 0, candidateCount: 1,
    } }, importTitle: title }))
    assert.ok([200,201].includes(response.statusCode), response.body)
    return JSON.parse(response.body)
  }
  const results = await Promise.all([save('1','First','New York'), save('2','First','New York')])
  assert.equal(results[0].item.collectionId, results[1].item.collectionId)
  assert.equal(results[0].item.collection, 'New York')
  const overlap = await save('1','Second','New York')
  assert.ok(overlap.duplicate)
  const catalog = () => Object.values([...client.data.values()].find(x=>x.sk === 'COLLECTIONS').collections)
  assert.equal(catalog().length, 2)
  const additional = await save('3','Second','New York')
  assert.equal(additional.item.collection, 'New York (2)')
  assert.notEqual(catalog().find(c=>c.id===additional.item.collectionId).color,
    catalog().find(c=>c.id===overlap.item.collectionId).color)
  assert.deepEqual(Object.values(overlap.item.sources).map(s=>s.candidateIndexes), [[0],[0]])
})
