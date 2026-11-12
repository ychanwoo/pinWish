import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { db } from './storage-fake.mjs'
const require = createRequire(import.meta.url)
const { createMapDetails, regionFor } = require('../../backend/map-details.cjs')
const {
  marshal,
  unmarshal,
  createHandler,
} = require('../../backend/storage.cjs')
const id = 'a'.repeat(64),
  pk = 'USER#owner'
const place = {
  pk,
  sk: 'PLACE#' + id,
  placeId: 'provider',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118, latitude: 34 },
}
const provider = {
  Position: [-118, 34],
  Address: {
    Country: { Code2: 'US' },
    Region: { Code: 'CA', Name: 'California' },
    Locality: 'Los Angeles',
  },
  TimeZone: { Name: 'America/Los_Angeles' },
  OpeningHours: [
    {
      Display: ['Mon–Sun 22:00–02:00'],
      Components: [
        { OpenTime: 'T220000', OpenDuration: 'PT4H', Recurrence: 'FREQ:DAILY' },
      ],
    },
  ],
}
function fixture() {
  const client = db()
  client.data.set(pk + '|' + place.sk, place)
  client.data.set(pk + '|COLLECTIONS', {
    pk,
    sk: 'COLLECTIONS',
    collections: { default: { id: 'default', name: 'Saved places' } },
  })
  let calls = 0,
    broken = false
  const service = createMapDetails({
    read: async (key) =>
      unmarshal(
        (
          await client.send(
            new (require('@aws-sdk/client-dynamodb').GetItemCommand)({
              Key: marshal(key),
            }),
          )
        ).Item,
      ),
    send: (c) => client.send(c),
    table: 'test',
    marshal,
    fail: (status, message) => {
      throw Object.assign(Error(message), { status })
    },
    placesClient: {
      send: async (c) => {
        calls++
        assert.equal(c.input.IntendedUse, 'Storage')
        if (broken) throw Error()
        return provider
      },
    },
  })
  return {
    client,
    service,
    calls: () => calls,
    break: () => {
      broken = true
    },
  }
}
test('owned details use a 24-hour provider cache; other accounts cannot read or spend quota', async () => {
  const f = fixture()
  const a = await f.service.details(pk, id)
  assert.equal(a.region.label, 'Los Angeles')
  assert.equal(a.hours.windows[0].end, 1560)
  await f.service.details(pk, id)
  assert.equal(f.calls(), 1)
  await assert.rejects(f.service.details('USER#other', id), /not_found/)
  assert.equal(f.calls(), 1)
})
test('region keys distinguish identically named cities across states and normalize casing', () => {
  const a = {
    Country: { Code2: 'US' },
    Region: { Code: 'CA' },
    Locality: 'Springfield',
  }
  assert.notEqual(
    regionFor(a, place).key,
    regionFor({ ...a, Region: { Code: 'IL' } }, place).key,
  )
  assert.equal(
    regionFor(a, place).key,
    regionFor({ ...a, Locality: ' SPRINGFIELD ' }, place).key,
  )
  assert.equal(regionFor({}, place).level, 'country')
})
test('failed refresh keeps old hours visibly stale and backs off repeated provider calls', async () => {
  const f = fixture()
  await f.service.details(pk, id)
  const cache = [...f.client.data.values()].find((x) =>
    x.pk.startsWith('PLACEDETAILS#'),
  )
  cache.retryAt = 0
  cache.data.checkedAt = '2020-01-01T00:00:00Z'
  f.break()
  assert.equal((await f.service.details(pk, id)).stale, true)
  await f.service.details(pk, id)
  assert.equal(f.calls(), 2)
})
test('preferences persist per account, reject stale writes and arbitrary colors, and reset overrides', async () => {
  const f = fixture(),
    key = 'default'
  assert.deepEqual(await f.service.preferences(pk, 'GET', {}), {
    colors: {},
    version: 0,
  })
  const a = await f.service.preferences(pk, 'PATCH', {
    collectionId: key,
    color: '#426b57',
    version: 0,
  })
  assert.equal(a.colors[key], '#426b57')
  await assert.rejects(
    f.service.preferences('USER#other', 'PATCH', {
      collectionId: key,
      color: '#426b57',
      version: 0,
    }),
    /collection_not_found/,
  )
  assert.deepEqual(
    (await f.service.preferences('USER#other', 'GET', {})).colors,
    {},
  )
  await assert.rejects(
    f.service.preferences(pk, 'PATCH', {
      collectionId: key,
      color: '#426782',
      version: 0,
    }),
    /conflict/,
  )
  await assert.rejects(
    f.service.preferences(pk, 'PATCH', {
      collectionId: key,
      color: 'red',
      version: 1,
    }),
    /invalid/,
  )
  assert.deepEqual(
    (
      await f.service.preferences(pk, 'PATCH', {
        collectionId: key,
        color: null,
        version: 1,
      })
    ).colors,
    {},
  )
})
test('daily global quota stops paid detail lookups before provider invocation', async () => {
  const f = fixture()
  const day = Math.floor(Date.now() / 86400000)
  f.client.data.set(`DETAILSLIMIT#GLOBAL#${day}|COUNT`, {
    pk: `DETAILSLIMIT#GLOBAL#${day}`,
    sk: 'COUNT',
    count: 200,
  })
  await assert.rejects(f.service.details(pk, id), /details_limit/)
  assert.equal(f.calls(), 0)
})
test('HTTP preferences require an authenticated access token and details respect ownership', async () => {
  const client = db(),
    handler = createHandler({ client, table: 'test' })
  const call = (path, owner) =>
    handler({
      rawPath: path,
      requestContext: {
        http: { method: 'GET' },
        ...(owner
          ? {
              authorizer: {
                jwt: { claims: { sub: owner, token_use: 'access' } },
              },
            }
          : {}),
      },
    })
  assert.equal((await call('/map-preferences')).statusCode, 401)
  assert.equal((await call('/map-preferences', 'owner')).statusCode, 200)
  assert.equal((await call(`/places/${id}/details`, 'other')).statusCode, 404)
})
