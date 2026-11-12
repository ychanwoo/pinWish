const { randomUUID, randomBytes, createHash } = require('node:crypto')
const {
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} = require('@aws-sdk/client-dynamodb')
const {
  GeoPlacesClient,
  GetPlaceCommand,
} = require('@aws-sdk/client-geo-places')
const {
  GeoRoutesClient,
  CalculateRouteMatrixCommand,
} = require('@aws-sdk/client-geo-routes')
const {
  hoursFromAWS,
  visitEstimate,
  settingsFor,
  schedule,
  localISO,
  minutes,
} = require('./itinerary-planner.cjs')
const uuid = (v) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
const digest = (v) => createHash('sha256').update(v).digest('hex')
function createItineraries({
  read,
  send,
  table,
  marshal,
  unmarshal,
  collections,
  fail,
  placesClient = new GeoPlacesClient({ maxAttempts: 1 }),
  routesClient = new GeoRoutesClient({ maxAttempts: 1 }),
}) {
  const now = () => Math.floor(Date.now() / 1000)
  const put = (item) =>
    send(new PutItemCommand({ TableName: table, Item: marshal(item) }))
  async function collection(pk, id) {
    const c = await collections.ensure(pk)
    if (!c.collections[id] || c.collections[id].deleted)
      fail(404, 'collection_not_found')
    return c
  }
  async function owned(pk, id) {
    if (!uuid(id)) fail(400, 'invalid_itinerary')
    const p = await read({ pk, sk: 'TRIP#' + id })
    if (!p) fail(404, 'itinerary_not_found')
    await collection(pk, p.collectionId)
    return p
  }
  async function quota(pk) {
    for (const [key, limit] of [
      [pk + '#' + Math.floor(now() / 3600), 6],
      ['GLOBAL#' + Math.floor(now() / 86400), 50],
    ]) {
      try {
        await send(
          new UpdateItemCommand({
            TableName: table,
            Key: marshal({ pk: 'TRIPLIMIT#' + key, sk: 'COUNT' }),
            UpdateExpression: 'SET expiresAt = :ttl ADD #n :one',
            ConditionExpression: 'attribute_not_exists(#n) OR #n < :limit',
            ExpressionAttributeNames: { '#n': 'count' },
            ExpressionAttributeValues: marshal({
              ':ttl': now() + 172800,
              ':one': 1,
              ':limit': limit,
            }),
          }),
        )
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException')
          fail(429, 'itinerary_limit')
        throw e
      }
    }
  }
  const present = (p) => ({
    id: p.id,
    collectionId: p.collectionId,
    name: p.name,
    version: p.version,
    settings: p.settings,
    plan: p.plan,
    zone: p.zone,
    checkedAt: p.checkedAt,
    updatedAt: p.updatedAt,
    share:
      p.shareToken && p.shareExpiresAt > now()
        ? { token: p.shareToken, expiresAt: p.shareExpiresAt }
        : null,
  })
  async function request(client, command, deadline) {
    try {
      return await client.send(command, {
        abortSignal: deadline
          ? AbortSignal.any([deadline, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000),
      })
    } catch (e) {
      if (e.name === 'ThrottlingException') fail(429, 'itinerary_provider_busy')
      fail(502, 'itinerary_provider_unavailable')
    }
  }
  async function prepare(pk, id, body) {
    const catalog = await collection(pk, id)
    if (
      !Array.isArray(body.ids) ||
      body.ids.length < 3 ||
      body.ids.length > 20 ||
      new Set(body.ids).size !== body.ids.length ||
      body.ids.some((x) => !/^[a-f0-9]{64}$/.test(x))
    )
      fail(400, 'select_three_to_twenty_places')
    const rows = await Promise.all(
      body.ids.map((id) => read({ pk, sk: 'PLACE#' + id })),
    )
    if (rows.some((p) => !p || collections.resolve(catalog, p).id !== id))
      fail(409, 'itinerary_places_changed')
    await quota(pk)
    const places = []
    const deadline = AbortSignal.timeout(15000)
    // Bounded parallel reads to keep provider requests and API latency predictable.
    for (let i = 0; i < rows.length; i += 5)
      places.push(
        ...(await Promise.all(
          rows.slice(i, i + 5).map(async (p) => {
            const d = await request(
              placesClient,
              new GetPlaceCommand({
                PlaceId: p.placeId,
                Language: 'en',
                AdditionalFeatures: ['Contact', 'TimeZone'],
                IntendedUse: 'Storage',
              }),
              deadline,
            )
            if (!d.TimeZone?.Name) fail(422, 'itinerary_timezone_missing')
            try {
              new Intl.DateTimeFormat('en', { timeZone: d.TimeZone.Name })
            } catch {
              fail(422, 'itinerary_timezone_missing')
            }
            if (
              !d.Position ||
              Math.abs(d.Position[0] - p.coordinates.longitude) > 0.01 ||
              Math.abs(d.Position[1] - p.coordinates.latitude) > 0.01
            )
              fail(409, 'itinerary_places_changed')
            return {
              id: p.id,
              name: p.displayName ?? p.name,
              address: p.address,
              coordinates: p.coordinates,
              zone: d.TimeZone.Name,
              hours: hoursFromAWS(d.OpeningHours),
              suggestedDuration: visitEstimate(d.Categories),
            }
          }),
        )),
      )
    if (new Set(places.map((p) => p.zone)).size !== 1)
      fail(422, 'itinerary_multiple_timezones')
    const contextId = randomUUID(),
      checkedAt = new Date().toISOString()
    await put({
      pk,
      sk: 'TRIPCTX#' + contextId,
      id: contextId,
      collectionId: id,
      places,
      zone: places[0].zone,
      checkedAt,
      expiresAt: now() + 3600,
    })
    return { contextId, places, zone: places[0].zone, checkedAt }
  }
  async function preview(pk, body) {
    if (!uuid(body.contextId)) fail(400, 'invalid_itinerary')
    const context = await read({ pk, sk: 'TRIPCTX#' + body.contextId })
    if (!context || context.expiresAt <= now())
      fail(409, 'itinerary_context_expired')
    const catalog = await collection(pk, context.collectionId)
    let settings
    try {
      settings = settingsFor(body.settings, context.places)
    } catch (e) {
      if (e.status === 400) fail(400, e.message)
      throw e
    }
    const places = context.places.filter((p) =>
      settings.stops.some((s) => s.id === p.id),
    )
    for (const p of places) {
      const row = await read({ pk, sk: 'PLACE#' + p.id })
      if (!row || collections.resolve(catalog, row).id !== context.collectionId)
        fail(409, 'itinerary_places_changed')
    }
    let departure
    try {
      departure = localISO(settings.date, minutes(settings.start), context.zone)
    } catch (e) {
      if (e.status === 400) fail(400, e.message)
      throw e
    }
    const cacheId = digest(
      JSON.stringify([places.map((p) => p.id), settings.mode, departure]),
    )
    let cached = await read({
      pk,
      sk: `TRIPMATRIX#${body.contextId}#${cacheId}`,
    })
    if (!cached || cached.expiresAt <= now()) {
      await quota(pk)
      const points = places.map((p) => ({
        Position: [p.coordinates.longitude, p.coordinates.latitude],
      }))
      const result = await request(
        routesClient,
        new CalculateRouteMatrixCommand({
          Origins: points,
          Destinations: points,
          TravelMode: settings.mode,
          DepartureTime: departure,
          RoutingBoundary: { Unbounded: true },
        }),
      )
      if (
        !Array.isArray(result.RouteMatrix) ||
        result.RouteMatrix.length !== places.length
      )
        fail(502, 'itinerary_provider_unavailable')
      // -1 denotes an unreachable route; do not invent straight-line travel estimates.
      const matrix = result.RouteMatrix.map((row) =>
        row.map((r) =>
          r.Error || !Number.isFinite(r.Duration)
            ? -1
            : Math.ceil((r.Duration / 60) * 1.2),
        ),
      )
      if (matrix.some((r) => r.length !== places.length))
        fail(502, 'itinerary_provider_unavailable')
      cached = {
        pk,
        sk: `TRIPMATRIX#${body.contextId}#${cacheId}`,
        matrix,
        expiresAt: context.expiresAt,
      }
      await put(cached)
    }
    const matrix = cached.matrix.map((row) =>
      row.map((v) => (v < 0 ? null : v)),
    )
    const plan = schedule(places, matrix, settings),
      previewId = randomUUID()
    await put({
      pk,
      sk: 'TRIPPREVIEW#' + previewId,
      collectionId: context.collectionId,
      settings,
      plan,
      zone: context.zone,
      checkedAt: context.checkedAt,
      expiresAt: context.expiresAt,
    })
    return {
      previewId,
      settings,
      plan,
      zone: context.zone,
      checkedAt: context.checkedAt,
    }
  }
  async function save(pk, body) {
    if (!uuid(body.previewId)) fail(400, 'invalid_itinerary')
    const p = await read({ pk, sk: 'TRIPPREVIEW#' + body.previewId })
    if (!p || p.expiresAt <= now()) fail(409, 'itinerary_context_expired')
    if (!p.plan.complete) fail(422, 'itinerary_incomplete')
    const catalog = await collection(pk, p.collectionId)
    for (const s of p.settings.stops) {
      const row = await read({ pk, sk: 'PLACE#' + s.id })
      if (!row || collections.resolve(catalog, row).id !== p.collectionId)
        fail(409, 'itinerary_places_changed')
    }
    // Stable caller ID makes a retried create idempotent.
    if (!uuid(body.id)) fail(400, 'invalid_itinerary')
    const previous = await read({ pk, sk: 'TRIP#' + body.id })
    if (previous?.previewId === body.previewId)
      return { item: present(previous) }
    if (previous && previous.version !== body.version)
      fail(409, 'itinerary_conflict')
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80 || /[\p{Cc}]/u.test(name))
      fail(400, 'invalid_itinerary_name')
    const item = {
      pk,
      sk: 'TRIP#' + body.id,
      id: body.id,
      collectionId: p.collectionId,
      name,
      version: (previous?.version ?? 0) + 1,
      previewId: body.previewId,
      settings: p.settings,
      plan: p.plan,
      zone: p.zone,
      checkedAt: p.checkedAt,
      updatedAt: new Date().toISOString(),
      ...(previous?.shareToken
        ? {
            shareToken: previous.shareToken,
            shareExpiresAt: previous.shareExpiresAt,
          }
        : {}),
    }
    try {
      await send(
        new PutItemCommand({
          TableName: table,
          Item: marshal(item),
          ConditionExpression: previous
            ? '#v = :v'
            : 'attribute_not_exists(pk)',
          ...(previous
            ? {
                ExpressionAttributeNames: { '#v': 'version' },
                ExpressionAttributeValues: marshal({ ':v': previous.version }),
              }
            : {}),
        }),
      )
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException')
        fail(409, 'itinerary_conflict')
      throw e
    }
    return { item: present(item) }
  }
  async function share(pk, id, method) {
    const p = await owned(pk, id)
    if (method === 'POST' && p.shareToken && p.shareExpiresAt > now())
      return { item: present(p) }
    if (method === 'POST') {
      p.shareToken = randomBytes(32).toString('hex')
      p.shareExpiresAt = now() + 30 * 86400
      await put({
        pk: 'TRIPSHARE#' + digest(p.shareToken),
        sk: 'LINK',
        owner: pk,
        id,
        expiresAt: p.shareExpiresAt,
      })
    } else {
      delete p.shareToken
      delete p.shareExpiresAt
    }
    const version = p.version
    p.version++
    try {
      await send(
        new PutItemCommand({
          TableName: table,
          Item: marshal(p),
          ConditionExpression: '#v = :v',
          ExpressionAttributeNames: { '#v': 'version' },
          ExpressionAttributeValues: marshal({ ':v': version }),
        }),
      )
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException')
        fail(409, 'itinerary_conflict')
      throw e
    }
    return { item: present(p) }
  }
  return {
    prepare,
    preview,
    save,
    async public(token) {
      if (!/^[a-f0-9]{64}$/.test(token ?? '')) fail(404, 'share_unavailable')
      const link = await read({ pk: 'TRIPSHARE#' + digest(token), sk: 'LINK' })
      if (!link || link.expiresAt <= now()) fail(404, 'share_unavailable')
      const p = await read({ pk: link.owner, sk: 'TRIP#' + link.id }),
        catalog = await read({ pk: link.owner, sk: 'COLLECTIONS' })
      if (
        !p ||
        p.shareToken !== token ||
        p.shareExpiresAt <= now() ||
        !catalog?.collections[p.collectionId] ||
        catalog.collections[p.collectionId].deleted
      )
        fail(404, 'share_unavailable')
      // An itinerary is an explicit snapshot. No notes, account IDs or provider IDs escape.
      return {
        name: p.name,
        plan: p.plan,
        zone: p.zone,
        checkedAt: p.checkedAt,
        updatedAt: p.updatedAt,
      }
    },
    async route(pk, method, id, action, body, query) {
      if (!id && method === 'POST') return save(pk, body)
      if (id === 'preview' && method === 'POST') return preview(pk, body)
      if (!id && method === 'GET') {
        if (!query.collectionId) fail(400, 'invalid_collection_id')
        await collection(pk, query.collectionId)
        let cursor
        const items = []
        do {
          const page = await send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
              ExpressionAttributeValues: marshal({
                ':pk': pk,
                ':prefix': 'TRIP#',
              }),
              ConsistentRead: true,
              ...(cursor ? { ExclusiveStartKey: cursor } : {}),
            }),
          )
          items.push(
            ...(page.Items ?? [])
              .map(unmarshal)
              .filter((p) => p.collectionId === query.collectionId)
              .map(present),
          )
          cursor = page.LastEvaluatedKey
        } while (cursor)
        return {
          items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        }
      }
      if (action === 'sharing' && ['POST', 'DELETE'].includes(method))
        return share(pk, id, method)
      const p = await owned(pk, id)
      if (method === 'GET' && !action) return { item: present(p) }
      if (method === 'DELETE' && !action) {
        if (body.version !== p.version) fail(409, 'itinerary_conflict')
        try {
          await send(
            new DeleteItemCommand({
              TableName: table,
              Key: marshal({ pk, sk: p.sk }),
              ConditionExpression: '#v = :v',
              ExpressionAttributeNames: { '#v': 'version' },
              ExpressionAttributeValues: marshal({ ':v': body.version }),
            }),
          )
        } catch (e) {
          if (e.name === 'ConditionalCheckFailedException')
            fail(409, 'itinerary_conflict')
          throw e
        }
        return { deleted: true }
      }
      fail(404, 'not_found')
    },
  }
}
module.exports = { createItineraries }
