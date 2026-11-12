const { createHash } = require('node:crypto')
const {
  PutItemCommand,
  UpdateItemCommand,
} = require('@aws-sdk/client-dynamodb')
const {
  GeoPlacesClient,
  GetPlaceCommand,
} = require('@aws-sdk/client-geo-places')
const { hoursFromAWS } = require('./itinerary-planner.cjs')
const palette = [
  '#a93426',
  '#426b57',
  '#426782',
  '#856044',
  '#756184',
  '#986334',
]
const hash = (value) => createHash('sha256').update(value).digest('hex')
function regionFor(address = {}, place) {
  const country = address.Country?.Code2 || place.countryCode || 'ZZ'
  const area = address.Region?.Code || address.Region?.Name || ''
  const city = address.Locality || ''
  const level = city ? 'city' : area ? 'region' : 'country'
  const label =
    city || address.Region?.Name || place.countryName || 'Region unavailable'
  return {
    key: hash(
      [country, area, city]
        .map((s) => s.normalize('NFKC').trim().toLowerCase())
        .join('|'),
    ),
    label,
    context: [city ? address.Region?.Name || area : '', country]
      .filter(Boolean)
      .join(', '),
    level,
  }
}
function createMapDetails({
  read,
  send,
  table,
  marshal,
  fail,
  placesClient = new GeoPlacesClient({ maxAttempts: 1 }),
}) {
  const put = (item) =>
    send(new PutItemCommand({ TableName: table, Item: marshal(item) }))
  async function quota(pk) {
    const now = Math.floor(Date.now() / 1000)
    for (const [id, limit] of [
      [pk + '#' + Math.floor(now / 3600), 60],
      ['GLOBAL#' + Math.floor(now / 86400), 200],
    ]) {
      try {
        await send(
          new UpdateItemCommand({
            TableName: table,
            Key: marshal({ pk: 'DETAILSLIMIT#' + id, sk: 'COUNT' }),
            UpdateExpression: 'SET expiresAt = :ttl ADD #n :one',
            ConditionExpression: 'attribute_not_exists(#n) OR #n < :limit',
            ExpressionAttributeNames: { '#n': 'count' },
            ExpressionAttributeValues: marshal({
              ':ttl': now + 172800,
              ':one': 1,
              ':limit': limit,
            }),
          }),
        )
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException')
          fail(429, 'details_limit')
        throw e
      }
    }
  }
  async function details(pk, id) {
    if (!/^[a-f0-9]{64}$/.test(id)) fail(400, 'invalid_id')
    const place = await read({ pk, sk: 'PLACE#' + id })
    if (!place) fail(404, 'not_found')
    const key = { pk: 'PLACEDETAILS#' + hash(place.placeId), sk: 'DATA' }
    const cached = await read(key),
      now = Date.now()
    if (cached && now < cached.retryAt) {
      if (!cached.data) fail(503, 'details_unavailable')
      return {
        ...cached.data,
        stale: now - Date.parse(cached.data.checkedAt) >= 86400000,
      }
    }
    await quota(pk)
    try {
      const p = await placesClient.send(
        new GetPlaceCommand({
          PlaceId: place.placeId,
          Language: 'en',
          IntendedUse: 'Storage',
          AdditionalFeatures: ['Contact', 'TimeZone'],
        }),
        { abortSignal: AbortSignal.timeout(8000) },
      )
      if (
        !p.Position ||
        Math.abs(p.Position[0] - place.coordinates.longitude) > 0.01 ||
        Math.abs(p.Position[1] - place.coordinates.latitude) > 0.01
      )
        throw Error('place_mismatch')
      let zone = p.TimeZone?.Name || ''
      try {
        if (zone) new Intl.DateTimeFormat('en', { timeZone: zone }).format()
      } catch {
        zone = ''
      }
      const data = {
        region: regionFor(p.Address, place),
        hours: hoursFromAWS(p.OpeningHours),
        zone,
        checkedAt: new Date().toISOString(),
      }
      await put({
        ...key,
        data,
        retryAt: now + 86400000,
        expiresAt: Math.floor(now / 1000) + 604800,
      })
      return { ...data, stale: false }
    } catch {
      await put({
        ...key,
        ...(cached?.data ? { data: cached.data } : {}),
        retryAt: now + 300000,
        expiresAt: Math.floor(now / 1000) + 604800,
      })
      if (cached?.data) return { ...cached.data, stale: true }
      fail(503, 'details_unavailable')
    }
  }
  async function preferences(pk, method, body) {
    const key = { pk, sk: 'COLLECTION_MAP_PREFERENCES' }
    const old = await read(key)
    if (method === 'GET')
      return { colors: old?.colors || {}, version: old?.version || 0 }
    if (method !== 'PATCH') fail(404, 'not_found')
    if (
      !/^(default|legacy-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(
        body.collectionId ?? '',
      ) ||
      (body.color !== null && !palette.includes(body.color)) ||
      !Number.isInteger(body.version)
    )
      fail(400, 'invalid_map_preferences')
    const catalog = await read({ pk, sk: 'COLLECTIONS' })
    if (
      !catalog?.collections?.[body.collectionId] ||
      catalog.collections[body.collectionId].deleted
    )
      fail(404, 'collection_not_found')
    if (body.version !== (old?.version || 0))
      fail(409, 'map_preferences_conflict')
    const colors = { ...old?.colors }
    if (body.color === null) delete colors[body.collectionId]
    else colors[body.collectionId] = body.color
    if (Object.keys(colors).length > 200) fail(400, 'invalid_map_preferences')
    const item = { ...key, colors, version: (old?.version || 0) + 1 }
    try {
      await send(
        new PutItemCommand({
          TableName: table,
          Item: marshal(item),
          ConditionExpression: old ? '#v = :v' : 'attribute_not_exists(pk)',
          ...(old
            ? {
                ExpressionAttributeNames: { '#v': 'version' },
                ExpressionAttributeValues: marshal({ ':v': body.version }),
              }
            : {}),
        }),
      )
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException')
        fail(409, 'map_preferences_conflict')
      throw e
    }
    return { colors, version: item.version }
  }
  return { details, preferences }
}
module.exports = { createMapDetails, regionFor, palette }
