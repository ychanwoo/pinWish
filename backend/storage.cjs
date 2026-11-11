const { createCollections } = require('./collections.cjs')
const { createPhotos } = require('./photos.cjs')
const { isDeepStrictEqual } = require('node:util')
const { createHash } = require('node:crypto')
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
} = require('@aws-sdk/client-dynamodb')
const encode = (v) =>
  typeof v === 'string'
    ? { S: v }
    : typeof v === 'number'
      ? { N: String(v) }
      : typeof v === 'boolean'
        ? { BOOL: v }
        : Array.isArray(v)
          ? { L: v.map(encode) }
          : {
              M: Object.fromEntries(
                Object.entries(v)
                  .filter(([, x]) => x !== undefined)
                  .map(([k, x]) => [k, encode(x)]),
              ),
            }
const decode = (v) =>
  'S' in v
    ? v.S
    : 'N' in v
      ? Number(v.N)
      : 'BOOL' in v
        ? v.BOOL
        : 'L' in v
          ? v.L.map(decode)
          : Object.fromEntries(
              Object.entries(v.M).map(([k, x]) => [k, decode(x)]),
            )
const marshal = (v) => encode(v).M
const unmarshal = (v) => (v ? decode({ M: v }) : undefined)
const hash = (s) => createHash('sha256').update(s).digest('hex')
class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
  }
}
const fail = (status, code) => {
  throw new HttpError(status, code)
}
function str(v, max, empty = false) {
  if (
    typeof v !== 'string' ||
    v.length > max ||
    (!empty && !v.trim()) ||
    [...v].some((c) => c.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(c))
  )
    fail(400, 'invalid_input')
  return v.trim()
}
function validatePlace(body, direct = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail(400, 'invalid_input')
  const p = body.place
  if (
    !p ||
    p.provider !== 'amazon-location' ||
    ![
      'PointOfInterest',
      'PointAddress',
      'InterpolatedAddress',
      'Street',
      'Intersection',
    ].includes(p.placeType)
  )
    fail(400, 'invalid_place')
  const countryCode = str(p.countryCode, 2)
  if (!/^[A-Z]{2}$/.test(countryCode) || ['KR', 'ZZ'].includes(countryCode))
    fail(400, 'invalid_country')
  const { longitude, latitude } = p.coordinates ?? {}
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    fail(400, 'invalid_coordinates')
  let cleanSource = null
  if (!direct) {
    const source = p.source
    if (
      !source ||
      !Array.isArray(source.slides) ||
      !source.slides.length ||
      source.slides.length > 30 ||
      source.slides.some((n) => !Number.isInteger(n) || n < 1 || n > 30)
    )
      fail(400, 'invalid_source')
    const originalUrl = str(source.instagram?.originalUrl, 2048)
    let url
    try {
      url = new URL(originalUrl)
    } catch {
      fail(400, 'invalid_source')
    }
    if (
      url.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/p\/[A-Za-z0-9_-]{1,64}\/?$/.test(url.pathname)
    )
      fail(400, 'invalid_source')
    const canonicalUrl = `https://www.instagram.com/p/${url.pathname.split('/')[2]}/`
    cleanSource = {
      originalUrl,
      canonicalUrl,
      slides: [...new Set(source.slides)].sort((a, b) => a - b),
      extractedName: str(source.extractedName, 500),
      evidence: str(source.evidence, 2000, true),
      ...(source.correctedName
        ? { correctedName: str(source.correctedName, 500) }
        : {}),
    }
  }
  const place = {
    provider: 'amazon-location',
    placeId: str(p.placeId, 500),
    name: str(p.name, 500),
    displayName: str(p.displayName, 500),
    countryCode,
    countryName: str(p.countryName, 200),
    address: str(p.address, 1000),
    coordinates: { longitude, latitude },
    placeType: p.placeType,
    englishName: p.englishName === null ? null : str(p.englishName, 500),
    koreanName: p.koreanName === null ? null : str(p.koreanName, 500),
  }
  // DynamoDB marshaller has no null case: omit unavailable localized names.
  if (place.englishName === null) delete place.englishName
  if (place.koreanName === null) delete place.koreanName
  for (const field of ['retrievedAt', 'confirmedAt']) {
    if (typeof p[field] !== 'string' || !Number.isFinite(Date.parse(p[field])))
      fail(400, 'invalid_timestamp')
    place[field] = p[field]
  }
  return {
    place,
    source: cleanSource,
    note: str(body.note ?? '', 1000, true),
    collection: str(body.collection ?? 'Saved places', 60),
  }
}
function createHandler({
  client = new DynamoDBClient({}),
  table = process.env.TABLE_NAME,
  photoOptions = {},
  jobsTable = process.env.JOBS_TABLE,
} = {}) {
  const send = (command) => client.send(command)
  const read = async (key) =>
    unmarshal(
      (
        await send(
          new GetItemCommand({
            TableName: table,
            Key: marshal(key),
            ConsistentRead: true,
          }),
        )
      ).Item,
    )
  const photos = createPhotos({
    ...photoOptions,
    read,
    fail,
    write: (item, version) =>
      send(
        new PutItemCommand({
          TableName: table,
          Item: marshal(item),
          ConditionExpression: '#v = :v',
          ExpressionAttributeNames: { '#v': 'version' },
          ExpressionAttributeValues: marshal({ ':v': version }),
        }),
      ),
  })
  const collections = createCollections({
    send,
    table,
    marshal,
    unmarshal,
    fail,
  })
  const publicItem = (item) => {
    const { pk: _pk, sk: _sk, ...rest } = item
    return rest
  }
  return async (event) => {
    const response = (status, data) => ({
      statusCode: status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: JSON.stringify(data),
    })
    if (
      event.source === 'aws.events' &&
      !event.requestContext &&
      event['detail-type'] === 'Scheduled Event'
    )
      return photos.cleanup()
    if (event.source === 'pinwish.photo' && !event.requestContext) {
      if (
        !/^USER#[a-zA-Z0-9-]{1,128}$/.test(event.key?.pk ?? '') ||
        !/^PLACE#[a-f0-9]{64}$/.test(event.key?.sk ?? '') ||
        typeof event.jobId !== 'string'
      )
        return
      return photos.process(event.key, event.jobId)
    }
    const startPhoto = async (key, item) => {
      try {
        return (await photos.ensure(key)) ?? item
      } catch {
        return item
      }
    }
    try {
      const photoRoute = /\/places\/[a-f0-9]{64}\/photo$/.test(
        event.rawPath ?? '',
      )
      const claims = event.requestContext?.authorizer?.jwt?.claims
      if (
        !claims ||
        claims.token_use !== 'access' ||
        typeof claims.sub !== 'string' ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(claims.sub)
      )
        fail(401, 'unauthorized')
      const pk = `USER#${claims.sub}`
      const method = event.requestContext?.http?.method
      const id = event.pathParameters?.id
      const collectionRoute = /^\/collections(?:\/[^/]+)?$/.test(
        event.rawPath ?? '',
      )
      if (!collectionRoute && id && !/^[a-f0-9]{64}$/.test(id))
        fail(400, 'invalid_id')
      const key = id ? { pk, sk: `PLACE#${id}` } : null
      let body = {}
      if (['POST', 'PATCH', 'DELETE'].includes(method)) {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
          : (event.body ?? '{}')
        if (Buffer.byteLength(raw) > 24000) fail(413, 'input_too_large')
        try {
          body = JSON.parse(raw)
        } catch {
          fail(400, 'invalid_json')
        }
        if (!body || typeof body !== 'object' || Array.isArray(body))
          fail(400, 'invalid_input')
      }
      if (collectionRoute) {
        const result = await collections.route(pk, method, id, body)
        return response(result.status, result.data)
      }
      if (photoRoute && key) {
        const result = await photos.handle(method, key, body)
        if (result.item)
          result.item = publicItem(
            collections.present(await collections.ensure(pk), result.item),
          )
        return response(200, result)
      }
      const catalog = await collections.ensure(pk)
      const present = (item) => publicItem(collections.present(catalog, item))
      if (method === 'GET' && !id) {
        const q = event.queryStringParameters ?? {}
        const limit = q.limit === undefined ? 20 : Number(q.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
          fail(400, 'invalid_limit')
        let start
        if (q.cursor) {
          try {
            start = JSON.parse(Buffer.from(q.cursor, 'base64url').toString())
            if (
              q.cursor.length > 1024 ||
              start.pk !== pk ||
              !/^PLACE#[a-f0-9]{64}$/.test(start.sk) ||
              Object.keys(start).length !== 2
            )
              throw Error()
          } catch {
            fail(400, 'invalid_cursor')
          }
        }
        const result = await send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: marshal({
              ':pk': pk,
              ':prefix': 'PLACE#',
            }),
            Limit: limit,
            ConsistentRead: true,
            ...(start ? { ExclusiveStartKey: marshal(start) } : {}),
          }),
        )
        return response(200, {
          items: (result.Items ?? []).map((x) => present(unmarshal(x))),
          collectionVersion: catalog.version,
          cursor: result.LastEvaluatedKey
            ? Buffer.from(
                JSON.stringify(unmarshal(result.LastEvaluatedKey)),
              ).toString('base64url')
            : null,
        })
      }
      if (method === 'GET' && key) {
        const item = await read(key)
        if (!item) fail(404, 'not_found')
        return response(200, { item: present(item) })
      }
      if (method === 'POST' && !id) {
        let directOrigin
        if (body.directSearch !== undefined) {
          const input = body.directSearch
          if (!input || !/^[0-9a-f-]{36}$/.test(input.detailsJobId ?? ''))
            fail(400, 'invalid_selection')
          const query = str(input.query, 200)
          const region = str(input.region ?? '', 200, true)
          if (!jobsTable) fail(503, 'storage_unavailable')
          const result = await send(
            new GetItemCommand({
              TableName: jobsTable,
              Key: marshal({ pk, sk: `JOB#${input.detailsJobId}` }),
              ConsistentRead: true,
            }),
          )
          const job = unmarshal(result.Item)
          if (
            !job ||
            job.operation !== 'details' ||
            job.status !== 'complete' ||
            !(job.expiresAt > Date.now() / 1000)
          )
            fail(409, 'selection_expired')
          let verified
          try {
            verified = JSON.parse(job.result).place
          } catch {
            fail(409, 'selection_expired')
          }
          if (!verified?.englishName) fail(422, 'english_name_unavailable')
          body = {
            ...body,
            place: {
              ...verified,
              displayName: verified.englishName,
              confirmedAt: new Date().toISOString(),
            },
          }
          directOrigin = { query, region }
        }
        const value = validatePlace(body, !!directOrigin)
        const bound = await collections.bind(pk, body)
        const id = hash(`amazon-location:${value.place.placeId}`)
        const key = { pk, sk: `PLACE#${id}` }
        const sourceId = value.source
          ? hash(
              value.source.canonicalUrl + JSON.stringify(value.source.slides),
            )
          : null
        for (let attempt = 0; attempt < 4; attempt++) {
          const previous = await read(key)
          if (
            previous &&
            (directOrigin ||
              (previous.sources[sourceId] &&
                isDeepStrictEqual(previous.sources[sourceId], value.source)))
          )
            return response(200, {
              item: publicItem(
                collections.present(
                  bound.catalog,
                  await startPhoto(key, previous),
                ),
              ),
              duplicate: true,
            })
          if (
            previous &&
            sourceId &&
            Object.keys(previous.sources).length >= 30 &&
            !previous.sources[sourceId]
          )
            fail(409, 'source_limit')
          const now = new Date().toISOString()
          const item = previous
            ? {
                ...previous,
                sources: { ...previous.sources, [sourceId]: value.source },
                version: previous.version + 1,
                updatedAt: now,
              }
            : {
                ...key,
                id,
                ...value.place,
                note: value.note,
                collection: bound.collection.name,
                collectionId: bound.collection.id,
                visited: false,
                bookmarked: true,
                sources: sourceId ? { [sourceId]: value.source } : {},
                ...(directOrigin ? { searchOrigin: directOrigin } : {}),
                version: 1,
                createdAt: now,
                updatedAt: now,
              }
          try {
            await collections.writePlace(bound.catalog, item, previous?.version)
            return response(previous ? 200 : 201, {
              item: publicItem(
                collections.present(bound.catalog, await startPhoto(key, item)),
              ),
              duplicate: !!previous,
            })
          } catch (e) {
            if (e.name !== 'ConditionalCheckFailedException') throw e
          }
        }
        fail(409, 'conflict')
      }
      if (['PATCH', 'DELETE'].includes(method) && key) {
        if (!Number.isInteger(body.version) || body.version < 1)
          fail(400, 'invalid_version')
        const previous = await read(key)
        if (!previous) fail(404, 'not_found')
        if (previous.version !== body.version) fail(409, 'conflict')
        const condition = {
          TableName: table,
          ConditionExpression: '#v = :v',
          ExpressionAttributeNames: { '#v': 'version' },
          ExpressionAttributeValues: marshal({ ':v': body.version }),
        }
        if (method === 'DELETE') {
          await send(new DeleteItemCommand({ ...condition, Key: marshal(key) }))
          await photos.remove(previous.coverPhoto?.objectKey)
          return response(200, { deleted: true })
        }
        const allowed = new Set([
          'version',
          'note',
          'collection',
          'collectionId',
          'visited',
          'bookmarked',
        ])
        if (
          Object.keys(body).some((k) => !allowed.has(k)) ||
          Object.keys(body).length < 2
        )
          fail(400, 'invalid_patch')
        const changes = {}
        if ('note' in body) changes.note = str(body.note, 1000, true)
        const bound =
          'collectionId' in body || 'collection' in body
            ? await collections.bind(pk, body)
            : {
                catalog,
                collection: collections.resolve(catalog, previous),
              }
        changes.collectionId = bound.collection.id
        changes.collection = bound.collection.name
        for (const field of ['visited', 'bookmarked'])
          if (field in body) {
            if (typeof body[field] !== 'boolean') fail(400, 'invalid_patch')
            changes[field] = body[field]
          }
        const item = {
          ...previous,
          ...changes,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
        }
        await collections.writePlace(bound.catalog, item, body.version)
        return response(200, {
          item: publicItem(collections.present(bound.catalog, item)),
        })
      }
      fail(404, 'not_found')
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException')
        return response(409, { code: 'conflict' })
      if (e instanceof HttpError) return response(e.status, { code: e.message })
      console.error(JSON.stringify({ code: 'storage_failure', type: e.name }))
      return response(503, { code: 'storage_unavailable' })
    }
  }
}
exports.handler = createHandler()
exports.createHandler = createHandler
exports.marshal = marshal
exports.unmarshal = unmarshal
exports.validatePlace = validatePlace
