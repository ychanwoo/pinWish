const { randomUUID } = require('node:crypto')
const jpeg = require('jpeg-js')
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda')
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3')
const {
  discoverPhoto,
  boundedFetch,
  imageUrl,
} = require('./photo-discovery.cjs')
const DISCOVERY_VERSION = 2
const MAX_BYTES = 2 * 1024 * 1024
const publicItem = ({ pk: _pk, sk: _sk, ...item }) => item
function createPhotos({
  read,
  write,
  fail,
  bucket = process.env.PHOTO_BUCKET,
  s3 = new S3Client({}),
  lambda = new LambdaClient({}),
  functionName = process.env.AWS_LAMBDA_FUNCTION_NAME,
  discover = discoverPhoto,
  download = boundedFetch,
}) {
  const remove = async (key) => {
    if (!key || !bucket) return
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    } catch {
      console.error(JSON.stringify({ code: 'photo_cleanup_deferred' }))
    }
  }
  async function ensure(key) {
    let item = await read(key)
    if (!item) fail(404, 'not_found')
    if (
      !bucket ||
      item.coverPhoto ||
      ((item.photoLookup?.retryAt ?? 0) > Date.now() &&
        !(item.photoLookup?.status === 'not_found' && item.photoLookup?.discoveryVersion !== DISCOVERY_VERSION))
    )
      return item
    if (!functionName) return item
    const jobId = randomUUID()
    const pending = {
      ...item,
      photoLookup: { status: 'pending', jobId, discoveryVersion: DISCOVERY_VERSION, retryAt: Date.now() + 120000 },
      version: item.version + 1,
    }
    try {
      await write(pending, item.version)
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') return await read(key)
      throw e
    }
    try {
      await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({ source: 'pinwish.photo', key, jobId }),
          ),
        }),
      )
    } catch {
      // Saving a place succeeds even when photo discovery is unavailable; retry after the lease.
      console.error(JSON.stringify({ code: 'photo_enqueue_failed' }))
    }
    return pending
  }
  async function process(key, jobId) {
    const original = await read(key)
    if (
      !original ||
      original.coverPhoto ||
      original.photoLookup?.jobId !== jobId
    )
      return
    let photo,
      objectKey,
      status = 'not_found'
    try {
      const found = await discover(original)
      if (found) {
        const input = await download(imageUrl(found.url), MAX_BYTES)
        const decoded = jpeg.decode(input, {
          useTArray: true,
          maxResolutionInMP: 2.6,
          maxMemoryUsageInMB: 96,
          tolerantDecoding: false,
        })
        if (
          Math.max(decoded.width, decoded.height) > 1600 ||
          Math.min(decoded.width, decoded.height) < 120
        )
          throw Error('photo_dimensions')
        const clean = jpeg.encode(
          { width: decoded.width, height: decoded.height, data: decoded.data },
          88,
        ).data
        if (clean.length > MAX_BYTES) throw Error('photo_size')
        objectKey = `photos/${key.pk.slice(5)}/${original.id}/${randomUUID()}.jpg`
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: clean,
            ContentType: 'image/jpeg',
            CacheControl: 'private, no-store',
            ServerSideEncryption: 'AES256',
          }),
        )
        const { url: _url, ...credit } = found
        photo = {
          ...credit,
          objectKey,
          width: decoded.width,
          height: decoded.height,
          bytes: clean.length,
          contentType: 'image/jpeg',
          updatedAt: new Date().toISOString(),
        }
        status = 'ready'
      }
    } catch (e) {
      status = 'unavailable'
      console.error(
        JSON.stringify({ code: 'photo_discovery_failed', type: e.name }),
      )
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const latest = await read(key)
      if (!latest || latest.photoLookup?.jobId !== jobId || latest.coverPhoto) {
        await remove(objectKey)
        return
      }
      const next = {
        ...latest,
        ...(photo ? { coverPhoto: photo } : {}),
        photoLookup: {
          status,
          discoveryVersion: DISCOVERY_VERSION,
          retryAt: Date.now() + (status === 'unavailable' ? 300000 : 86400000),
        },
        version: latest.version + 1,
      }
      try {
        await write(next, latest.version)
        return
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') continue
        // Ambiguous network result: retain object for daily reconciliation rather than delete a committed photo.
        throw e
      }
    }
    await remove(objectKey)
  }
  return {
    remove,
    ensure,
    process,
    async handle(method, key) {
      if (method !== 'GET') fail(404, 'not_found')
      if (!bucket) fail(503, 'photos_unavailable')
      const item = await ensure(key)
      if (!item) fail(404, 'not_found')
      if (!item.coverPhoto)
        return {
          status: item.photoLookup?.status ?? 'unavailable',
          item: publicItem(item),
        }
      try {
        const result = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: item.coverPhoto.objectKey,
          }),
        )
        const bytes = await result.Body.transformToByteArray()
        if (bytes.length > MAX_BYTES) fail(503, 'photos_unavailable')
        return {
          status: 'ready',
          item: publicItem(item),
          imageBase64: Buffer.from(bytes).toString('base64'),
          contentType: 'image/jpeg',
          objectKey: item.coverPhoto.objectKey,
        }
      } catch (e) {
        if (e.name === 'NoSuchKey') fail(404, 'photo_not_found')
        throw e
      }
    },
    async cleanup() {
      let cursor
      let removed = 0
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'photos/',
            ContinuationToken: cursor,
          }),
        )
        for (const object of page.Contents ?? []) {
          if (
            !object.LastModified ||
            Date.now() - new Date(object.LastModified).getTime() < 86400000
          )
            continue
          const match =
            /^photos\/([a-zA-Z0-9-]{1,128})\/([a-f0-9]{64})\/[a-f0-9-]+\.jpg$/.exec(
              object.Key,
            )
          if (!match) continue
          const item = await read({
            pk: `USER#${match[1]}`,
            sk: `PLACE#${match[2]}`,
          })
          if (item?.coverPhoto?.objectKey === object.Key) continue
          await s3.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
          )
          removed++
        }
        cursor = page.NextContinuationToken
      } while (cursor)
      return { removed }
    },
  }
}
module.exports = { createPhotos, MAX_BYTES }
