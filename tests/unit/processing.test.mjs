import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createProcessing } from '../../backend/processing.mjs'
const decode = (item) =>
  Object.fromEntries(
    Object.entries(item).map(([k, v]) => [k, v.N ? Number(v.N) : v.S]),
  )
const encode = (item) =>
  Object.fromEntries(
    Object.entries(item).map(([k, v]) => [
      k,
      typeof v === 'number' ? { N: String(v) } : { S: v },
    ]),
  )
const key = (item) => item.pk + '|' + item.sk
function fixture(options = {}) {
  const records = new Map(),
    invoked = []
  let time = Date.now(),
    extracts = 0,
    quotaBlocked = false
  const db = {
    async send(command) {
      const p = command.input,
        name = command.constructor.name
      if (name === 'GetItemCommand')
        return { Item: records.get(key(decode(p.Key))) }
      if (name === 'PutItemCommand') {
        const value = decode(p.Item),
          existing = records.get(key(value))
        if (
          p.ConditionExpression &&
          existing &&
          decode(existing).expiresAt >= time / 1000
        )
          throw Object.assign(Error(), {
            name: 'ConditionalCheckFailedException',
          })
        records.set(key(value), p.Item)
        return {}
      }
      if (name === 'DeleteItemCommand') {
        records.delete(key(decode(p.Key)))
        return {}
      }
      if (name === 'UpdateItemCommand') {
        const id = key(decode(p.Key)),
          record = decode(records.get(id))
        if (record.status !== 'queued')
          throw Object.assign(Error(), {
            name: 'ConditionalCheckFailedException',
          })
        records.set(id, encode({ ...record, status: 'running' }))
        return {}
      }
      if (name === 'TransactWriteItemsCommand') {
        const put = p.TransactItems[2].Put
        if (quotaBlocked || records.has(key(decode(put.Item))))
          throw Object.assign(Error(), {
            name: 'TransactionCanceledException',
            CancellationReasons: [
              { Code: quotaBlocked ? 'ConditionalCheckFailed' : 'None' },
            ],
          })
        assert.equal(p.TransactItems.length, 3)
        assert.ok(
          p.TransactItems[0].Update.ConditionExpression.includes(':limit'),
        )
        assert.equal(decode(p.TransactItems[1].Update.Key).pk, 'GLOBAL')
        records.set(key(decode(put.Item)), put.Item)
        return {}
      }
      throw Error(name)
    },
  }
  const handler = createProcessing({
    db,
    lambda: {
      async send(c) {
        invoked.push(JSON.parse(Buffer.from(c.input.Payload)))
        return {}
      },
    },
    table: 'test',
    functionName: 'test',
    now: () => time,
    extract: async () => {
      extracts++
      return { fetchedImages: 2, result: { places: [] } }
    },
    ...options,
  })
  const event = (method, body, id, owner = 'user-a') => ({
    requestContext: {
      http: { method },
      authorizer: { jwt: { claims: { sub: owner, token_use: 'access' } } },
    },
    body: JSON.stringify(body),
    pathParameters: { id },
  })
  const submit = (body, owner) => handler(event('POST', body, undefined, owner))
  const get = (id, owner) => handler(event('GET', undefined, id, owner))
  return {
    handler,
    records,
    invoked,
    submit,
    get,
    event,
    extracts: () => extracts,
    block: () => {
      quotaBlocked = true
    },
    advance: (ms) => {
      time += ms
    },
  }
}
const job = () => ({
  id: randomUUID(),
  operation: 'import',
  payload: { input: 'https://www.instagram.com/p/DfFCMjzk02S/' },
})
test('jobs reject unauthenticated requests and malformed input before scheduling work', async () => {
  const f = fixture()
  assert.equal((await f.handler({})).statusCode, 401)
  for (const body of [
    {},
    null,
    { ...job(), payload: { input: 'https://evil.test/' } },
    { ...job(), operation: 'execute' },
  ])
    assert.equal((await f.submit(body)).statusCode, 400)
  assert.equal(f.invoked.length, 0)
})
test('job creation is idempotent, payload-bound, and isolated by account', async () => {
  const f = fixture(),
    input = job()
  assert.equal((await f.submit(input)).statusCode, 202)
  assert.equal((await f.submit(input)).statusCode, 202)
  assert.equal(f.invoked.length, 1)
  assert.equal(
    (
      await f.submit({
        ...input,
        payload: { input: 'https://www.instagram.com/p/Another/' },
      })
    ).statusCode,
    409,
  )
  assert.equal((await f.get(input.id, 'user-b')).statusCode, 404)
  assert.equal(JSON.parse((await f.get(input.id)).body).status, 'queued')
  await f.handler(f.invoked[0])
  await f.handler(f.invoked[0])
  assert.equal(f.extracts(), 1)
  assert.equal(JSON.parse((await f.get(input.id)).body).result.fetchedImages, 2)
})
test('quota rejection cannot invoke paid processing; stale jobs time out and expire', async () => {
  const f = fixture(),
    input = job()
  await f.submit(input)
  f.advance(151000)
  assert.equal(
    JSON.parse((await f.get(input.id)).body).code,
    'processing_timeout',
  )
  f.advance(86400000)
  assert.equal((await f.get(input.id)).statusCode, 404)
  f.block()
  assert.equal((await f.submit(job())).statusCode, 429)
  assert.equal(f.invoked.length, 1)
})
test('worker failures are sanitized and never retried as duplicate paid work', async () => {
  const f = fixture({
      extract: async () => {
        throw Error('secret provider diagnostics')
      },
    }),
    input = job()
  await f.submit(input)
  await f.handler(f.invoked[0])
  const result = await f.get(input.id)
  assert.equal(JSON.parse(result.body).status, 'failed')
  assert.ok(!result.body.includes('secret'))
})
test('selection store survives worker lifetimes but cannot cross accounts or expiry', async () => {
  const token = randomUUID()
  const f = fixture({
    serviceFactory: ({ selectionStore }) => ({
      async search() {
        await selectionStore.set(token, {
          expires: Date.now() + 10000,
          placeId: 'museum',
        })
        return { selectionToken: token }
      },
      async details() {
        const found = await selectionStore.get(token)
        if (!found) throw Error('missing')
        return { placeId: found.placeId }
      },
      close() {},
    }),
  })
  const search = {
    id: randomUUID(),
    operation: 'search',
    payload: { query: 'Museum', region: 'LA', countryCode: 'US' },
  }
  await f.submit(search)
  await f.handler(f.invoked.at(-1))
  const detail = () => ({
    id: randomUUID(),
    operation: 'details',
    payload: { selectionToken: token },
  })
  const a = detail()
  await f.submit(a)
  await f.handler(f.invoked.at(-1))
  assert.equal(JSON.parse((await f.get(a.id)).body).result.placeId, 'museum')
  const b = detail()
  await f.submit(b, 'user-b')
  await f.handler(f.invoked.at(-1))
  assert.equal(JSON.parse((await f.get(b.id, 'user-b')).body).status, 'failed')
  f.advance(20000)
  const c = detail()
  await f.submit(c)
  await f.handler(f.invoked.at(-1))
  assert.equal(JSON.parse((await f.get(c.id)).body).status, 'failed')
})

test('two occupied leases reject excess paid work and expired leases recover', async () => {
  const f = fixture()
  for (let i = 0; i < 2; i++)
    f.records.set(
      `GLOBAL|WORKER#${i}`,
      encode({
        pk: 'GLOBAL',
        sk: `WORKER#${i}`,
        leaseId: 'occupied',
        expiresAt: Math.floor(Date.now() / 1000) + 135,
      }),
    )
  const first = job()
  await f.submit(first)
  await f.handler(f.invoked.at(-1))
  assert.equal(JSON.parse((await f.get(first.id)).body).code, 'processing_busy')
  assert.equal(f.extracts(), 0)
  f.advance(136000)
  const next = job()
  await f.submit(next)
  await f.handler(f.invoked.at(-1))
  assert.equal(JSON.parse((await f.get(next.id)).body).status, 'complete')
  assert.equal(f.extracts(), 1)
  assert.equal(f.records.has('GLOBAL|WORKER#0'), false)
})

test('transaction contention is retryable and is not misreported as a daily quota', async () => {
  const f = fixture({
    db: {
      async send(command) {
        if (command.constructor.name === 'GetItemCommand') return {}
        if (command.constructor.name === 'TransactWriteItemsCommand')
          throw Object.assign(Error(), {
            name: 'TransactionCanceledException',
            CancellationReasons: [{ Code: 'TransactionConflict' }],
          })
        throw Error('unexpected write')
      },
    },
  })
  const response = await f.submit(job())
  assert.equal(response.statusCode, 429)
  assert.equal(JSON.parse(response.body).code, 'processing_throttled')
  assert.equal(f.invoked.length, 0)
})
