const { randomUUID, createHash } = require('node:crypto')
const {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} = require('@aws-sdk/client-dynamodb')
const DEFAULT_ID = 'default'
const normalize = (name) =>
  name.normalize('NFKC').trim().toLocaleLowerCase('en-US')
const aliasKey = (name) =>
  createHash('sha256').update(normalize(name)).digest('hex')
const validId = (id) =>
  typeof id === 'string' &&
  /^(default|legacy-[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
    id,
  )
function createCollections({ send, table, marshal, unmarshal, fail }) {
  const key = (pk) => ({ pk, sk: 'COLLECTIONS' })
  const read = async (pk) =>
    unmarshal(
      (
        await send(
          new GetItemCommand({
            TableName: table,
            Key: marshal(key(pk)),
            ConsistentRead: true,
          }),
        )
      ).Item,
    )
  const validateName = (value) => {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > 60 ||
      /[\p{Cc}]/u.test(value)
    )
      fail(400, 'invalid_collection_name')
    const name = value.trim().normalize('NFKC')
    if (name.length > 60) fail(400, 'invalid_collection_name')
    return name
  }
  const active = (catalog) =>
    Object.values(catalog.collections).filter((c) => !c.deleted)
  const defaultId = (catalog) => catalog.defaultCollectionId ?? DEFAULT_ID
  const publicCollection = (c, catalog) => ({
    id: c.id,
    name: c.name,
    isDefault: c.id === defaultId(catalog),
    version: c.version,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  })
  async function ensure(pk) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await read(pk)
      if (existing) return existing
      const now = new Date().toISOString(),
        collections = {
          [DEFAULT_ID]: {
            id: DEFAULT_ID,
            name: 'Saved places',
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        },
        aliases = {}
      let cursor
      do {
        const page = await send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: marshal({
              ':pk': pk,
              ':prefix': 'PLACE#',
            }),
            ConsistentRead: true,
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        )
        for (const row of page.Items ?? []) {
          const place = unmarshal(row),
            name =
              typeof place.collection === 'string' && place.collection.trim()
                ? place.collection.trim()
                : 'Saved places',
            normalized = normalize(name)
          if (aliases[aliasKey(name)]) continue
          const id =
            normalized === normalize('Saved places')
              ? DEFAULT_ID
              : 'legacy-' +
                createHash('sha256')
                  .update(normalized)
                  .digest('hex')
                  .slice(0, 32)
          aliases[aliasKey(name)] = id
          collections[id] ??= {
            id,
            name,
            version: 1,
            createdAt: now,
            updatedAt: now,
          }
        }
        cursor = page.LastEvaluatedKey
      } while (cursor)
      const catalog = { ...key(pk), version: 1, collections, aliases }
      if (Buffer.byteLength(JSON.stringify(catalog)) > 280000)
        fail(409, 'collection_migration_limit')
      try {
        await send(
          new PutItemCommand({
            TableName: table,
            Item: marshal(catalog),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        )
        return catalog
      } catch (e) {
        if (e.name !== 'ConditionalCheckFailedException') throw e
      }
    }
    fail(409, 'collection_conflict')
  }
  function resolve(catalog, place) {
    const id =
      place.collectionId ??
      catalog.aliases[aliasKey(place.collection ?? 'Saved places')] ??
      DEFAULT_ID
    const found = validId(id) ? catalog.collections[id] : undefined
    return found && !found.deleted ? found : catalog.collections[defaultId(catalog)]
  }
  function present(catalog, place) {
    const c = resolve(catalog, place)
    return { ...place, collectionId: c.id, collection: c.name }
  }
  async function update(pk, operation) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const catalog = await ensure(pk),
        version = catalog.version
      const result = operation(catalog)
      catalog.version++
      if (Buffer.byteLength(JSON.stringify(catalog)) > 280000)
        fail(409, 'collection_limit')
      try {
        await send(
          new PutItemCommand({
            TableName: table,
            Item: marshal(catalog),
            ConditionExpression: '#v = :v',
            ExpressionAttributeNames: { '#v': 'version' },
            ExpressionAttributeValues: marshal({ ':v': version }),
          }),
        )
        return result
      } catch (e) {
        if (e.name !== 'ConditionalCheckFailedException') throw e
      }
    }
    fail(409, 'collection_conflict')
  }
  async function create(pk, body) {
    const name = validateName(body.name),
      id = body.id ?? randomUUID()
    if (
      typeof id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
    )
      fail(400, 'invalid_collection_id')
    return update(pk, (catalog) => {
      const previous = catalog.collections[id]
      if (previous) {
        if (previous.deleted || previous.name !== name)
          fail(409, 'collection_conflict')
        return publicCollection(previous, catalog)
      }
      if (active(catalog).some((c) => normalize(c.name) === normalize(name)))
        fail(409, 'collection_name_exists')
      if (
        active(catalog).length >= 100 ||
        Object.keys(catalog.collections).length >= 500
      )
        fail(409, 'collection_limit')
      const now = new Date().toISOString(),
        item = { id, name, version: 1, createdAt: now, updatedAt: now }
      catalog.collections[id] = item
      return publicCollection(item, catalog)
    })
  }
  async function route(pk, method, id, body) {
    if (method === 'GET' && !id)
      return {
        status: 200,
        data: await (async () => {
          const catalog = await ensure(pk)
          return {
            items: active(catalog).map(c => publicCollection(c, catalog)),
            version: catalog.version,
          }
        })(),
      }
    if (method === 'POST' && !id)
      return { status: 201, data: { item: await create(pk, body) } }
    if (!validId(id)) fail(400, 'invalid_collection_id')
    if (!['PATCH', 'DELETE'].includes(method)) fail(404, 'not_found')
    if (!Number.isInteger(body.version) || body.version < 1)
      fail(400, 'invalid_version')
    const result = await update(pk, (catalog) => {
      const current = catalog.collections[id]
      if (!current) fail(404, 'collection_not_found')
      if (
        method === 'DELETE' &&
        current.deleted &&
        body.version === current.version - 1
      )
        return { deleted: true, defaultCollectionId: defaultId(catalog), defaultCollection: publicCollection(catalog.collections[defaultId(catalog)], catalog) }
      if (current.deleted) fail(404, 'collection_not_found')
      if (current.version !== body.version) fail(409, 'collection_conflict')
      if (method === 'PATCH') {
        const name = validateName(body.name)
        if (
          active(catalog).some(
            (c) => c.id !== id && normalize(c.name) === normalize(name),
          )
        )
          fail(409, 'collection_name_exists')
        current.name = name
      } else {
        current.deleted = true
        if (id === defaultId(catalog)) {
          let fallback = active(catalog)[0]
          if (!fallback) {
            const now = new Date().toISOString()
            fallback = { id: randomUUID(), name: 'Saved places', version: 1, createdAt: now, updatedAt: now }
            catalog.collections[fallback.id] = fallback
          }
          catalog.defaultCollectionId = fallback.id
        }
      }
      current.version++
      current.updatedAt = new Date().toISOString()
      return method === 'PATCH'
        ? { item: publicCollection(current, catalog) }
        : { deleted: true, defaultCollectionId: defaultId(catalog), defaultCollection: publicCollection(catalog.collections[defaultId(catalog)], catalog) }
    })
    return { status: 200, data: result }
  }
  async function bind(pk, body) {
    let catalog = await ensure(pk),
      collection
    if (body.collectionId !== undefined) {
      if (!validId(body.collectionId)) fail(400, 'invalid_collection_id')
      collection = catalog.collections[body.collectionId]
      if (!collection || collection.deleted) fail(404, 'collection_not_found')
    } else if (body.collection !== undefined) {
      const name = validateName(body.collection)
      collection = active(catalog).find(
        (c) => normalize(c.name) === normalize(name),
      )
      // Compatibility for old clients; all newly written places receive stable IDs.
      if (!collection) {
        try {
          await create(pk, { name })
        } catch (e) {
          if (e.message !== 'collection_name_exists') throw e
        }
        catalog = await ensure(pk)
        collection = active(catalog).find(
          (c) => normalize(c.name) === normalize(name),
        )
      }
    } else collection = catalog.collections[defaultId(catalog)]
    if (!collection) fail(409, 'collection_conflict')
    return { catalog, collection }
  }
  async function writePlace(catalog, place, previousVersion) {
    try {
      await send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: table,
                Key: marshal(key(catalog.pk)),
                ConditionExpression: '#v = :v',
                ExpressionAttributeNames: { '#v': 'version' },
                ExpressionAttributeValues: marshal({ ':v': catalog.version }),
              },
            },
            {
              Put: {
                TableName: table,
                Item: marshal(place),
                ConditionExpression: previousVersion
                  ? '#v = :v'
                  : 'attribute_not_exists(pk)',
                ...(previousVersion
                  ? {
                      ExpressionAttributeNames: { '#v': 'version' },
                      ExpressionAttributeValues: marshal({
                        ':v': previousVersion,
                      }),
                    }
                  : {}),
              },
            },
          ],
        }),
      )
    } catch (e) {
      if (e.name === 'TransactionCanceledException') {
        if (e.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed')
          fail(409, 'collection_conflict')
        throw Object.assign(Error('place conflict'), {
          name: 'ConditionalCheckFailedException',
        })
      }
      throw e
    }
  }
  return { ensure, resolve, present, bind, route, writePlace, update }
}
module.exports = { createCollections, DEFAULT_ID }
