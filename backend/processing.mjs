import { createHash } from 'node:crypto'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { parseInstagramLink } from '../src/lib/instagram.ts'
import { extractPlaces } from '../scripts/instagram/extract-places.mjs'
import {
  createPlaceService,
  validateSearch,
  placeError,
} from '../scripts/places/service.mjs'
import { importErrorCode } from '../scripts/instagram/errors.mjs'
const encode = (value) =>
  typeof value === 'string'
    ? { S: value }
    : typeof value === 'number'
      ? { N: String(value) }
      : { S: JSON.stringify(value) }
const item = (value) =>
  Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]))
const decode = (value) =>
  value &&
  Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, v.N ? Number(v.N) : v.S]),
  )
const key = (owner, id) => ({ pk: `USER#${owner}`, sk: id })
const fail = (status, code) => {
  throw Object.assign(Error(code), { status })
}
export function createProcessing({
  db = new DynamoDBClient({}),
  lambda = new LambdaClient({}),
  table = process.env.JOBS_TABLE,
  functionName = process.env.WORKER_FUNCTION ??
    process.env.AWS_LAMBDA_FUNCTION_NAME,
  extract = extractPlaces,
  serviceFactory = createPlaceService,
  now = Date.now,
} = {}) {
  const get = async (k) =>
    decode(
      (
        await db.send(
          new GetItemCommand({
            TableName: table,
            Key: item(k),
            ConsistentRead: true,
          }),
        )
      ).Item,
    )
  const put = async (value) =>
    db.send(new PutItemCommand({ TableName: table, Item: item(value) }))
  const sendJob = async (owner, id) =>
    lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: Buffer.from(
          JSON.stringify({ source: 'pinwish.processing', owner, id }),
        ),
      }),
    )
  async function run(owner, id) {
    const k = key(owner, `JOB#${id}`),
      job = await get(k)
    if (!job || job.status !== 'queued' || job.expiresAt < now() / 1000) return
    try {
      await db.send(
        new UpdateItemCommand({
          TableName: table,
          Key: item(k),
          UpdateExpression: 'SET #s = :running',
          ConditionExpression: '#s = :queued',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: item({
            ':running': 'running',
            ':queued': 'queued',
          }),
        }),
      )
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') return
      throw e
    }
    let service, lease
    try {
      // Low-quota AWS accounts cannot reserve positive concurrency. Two short-lived
      // leases bound paid work while leaving the separate API Lambda responsive.
      for (let slot = 0; slot < 2; slot++) {
        const candidate = { pk: 'GLOBAL', sk: `WORKER#${slot}` }
        try {
          await db.send(
            new PutItemCommand({
              TableName: table,
              Item: item({
                ...candidate,
                leaseId: id,
                expiresAt: Math.floor(now() / 1000) + 135,
              }),
              ConditionExpression:
                'attribute_not_exists(pk) OR expiresAt < :now',
              ExpressionAttributeValues: item({
                ':now': Math.floor(now() / 1000),
              }),
            }),
          )
          lease = candidate
          break
        } catch (error) {
          if (error.name !== 'ConditionalCheckFailedException') throw error
        }
      }
      if (!lease)
        throw Object.assign(Error('processing_busy'), {
          processingCode: 'processing_busy',
        })
      const payload = JSON.parse(job.payload)
      let result
      if (job.operation === 'import') {
        const parsed = parseInstagramLink(payload.input)
        result = {
          source: parsed.source,
          ...(await extract(parsed.source.shortcode)),
        }
      } else {
        service = serviceFactory({
          selectionStore: {
            get: async (token) => {
              const stored = await get(key(owner, `SELECTION#${token}`))
              return stored && stored.expiresAt > now() / 1000
                ? JSON.parse(stored.value)
                : undefined
            },
            set: async (token, value) =>
              put({
                ...key(owner, `SELECTION#${token}`),
                value: JSON.stringify(value),
                expiresAt: Math.floor(value.expires / 1000),
              }),
          },
        })
        result = await service[job.operation](
          payload,
          AbortSignal.timeout(25000),
        )
      }
      const json = JSON.stringify(result)
      if (Buffer.byteLength(json) > 280000) throw Error('result_too_large')
      await put({ ...job, ...k, status: 'complete', result: json })
    } catch (e) {
      await put({
        ...job,
        ...k,
        status: 'failed',
        code:
          e.processingCode ??
          (job.operation === 'import'
            ? importErrorCode(e)
            : placeError(e).code),
      })
    } finally {
      service?.close()
      if (lease)
        await db
          .send(
            new DeleteItemCommand({
              TableName: table,
              Key: item(lease),
              ConditionExpression: 'leaseId = :id',
              ExpressionAttributeValues: item({ ':id': id }),
            }),
          )
          .catch(() => {})
    }
  }
  return async (event) => {
    if (event.source === 'pinwish.processing' && !event.requestContext) {
      if (
        !/^[a-zA-Z0-9-]{1,128}$/.test(event.owner ?? '') ||
        !/^[a-f0-9-]{36}$/.test(event.id ?? '')
      )
        return
      return run(event.owner, event.id)
    }
    const reply = (status, data) => ({
      statusCode: status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(data),
    })
    try {
      const claims = event.requestContext?.authorizer?.jwt?.claims
      if (
        claims?.token_use !== 'access' ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(claims?.sub ?? '')
      )
        fail(401, 'unauthorized')
      const owner = claims.sub,
        method = event.requestContext.http.method
      if (method === 'GET') {
        const id = event.pathParameters?.id
        if (!/^[a-f0-9-]{36}$/.test(id ?? '')) fail(400, 'invalid_job')
        const job = await get(key(owner, `JOB#${id}`))
        if (!job || job.expiresAt < now() / 1000) fail(404, 'job_not_found')
        if (
          ['running', 'queued'].includes(job.status) &&
          now() - job.createdAt > 150000
        )
          return reply(200, {
            id,
            status: 'failed',
            code: 'processing_timeout',
          })
        return reply(200, {
          id,
          status: job.status,
          ...(job.result ? { result: JSON.parse(job.result) } : {}),
          ...(job.code ? { code: job.code } : {}),
        })
      }
      if (method !== 'POST') fail(405, 'method_not_allowed')
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString()
        : (event.body ?? '')
      if (Buffer.byteLength(raw) > 4096) fail(413, 'input_too_large')
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        fail(400, 'invalid_json')
      }
      const { operation, payload, id } = body ?? {}
      if (
        !/^[a-f0-9-]{36}$/.test(id ?? '') ||
        !['import', 'search', 'details'].includes(operation) ||
        !payload ||
        typeof payload !== 'object'
      )
        fail(400, 'invalid_job')
      if (operation === 'import') {
        const parsed = parseInstagramLink(
          typeof payload.input === 'string' ? payload.input : '',
        )
        if (!parsed.ok) fail(400, parsed.code)
        if (parsed.source.kind !== 'p') fail(422, 'unsupported_media')
      } else if (operation === 'search') validateSearch(payload)
      else if (!/^[0-9a-f-]{36}$/.test(payload.selectionToken ?? ''))
        fail(400, 'invalid_selection')
      const hash = createHash('sha256')
        .update(JSON.stringify({ operation, payload }))
        .digest('hex')
      const previous = await get(key(owner, `JOB#${id}`))
      if (previous) {
        if (previous.hash !== hash) fail(409, 'job_conflict')
        return reply(202, { id, status: previous.status })
      }
      const day = new Date(now()).toISOString().slice(0, 10),
        kind = operation === 'import' ? 'import' : 'places'
      const cap = kind === 'import' ? 3 : 100,
        globalCap = kind === 'import' ? 20 : 1000
      const quota = (pk, limit) => ({
        Update: {
          TableName: table,
          Key: item({ pk, sk: `QUOTA#${day}#${kind}` }),
          UpdateExpression: 'SET expiresAt = :expiry ADD #n :one',
          ConditionExpression: 'attribute_not_exists(#n) OR #n < :limit',
          ExpressionAttributeNames: { '#n': 'count' },
          ExpressionAttributeValues: item({
            ':expiry': Math.floor(now() / 1000) + 172800,
            ':one': 1,
            ':limit': limit,
          }),
        },
      })
      const job = {
        ...key(owner, `JOB#${id}`),
        operation,
        payload: JSON.stringify(payload),
        hash,
        status: 'queued',
        createdAt: now(),
        expiresAt: Math.floor(now() / 1000) + 86400,
      }
      try {
        await db.send(
          new TransactWriteItemsCommand({
            TransactItems: [
              quota(`USER#${owner}`, cap),
              quota('GLOBAL', globalCap),
              {
                Put: {
                  TableName: table,
                  Item: item(job),
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        )
      } catch (e) {
        if (e.name === 'TransactionCanceledException') {
          const raced = await get(key(owner, `JOB#${id}`))
          if (raced?.hash === hash)
            return reply(202, { id, status: raced.status })
          if (raced) fail(409, 'job_conflict')
          const quotaExceeded = e.CancellationReasons?.slice(0, 2).some(
            (reason) => reason.Code === 'ConditionalCheckFailed',
          )
          fail(429, quotaExceeded ? 'daily_limit' : 'processing_throttled')
        }
        throw e
      }
      try {
        await sendJob(owner, id)
      } catch {
        await put({ ...job, status: 'failed', code: 'processing_unavailable' })
        fail(503, 'processing_unavailable')
      }
      return reply(202, { id, status: 'queued' })
    } catch (e) {
      return reply(e.status ?? 503, {
        code: e.status ? e.message : 'processing_unavailable',
      })
    }
  }
}
export const handler = createProcessing()
