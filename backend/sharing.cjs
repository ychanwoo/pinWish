const { randomBytes, createHash } = require('node:crypto')
const { PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const validToken = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const lifetime = 30 * 86400
function createSharing({
  read,
  send,
  table,
  marshal,
  unmarshal,
  collections,
  photos,
  fail,
}) {
  const unavailable = () => fail(404, 'share_unavailable')
  const settings = (item) => ({
    active: !!item.shareToken && item.shareExpiresAt > Date.now() / 1000,
    ...(item.shareToken && item.shareExpiresAt > Date.now() / 1000
      ? { token: item.shareToken, expiresAt: item.shareExpiresAt }
      : {}),
  })
  async function authorize(token) {
    if (!validToken(token)) return unavailable()
    const link = await read({ pk: `SHARE#${digest(token)}`, sk: 'LINK' })
    if (!link || link.expiresAt <= Date.now() / 1000) return unavailable()
    // Read only. Anonymous visits must never migrate accounts or start paid jobs.
    const catalog = await read({ pk: link.owner, sk: 'COLLECTIONS' })
    const collection = catalog?.collections[link.collectionId]
    if (
      !collection ||
      collection.deleted ||
      collection.shareToken !== token ||
      collection.shareExpiresAt <= Date.now() / 1000
    )
      return unavailable()
    return { link, catalog, collection }
  }
  return {
    async owner(pk, method, id) {
      if (!/^(default|legacy-[a-f0-9]{32}|[a-f0-9-]{36})$/.test(id ?? ''))
        fail(400, 'invalid_collection_id')
      if (!['GET', 'POST', 'DELETE'].includes(method)) fail(404, 'not_found')
      const catalog = await collections.ensure(pk)
      const item = catalog.collections[id]
      if (!item || item.deleted) fail(404, 'collection_not_found')
      if (method === 'GET') return settings(item)
      if (method === 'DELETE') {
        await collections.update(pk, (current) => {
          const target = current.collections[id]
          if (!target || target.deleted) fail(404, 'collection_not_found')
          delete target.shareToken
          delete target.shareExpiresAt
        })
        return { active: false }
      }
      if (settings(item).active) return settings(item)
      const token = randomBytes(32).toString('hex')
      const expiresAt = Math.floor(Date.now() / 1000) + lifetime
      // Write the lookup first; it grants nothing unless the catalog also enables this token.
      // Abandoned or revoked lookup rows expire through DynamoDB TTL.
      await send(
        new PutItemCommand({
          TableName: table,
          Item: marshal({
            pk: `SHARE#${digest(token)}`,
            sk: 'LINK',
            owner: pk,
            collectionId: id,
            expiresAt,
          }),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      )
      return collections.update(pk, (current) => {
        const target = current.collections[id]
        if (!target || target.deleted) fail(404, 'collection_not_found')
        if (!settings(target).active) {
          target.shareToken = token
          target.shareExpiresAt = expiresAt
        }
        return settings(target)
      })
    },
    async public(token, photoId, cursor) {
      const { link, catalog, collection } = await authorize(token)
      if (photoId) {
        if (!/^[a-f0-9]{64}$/.test(photoId)) return unavailable()
        const place = await read({ pk: link.owner, sk: `PLACE#${photoId}` })
        if (!place || collections.resolve(catalog, place).id !== collection.id)
          return unavailable()
        const photo = await photos.shared(place)
        await authorize(token)
        const current = await read({ pk: link.owner, sk: `PLACE#${photoId}` })
        const latest = await read({ pk: link.owner, sk: 'COLLECTIONS' })
        if (
          !current ||
          collections.resolve(latest, current).id !== collection.id
        )
          return unavailable()
        return photo
      }
      if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) fail(400, 'invalid_cursor')
      const page = await send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: marshal({
            ':pk': link.owner,
            ':prefix': 'PLACE#',
          }),
          ConsistentRead: true,
          Limit: 50,
          ...(cursor
            ? {
                ExclusiveStartKey: marshal({
                  pk: link.owner,
                  sk: `PLACE#${cursor}`,
                }),
              }
            : {}),
        }),
      )
      const items = (page.Items ?? [])
        .map(unmarshal)
        .filter((p) => collections.resolve(catalog, p).id === collection.id)
        .map((p) => ({
          id: p.id,
          name: p.displayName || p.name,
          address: p.address,
          countryName: p.countryName,
          coordinates: {
            longitude: p.coordinates.longitude,
            latitude: p.coordinates.latitude,
          },
          hasPhoto: !!p.coverPhoto,
        }))
      // No spread of private records: this allowlist is the public data contract.
      await authorize(token)
      return {
        name: collection.name,
        items,
        cursor: page.LastEvaluatedKey
          ? unmarshal(page.LastEvaluatedKey).sk.slice(6)
          : null,
      }
    },
  }
}
module.exports = { createSharing }
