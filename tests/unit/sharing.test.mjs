import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { db } from './storage-fake.mjs'
import { place, event } from './storage-fixture.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../../backend/storage.cjs',
)
const json = (r) => JSON.parse(r.body)
const setup = () => {
  const client = db()
  const handler = createHandler({ client, table: 'test' })
  const call = (method, path, body = {}, owner = 'user-a', query = {}) =>
    handler({
      ...event(method, body, owner),
      rawPath: path,
      pathParameters: { id: path.split('/')[2] },
      queryStringParameters: query,
      ...(owner ? {} : { requestContext: { http: { method } } }),
    })
  return { client, handler, call }
}
test('sharing is explicit, owner-only, replay-safe and returns only public fields', async () => {
  const { call } = setup()
  const saved = json(
    await call('POST', '/places', {
      place,
      note: 'Private note',
      collectionId: 'default',
    }),
  ).item
  assert.equal(
    (await call('POST', '/collections/default/sharing', {}, null)).statusCode,
    401,
  )
  assert.deepEqual(json(await call('GET', '/collections/default/sharing')), {
    active: false,
  })
  const created = json(await call('POST', '/collections/default/sharing'))
  assert.match(created.token, /^[a-f0-9]{64}$/)
  assert.equal(
    json(await call('POST', '/collections/default/sharing')).token,
    created.token,
  )
  const result = await call('GET', `/shared/${created.token}`, {}, null)
  assert.equal(result.statusCode, 200)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.deepEqual(Object.keys(json(result)).sort(), [
    'cursor',
    'items',
    'name',
  ])
  assert.deepEqual(Object.keys(json(result).items[0]).sort(), [
    'address',
    'coordinates',
    'countryName',
    'hasPhoto',
    'id',
    'name',
  ])
  for (const value of [
    'Private note',
    'USER#',
    'sources',
    'originalUrl',
    'visited',
    'searchOrigin',
    'objectKey',
  ])
    assert.equal(result.body.includes(value), false)
  assert.equal(json(result).items[0].id, saved.id)
  assert.equal(
    (await call('POST', `/shared/${created.token}`, {}, null)).statusCode,
    404,
  )
  assert.equal(
    (await call('DELETE', `/shared/${created.token}`, {}, null)).statusCode,
    404,
  )
})
test('revocation, expiration, deleted collections and new links invalidate old access', async () => {
  const { call, client } = setup()
  await call('GET', '/collections')
  const token = json(await call('POST', '/collections/default/sharing')).token
  await call('DELETE', '/collections/default/sharing')
  assert.equal(
    (await call('GET', `/shared/${token}`, {}, null)).statusCode,
    404,
  )
  const replacement = json(
    await call('POST', '/collections/default/sharing'),
  ).token
  assert.notEqual(replacement, token)
  client.data.get(
    'USER#user-a|COLLECTIONS',
  ).collections.default.shareExpiresAt = 1
  assert.equal(
    (await call('GET', `/shared/${replacement}`, {}, null)).statusCode,
    404,
  )
  const latest = json(await call('POST', '/collections/default/sharing')).token
  await call('DELETE', '/collections/default', { version: 1 })
  assert.equal(
    (await call('GET', `/shared/${latest}`, {}, null)).statusCode,
    404,
  )
})
test('public reads follow renames, moves and deletes; cannot fetch another collection photo', async () => {
  const { call } = setup()
  const saved = json(
    await call('POST', '/places', { place, collectionId: 'default' }),
  ).item
  const other = json(
    await call('POST', '/collections', { name: 'Private trip' }),
  ).item
  assert.equal(
    (await call('POST', `/collections/${other.id}/sharing`, {}, 'user-b'))
      .statusCode,
    404,
  )
  const token = json(await call('POST', '/collections/default/sharing')).token
  await call('PATCH', '/collections/default', {
    name: 'Shared trip',
    version: 1,
  })
  assert.equal(
    json(await call('GET', `/shared/${token}`, {}, null)).name,
    'Shared trip',
  )
  await call('PATCH', `/places/${saved.id}`, {
    version: saved.version,
    collectionId: other.id,
  })
  assert.equal(
    json(await call('GET', `/shared/${token}`, {}, null)).items.length,
    0,
  )
  assert.equal(
    (await call('GET', `/shared/${token}/places/${saved.id}/photo`, {}, null))
      .statusCode,
    404,
  )
  assert.equal((await call('GET', '/shared/invalid', {}, null)).statusCode, 404)
  assert.equal(
    (await call('GET', `/shared/${token}`, {}, null, { cursor: 'USER#user-b' }))
      .statusCode,
    400,
  )
})
test('public pagination never exposes owner IDs or skips places; concurrent create uses one active link', async () => {
  const { call } = setup()
  for (let i = 0; i < 53; i++)
    await call('POST', '/places', {
      place: { ...place, placeId: `venue-${i}` },
      collectionId: 'default',
    })
  const results = await Promise.all([
    call('POST', '/collections/default/sharing'),
    call('POST', '/collections/default/sharing'),
  ])
  assert.equal(json(results[0]).token, json(results[1]).token)
  const token = json(results[0]).token
  const first = json(await call('GET', `/shared/${token}`, {}, null))
  assert.equal(first.items.length, 50)
  assert.match(first.cursor, /^[a-f0-9]{64}$/)
  const second = json(
    await call('GET', `/shared/${token}`, {}, null, { cursor: first.cursor }),
  )
  assert.equal(second.items.length, 3)
  assert.equal(second.cursor, null)
  assert.equal(
    new Set([...first.items, ...second.items].map((p) => p.id)).size,
    53,
  )
})
test('shared photos return only cached bytes and attribution, never start discovery', async () => {
  const client = db()
  let reads = 0
  const handler = createHandler({
    client,
    table: 'test',
    photoOptions: {
      bucket: 'private',
      s3: {
        send: async () => {
          reads++
          return {
            Body: {
              transformToByteArray: async () =>
                new Uint8Array([255, 216, 255, 217]),
            },
          }
        },
      },
      lambda: {
        send: () => {
          throw Error('Anonymous request must not invoke a worker')
        },
      },
    },
  })
  const call = (method, path, body = {}, owner = 'user-a') =>
    handler({
      ...event(method, body, owner),
      rawPath: path,
      pathParameters: { id: path.split('/')[2] },
      ...(owner ? {} : { requestContext: { http: { method } } }),
    })
  const saved = json(
    await call('POST', '/places', { place, collectionId: 'default' }),
  ).item
  const token = json(await call('POST', '/collections/default/sharing')).token
  assert.equal(
    json(
      await call('GET', `/shared/${token}/places/${saved.id}/photo`, {}, null),
    ).status,
    'unavailable',
  )
  client.data.get(`USER#user-a|PLACE#${saved.id}`).coverPhoto = {
    objectKey: 'private/secret.jpg',
    author: 'Artist',
    license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  }
  const result = await call(
    'GET',
    `/shared/${token}/places/${saved.id}/photo`,
    {},
    null,
  )
  assert.equal(json(result).status, 'ready')
  assert.equal(reads, 1)
  assert.equal(result.body.includes('objectKey'), false)
  assert.equal(result.body.includes('secret.jpg'), false)
  await call('DELETE', '/collections/default/sharing')
  assert.equal(
    (await call('GET', `/shared/${token}/places/${saved.id}/photo`, {}, null))
      .statusCode,
    404,
  )
  assert.equal(reads, 1)
})

test('revocation during photo download prevents returning the bytes', async () => {
  const client = db()
  const handler = createHandler({
    client,
    table: 'test',
    photoOptions: {
      bucket: 'private',
      s3: {
        send: async () => {
          delete client.data.get('USER#user-a|COLLECTIONS').collections.default
            .shareToken
          return {
            Body: {
              transformToByteArray: async () =>
                new Uint8Array([255, 216, 255, 217]),
            },
          }
        },
      },
    },
  })
  const call = (method, path, body = {}, owner = 'user-a') =>
    handler({
      ...event(method, body, owner),
      rawPath: path,
      pathParameters: { id: path.split('/')[2] },
      ...(owner ? {} : { requestContext: { http: { method } } }),
    })
  const saved = json(
    await call('POST', '/places', { place, collectionId: 'default' }),
  ).item
  client.data.get(`USER#user-a|PLACE#${saved.id}`).coverPhoto = {
    objectKey: 'private/photo.jpg',
    author: 'Artist',
    license: 'CC0',
    sourceUrl: 'https://example.com/photo',
  }
  const token = json(await call('POST', '/collections/default/sharing')).token
  const result = await call(
    'GET',
    `/shared/${token}/places/${saved.id}/photo`,
    {},
    null,
  )
  assert.equal(result.statusCode, 404)
  assert.equal(result.body.includes('imageBase64'), false)
})
