import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { db } from './storage-fake.mjs'
import { place, event } from './storage-fixture.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../../backend/storage.cjs',
)
const collectionEvent = (method, body, owner = 'user-a', id) => ({
  ...event(method, body, owner, id),
  rawPath: '/collections' + (id ? '/' + id : ''),
})
const parsed = (result) => JSON.parse(result.body)
const setup = () => {
  const client = db()
  return { client, handler: createHandler({ client, table: 'test' }) }
}
const create = async (
  handler,
  name = 'Trip',
  owner = 'user-a',
  id = randomUUID(),
) => parsed(await handler(collectionEvent('POST', { id, name }, owner))).item

test('empty collections survive handler restarts; create replay is idempotent and names are normalized', async () => {
  const { client, handler } = setup(),
    id = randomUUID()
  const item = await create(handler, '  Ｔｒｉｐ  ', 'user-a', id)
  assert.equal(item.name, 'Trip')
  assert.equal((await create(handler, 'Trip', 'user-a', id)).id, id)
  assert.equal((await handler(collectionEvent('POST', {id:[randomUUID()], name:'Invalid ID'}))).statusCode,400)
  const restarted = createHandler({ client, table: 'test' })
  const list = parsed(await restarted(collectionEvent('GET')))
  assert.deepEqual(
    list.items.map((c) => c.name),
    ['Saved places', 'Trip'],
  )
  assert.equal(
    (await handler(collectionEvent('POST', { name: 'trip' }))).statusCode,
    409,
  )
  for (const name of ['', 'x'.repeat(61), 'bad\nname', 'ﷺ'.repeat(20)])
    assert.equal(
      (await handler(collectionEvent('POST', { name }))).statusCode,
      400,
    )
  for (const id of ['__proto__', 'constructor', 'bad/id'])
    assert.equal(
      (
        await handler(
          collectionEvent('PATCH', { version: 1, name: 'Oops' }, 'user-a', id),
        )
      ).statusCode,
      400,
    )
})

test('legacy migration paginates and rename/delete preserve physical place data, photos and source text', async () => {
  const { client, handler } = setup()
  const names = ['LA weekend', 'Coffee', '__proto__', 'constructor', 'Trip']
  for (const [index, name] of names.entries()) {
    const id = String(index + 1).repeat(64)
    const row = {
      pk: 'USER#user-a',
      sk: 'PLACE#' + id,
      id,
      collection: name,
      note: 'Keep note',
      sources: { original: { extractedName: '원문' } },
      coverPhoto: { objectKey: 'private/photo.jpg' },
      version: 4,
    }
    client.data.set(row.pk + '|' + row.sk, row)
  }
  const before = structuredClone([...client.data.values()])
  const list = parsed(await handler(collectionEvent('GET'))).items
  assert.equal(list.length, 6)
  const target = list.find((c) => c.name === 'LA weekend')
  const renamed = await handler(
    collectionEvent(
      'PATCH',
      { version: target.version, name: 'California' },
      'user-a',
      target.id,
    ),
  )
  assert.equal(renamed.statusCode, 200)
  const id = before[0].id
  assert.equal(
    parsed(await handler(event('GET', null, 'user-a', id))).item.collection,
    'California',
  )
  assert.equal(
    (
      await handler(
        collectionEvent(
          'PATCH',
          { version: 1, name: 'Stale' },
          'user-a',
          target.id,
        ),
      )
    ).statusCode,
    409,
  )
  assert.equal(
    (
      await handler(
        collectionEvent('DELETE', { version: 2 }, 'user-a', target.id),
      )
    ).statusCode,
    200,
  )
  assert.equal(
    (
      await handler(
        collectionEvent('DELETE', { version: 2 }, 'user-a', target.id),
      )
    ).statusCode,
    200,
  )
  const fallback = parsed(await handler(event('GET', null, 'user-a', id))).item
  assert.equal(fallback.collection, 'Saved places')
  assert.equal(fallback.collectionId, 'default')
  assert.deepEqual(
    [...client.data.values()].filter((r) => r.sk.startsWith('PLACE#')),
    before,
  )
  const recreated = await create(handler, 'LA weekend')
  assert.notEqual(recreated.id, target.id)
  assert.equal(
    parsed(await handler(event('GET', null, 'user-a', id))).item.collectionId,
    'default',
  )
})

test('moving a place preserves metadata, increments version, and cannot target foreign/deleted collections', async () => {
  const { handler } = setup()
  const trip = await create(handler),
    other = await create(handler, 'Other', 'user-b')
  const saved = parsed(
    await handler(
      event('POST', { place, note: 'Keep note', collectionId: trip.id }),
    ),
  ).item
  for (const collectionId of [other.id, randomUUID()]) {
    const response = await handler(
      event(
        'PATCH',
        { version: saved.version, collectionId },
        'user-a',
        saved.id,
      ),
    )
    assert.equal(response.statusCode, 404)
  }
  assert.equal(
    (
      await handler(
        event(
          'PATCH',
          { version: saved.version, collectionId: '__proto__' },
          'user-a',
          saved.id,
        ),
      )
    ).statusCode,
    400,
  )
  const moved = parsed(
    await handler(
      event(
        'PATCH',
        { version: saved.version, collectionId: 'default' },
        'user-a',
        saved.id,
      ),
    ),
  ).item
  assert.equal(moved.version, saved.version + 1)
  assert.equal(moved.collection, 'Saved places')
  assert.equal(moved.note, saved.note)
  assert.deepEqual(moved.sources, saved.sources)
  assert.equal(
    (
      await handler(
        event(
          'PATCH',
          { version: saved.version, collectionId: trip.id },
          'user-a',
          saved.id,
        ),
      )
    ).statusCode,
    409,
  )
  await handler(collectionEvent('DELETE', { version: 1 }, 'user-a', trip.id))
  assert.equal(
    (
      await handler(
        event('POST', {
          place: { ...place, placeId: 'new' },
          collectionId: trip.id,
        }),
      )
    ).statusCode,
    404,
  )
})

test('collection operations enforce authentication, owner isolation and default protection', async () => {
  const { handler } = setup(),
    trip = await create(handler)
  assert.equal(
    (
      await handler({
        rawPath: '/collections',
        requestContext: { http: { method: 'GET' } },
      })
    ).statusCode,
    401,
  )
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal(
      (
        await handler(
          collectionEvent(
            method,
            { version: 1, name: 'Attack' },
            'user-b',
            trip.id,
          ),
        )
      ).statusCode,
      404,
    )
    assert.equal(
      (
        await handler(
          collectionEvent(
            method,
            { version: 1, name: 'Changed' },
            'user-a',
            'default',
          ),
        )
      ).statusCode,
      409,
    )
  }
  assert.deepEqual(
    parsed(await handler(collectionEvent('GET', null, 'user-b'))).items.map(
      (c) => c.id,
    ),
    ['default'],
  )
})

test('catalog compare-and-swap keeps simultaneous creations and rejects duplicate names', async () => {
  const { handler } = setup()
  await handler(collectionEvent('GET'))
  const results = await Promise.all(
    ['One', 'Two', 'Three'].map((name) =>
      handler(collectionEvent('POST', { name })),
    ),
  )
  assert.deepEqual(
    results.map((r) => r.statusCode),
    [201, 201, 201],
  )
  const duplicates = await Promise.all(
    [1, 2].map(() => handler(collectionEvent('POST', { name: 'Same' }))),
  )
  assert.deepEqual(duplicates.map((r) => r.statusCode).sort(), [201, 409])
  assert.equal(parsed(await handler(collectionEvent('GET'))).items.length, 5)
})

test('deletion racing a place save is stopped by the catalog transaction condition', async () => {
  const { client, handler } = setup(),
    trip = await create(handler)
  const originalSend = client.send.bind(client)
  let injected = false
  client.send = async (command) => {
    if (command.constructor.name === 'TransactWriteItemsCommand' && !injected) {
      injected = true
      const catalog = client.data.get('USER#user-a|COLLECTIONS')
      catalog.collections[trip.id].deleted = true
      catalog.version++
    }
    return originalSend(command)
  }
  const result = await handler(event('POST', { place, collectionId: trip.id }))
  assert.equal(result.statusCode, 409)
  assert.equal(parsed(result).code, 'collection_conflict')
  assert.equal(
    [...client.data.values()].filter((r) => r.sk.startsWith('PLACE#')).length,
    0,
  )
})

test('foreign cursors cannot enumerate collections; collection rows never appear in place lists', async () => {
  const { handler } = setup()
  await create(handler)
  const result = parsed(await handler(event('GET')))
  assert.deepEqual(result.items, [])
  assert.equal(typeof result.collectionVersion, 'number')
  const cursor = Buffer.from(
    JSON.stringify({ pk: 'USER#user-a', sk: 'COLLECTIONS' }),
  ).toString('base64url')
  assert.equal(
    (await handler(event('GET', null, 'user-a', undefined, { cursor })))
      .statusCode,
    400,
  )
})
