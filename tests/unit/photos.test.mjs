import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createPhotos } = require('../../backend/photos.cjs')
const { matchPage, imageUrl } = require('../../backend/photo-discovery.cjs')
const jpeg = require('jpeg-js')
const id = 'a'.repeat(64),
  key = { pk: 'USER#owner', sk: `PLACE#${id}` }
function fixture({ discovery = true, broken = false } = {}) {
  let item = { ...key, id, version: 1, note: 'Keep note' },
    jobs = [],
    objects = new Map()
  const fail = (status, code) => {
    throw Object.assign(Error(code), { status })
  }
  const photos = createPhotos({
    bucket: 'private',
    functionName: 'test',
    read: async (k) => (k.pk === key.pk ? item : undefined),
    write: async (next, v) => {
      if (item?.version !== v)
        throw Object.assign(Error(), {
          name: 'ConditionalCheckFailedException',
        })
      item = next
    },
    fail,
    lambda: {
      send: async (c) => {
        jobs.push(JSON.parse(Buffer.from(c.input.Payload).toString()))
        return {}
      },
    },
    discover: async () => {
      if (broken) throw Error('provider down')
      return discovery
        ? {
            url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Test.jpg',
            author: 'Author',
            license: 'CC BY 4.0',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
          }
        : null
    },
    download: async () =>
      jpeg.encode(
        { width: 640, height: 480, data: Buffer.alloc(640 * 480 * 4, 255) },
        85,
      ).data,
    s3: {
      send: async (c) => {
        const p = c.input
        switch (c.constructor.name) {
          case 'PutObjectCommand':
            objects.set(p.Key, p.Body)
            return {}
          case 'GetObjectCommand':
            return {
              Body: { transformToByteArray: async () => objects.get(p.Key) },
            }
          case 'DeleteObjectCommand':
            objects.delete(p.Key)
            return {}
          case 'ListObjectsV2Command':
            return {
              Contents: [...objects.keys()].map((Key) => ({
                Key,
                LastModified: new Date(0),
              })),
            }
          default:
            throw Error('Unexpected command')
        }
      },
    },
  })
  return {
    photos,
    jobs,
    objects,
    get item() {
      return item
    },
    edit() {
      item = { ...item, version: item.version + 1, note: 'New note' }
    },
    delete() {
      item = undefined
    },
  }
}
test('saving queues once; worker attaches real downloaded JPEG and owner reads it', async () => {
  const f = fixture()
  await f.photos.ensure(key)
  await f.photos.ensure(key)
  assert.equal(f.jobs.length, 1)
  f.edit()
  await f.photos.process(key, f.jobs[0].jobId)
  const r = await f.photos.handle('GET', key)
  assert.equal(r.status, 'ready')
  assert.equal(r.item.note, 'New note')
  assert.equal(jpeg.decode(Buffer.from(r.imageBase64, 'base64')).width, 640)
  assert.equal(f.objects.size, 1)
  await f.photos.process(key, f.jobs[0].jobId)
  assert.equal(f.objects.size, 1)
})
test('missing photos and provider failures never remove the saved place and cache retries', async () => {
  for (const options of [{ discovery: false }, { broken: true }]) {
    const f = fixture(options)
    await f.photos.ensure(key)
    await f.photos.process(key, f.jobs[0].jobId)
    const r = await f.photos.handle('GET', key)
    assert.equal(r.status, options.broken ? 'unavailable' : 'not_found')
    assert.equal(r.item.note, 'Keep note')
    assert.equal(f.jobs.length, 1)
    assert.equal(f.objects.size, 0)
  }
})
test('deleted place is not recreated by delayed photo job', async () => {
  const f = fixture()
  await f.photos.ensure(key)
  f.delete()
  await f.photos.process(key, f.jobs[0].jobId)
  assert.equal(f.objects.size, 0)
  assert.equal(f.item, undefined)
})
test('private endpoint rejects other users and removed upload routes', async () => {
  const f = fixture()
  await assert.rejects(
    f.photos.handle('GET', { ...key, pk: 'USER#other' }),
    /not_found/,
  )
  for (const method of ['POST', 'DELETE'])
    await assert.rejects(f.photos.handle(method, key), /not_found/)
})
test('cleanup retains attached photo and deletes orphan after place deletion', async () => {
  const f = fixture()
  await f.photos.ensure(key)
  await f.photos.process(key, f.jobs[0].jobId)
  assert.equal((await f.photos.cleanup()).removed, 0)
  f.delete()
  assert.equal((await f.photos.cleanup()).removed, 1)
})
test('photo discovery rejects mismatched geography and nearby businesses with similar names', () => {
  const p = {
    name: 'Rodeo Drive',
    coordinates: { latitude: 34, longitude: -118 },
  }
  assert.ok(
    matchPage(p, {
      title: 'Rodeo Drive',
      coordinates: [{ lat: 34, lon: -118 }],
    }) > 0,
  )
  assert.equal(
    matchPage(p, {
      title: 'Luxe Rodeo Drive Hotel',
      coordinates: [{ lat: 34, lon: -118 }],
    }),
    -1,
  )
  assert.equal(
    matchPage(p, {
      title: 'Rodeo Drive',
      coordinates: [{ lat: 40, lon: -75 }],
    }),
    -1,
  )
})
test('download URLs cannot target arbitrary hosts or internal services', () => {
  for (const u of [
    'http://127.0.0.1/a',
    'https://evil.example/a',
    'https://upload.wikimedia.org.evil.example/wikipedia/commons/a',
    'https://user@upload.wikimedia.org/wikipedia/commons/a',
  ])
    assert.throws(() => imageUrl(u))
  assert.equal(
    imageUrl('https://upload.wikimedia.org/wikipedia/commons/a.jpg?tracking=1'),
    'https://upload.wikimedia.org/wikipedia/commons/a.jpg',
  )
})
