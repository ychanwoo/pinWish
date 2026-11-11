import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { aws, configuration } from './aws-util.mjs'
const require = createRequire(import.meta.url)
const { marshal, unmarshal } = require('../../backend/storage.cjs')
const jpeg = require('jpeg-js')
if (process.env.PINWISH_RUN_LIVE_COLLECTION_TESTS !== '1')
  throw Error('Explicit live test opt-in required')
const { outputs } = configuration()
const { origin } = JSON.parse(
  await readFile('infra/generated/hosting.json', 'utf8'),
)
const run = randomUUID(),
  users = [],
  checks = [],
  cleanupErrors = [],
  browserErrors = []
const fixturePath = `infra/generated/collection-${run}.jpg`
let browser, page
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function request(token, path, method = 'GET', body) {
  for (let retry = 0; retry < 4; retry++) {
    await sleep(350)
    const response = await fetch(outputs.ApiUrl + path, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    })
    if (response.status === 429) {
      await sleep(1000)
      continue
    }
    return { status: response.status, body: await response.json() }
  }
  throw Error('API remained throttled')
}
async function ok(token, path, method = 'GET', body) {
  const result = await request(token, path, method, body)
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${method} ${path}: ${result.status} ${result.body.code ?? ''}`,
  )
  return result.body
}
async function cleanup(user) {
  try {
    const rows =
      aws([
        'dynamodb',
        'query',
        '--table-name',
        outputs.TableName,
        '--key-condition-expression',
        'pk = :pk',
        '--expression-attribute-values',
        JSON.stringify({ ':pk': { S: 'USER#' + user.sub } }),
      ]).Items ?? []
    for (let offset = 0; offset < rows.length; offset += 25) {
      let pending = rows
        .slice(offset, offset + 25)
        .map((row) => ({ DeleteRequest: { Key: { pk: row.pk, sk: row.sk } } }))
      for (let attempt = 0; pending.length && attempt < 5; attempt++) {
        pending =
          aws([
            'dynamodb',
            'batch-write-item',
            '--request-items',
            JSON.stringify({ [outputs.TableName]: pending }),
          ]).UnprocessedItems?.[outputs.TableName] ?? []
        if (pending.length) await sleep(1000)
      }
      assert.equal(pending.length, 0, 'Temporary rows could not be removed')
    }
    const objects =
      aws([
        's3api',
        'list-objects-v2',
        '--bucket',
        outputs.PhotoBucketName,
        '--prefix',
        `photos/${user.sub}/`,
      ]).Contents ?? []
    if (objects.length) {
      const result = aws([
        's3api',
        'delete-objects',
        '--bucket',
        outputs.PhotoBucketName,
        '--delete',
        JSON.stringify({
          Objects: objects.map((o) => ({ Key: o.Key })),
          Quiet: true,
        }),
      ])
      assert.equal(result.Errors?.length ?? 0, 0)
    }
  } finally {
    aws([
      'cognito-idp',
      'admin-delete-user',
      '--user-pool-id',
      outputs.UserPoolId,
      '--username',
      user.username,
    ])
  }
}
try {
  await mkdir('infra/generated', { recursive: true })
  for (let i = 0; i < 2; i++) {
    const email = `pinwish-collections-${run}-${i}@example.com`,
      password = randomBytes(24).toString('base64url') + 'aA1!'
    const result = aws([
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id',
      outputs.UserPoolId,
      '--username',
      email,
      '--message-action',
      'SUPPRESS',
      '--user-attributes',
      JSON.stringify([
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ]),
    ])
    const user = {
      email,
      password,
      username: result.User.Username,
      sub: result.User.Attributes.find((a) => a.Name === 'sub').Value,
    }
    users.push(user)
    aws([
      'cognito-idp',
      'admin-set-user-password',
      '--user-pool-id',
      outputs.UserPoolId,
      '--username',
      user.username,
      '--password',
      password,
      '--permanent',
    ])
    user.token = aws([
      'cognito-idp',
      'initiate-auth',
      '--client-id',
      outputs.UserPoolClientId,
      '--auth-flow',
      'USER_PASSWORD_AUTH',
      '--auth-parameters',
      JSON.stringify({ USERNAME: email, PASSWORD: password }),
    ]).AuthenticationResult.AccessToken
  }
  const [a, b] = users
  assert.equal((await request(null, '/collections')).status, 401)
  const id = createHash('sha256')
      .update('collection-validation-' + run)
      .digest('hex'),
    objectKey = `photos/${a.sub}/${id}/collection-fixture.jpg`
  // Synthetic owned photo tests S3 preservation, not automatic photo discovery.
  const bytes = jpeg.encode(
    { data: Buffer.from([175, 52, 35, 255]), width: 1, height: 1 },
    80,
  ).data
  await writeFile(fixturePath, bytes)
  aws([
    's3api',
    'put-object',
    '--bucket',
    outputs.PhotoBucketName,
    '--key',
    objectKey,
    '--body',
    fixturePath,
    '--content-type',
    'image/jpeg',
  ])
  const now = new Date().toISOString()
  const row = {
    pk: 'USER#' + a.sub,
    sk: 'PLACE#' + id,
    id,
    provider: 'amazon-location',
    placeId: 'validation-' + run,
    name: 'Collection test place',
    displayName: 'Collection test place',
    address: 'Los Angeles, CA',
    countryCode: 'US',
    countryName: 'United States',
    coordinates: { longitude: -118.3, latitude: 34.1 },
    placeType: 'PointOfInterest',
    note: 'Keep notes and sources',
    collection: 'Legacy trip',
    visited: true,
    bookmarked: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
    sources: {
      original: {
        originalUrl: 'https://www.instagram.com/p/DfLAnjLEx2G/',
        canonicalUrl: 'https://www.instagram.com/p/DfLAnjLEx2G/',
        slides: [2],
        extractedName: '원문 보존',
        evidence: '원문 보존',
      },
    },
    coverPhoto: {
      objectKey,
      contentType: 'image/jpeg',
      width: 1,
      height: 1,
      bytes: bytes.length,
      updatedAt: now,
      author: 'PinWish validation fixture',
      sourceUrl: 'https://example.com',
      license: 'CC0',
    },
  }
  aws([
    'dynamodb',
    'put-item',
    '--table-name',
    outputs.TableName,
    '--item',
    JSON.stringify(marshal(row)),
  ])
  const catalog = await ok(a.token, '/collections'),
    legacy = catalog.items.find((c) => c.name === 'Legacy trip')
  assert.ok(legacy)
  assert.ok(catalog.items.some((c) => c.id === 'default'))
  const renamed = (
    await ok(a.token, '/collections/' + legacy.id, 'PATCH', {
      version: 1,
      name: 'California trip',
    })
  ).item
  assert.equal(
    (await ok(a.token, '/places/' + id)).item.collection,
    'California trip',
  )
  assert.equal(
    (await ok(a.token, '/places/' + id + '/photo')).item.collection,
    'California trip',
  )
  assert.equal(
    (
      await request(a.token, '/collections/' + legacy.id, 'PATCH', {
        version: 1,
        name: 'Stale',
      })
    ).status,
    409,
  )
  for (const method of ['PATCH', 'DELETE'])
    assert.equal(
      (
        await request(b.token, '/collections/' + legacy.id, method, {
          version: renamed.version,
          name: 'Attack',
        })
      ).status,
      404,
    )
  assert.equal(
    (await request(a.token, '/collections/default', 'DELETE', { version: 1 }))
      .status,
    409,
  )
  checks.push(
    'Legacy catalog migration, rename, photo response labels, stale-write protection and owner isolation',
  )
  await ok(a.token, '/collections/' + legacy.id, 'DELETE', {
    version: renamed.version,
  })
  const fallback = (await ok(a.token, '/places/' + id)).item
  assert.equal(fallback.collectionId, 'default')
  assert.equal(fallback.note, row.note)
  assert.deepEqual(fallback.sources, row.sources)
  assert.deepEqual(fallback.coverPhoto, row.coverPhoto)
  const physical = unmarshal(
    aws([
      'dynamodb',
      'get-item',
      '--table-name',
      outputs.TableName,
      '--key',
      JSON.stringify(marshal({ pk: row.pk, sk: row.sk })),
      '--consistent-read',
    ]).Item,
  )
  assert.deepEqual(physical, row)
  assert.equal((await ok(a.token, '/places/' + id + '/photo')).status, 'ready')
  checks.push(
    'Collection deletion preserves the original DynamoDB place row and its private S3 photo',
  )
  const newId = randomUUID(),
    created = (
      await ok(a.token, '/collections', 'POST', {
        id: newId,
        name: 'Empty trip',
      })
    ).item
  assert.equal(
    (
      await ok(a.token, '/collections', 'POST', {
        id: newId,
        name: 'Empty trip',
      })
    ).item.id,
    newId,
  )
  assert.equal(
    (await request(a.token, '/collections', 'POST', { name: 'empty TRIP' }))
      .status,
    409,
  )
  assert.ok(
    (await ok(a.token, '/collections')).items.some((c) => c.id === created.id),
  )
  const moved = (
    await ok(a.token, '/places/' + id, 'PATCH', {
      version: fallback.version,
      collectionId: newId,
    })
  ).item
  assert.equal(moved.collectionId, newId)
  assert.equal(moved.note, row.note)
  assert.deepEqual(moved.sources, row.sources)
  assert.deepEqual(moved.coverPhoto, row.coverPhoto)
  assert.equal(
    (
      await request(b.token, '/places/' + id, 'PATCH', {
        version: moved.version,
        collectionId: newId,
      })
    ).status,
    404,
  )
  const foreign = (
    await ok(b.token, '/collections', 'POST', { name: 'Private' })
  ).item
  assert.equal(
    (
      await request(a.token, '/places/' + id, 'PATCH', {
        version: moved.version,
        collectionId: foreign.id,
      })
    ).status,
    404,
  )
  checks.push(
    'Empty collection persistence, replay-safe create, duplicate rejection and authenticated transactional place move',
  )
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => browserErrors.push(e.message))
  await page.goto(origin)
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  await page.getByLabel('Email', { exact: true }).fill(a.email)
  await page.getByLabel('Password', { exact: true }).fill(a.password)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  const choose = async (name) =>
    page
      .locator('.collection-link, .collection-chips button')
      .filter({ hasText: name })
      .filter({ visible: true })
      .first()
      .click()
  const button = (name) =>
    page
      .getByRole('button', { name, exact: true })
      .filter({ visible: true })
      .first()
  await choose('Empty trip')
  await expect(page.locator('.place-card')).toHaveCount(1)
  await button('Create collection').click()
  await page.getByLabel('Collection name').fill('Browser empty')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create collection', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await choose('Browser empty')
  await expect(page.locator('.place-card')).toHaveCount(0)
  await button('Manage collection').click()
  await page.getByLabel('Collection name').fill('Weekend plan')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/pinwish-collections-desktop.png' })
  await choose('Empty trip')
  await page.locator('.place-card-title').click()
  await page
    .getByLabel('Collection', { exact: true })
    .selectOption('Weekend plan')
  await button('Move').click()
  await expect(page.locator('.notice-toast')).toContainText('Changes saved')
  await page.setViewportSize({ width: 390, height: 844 })
  await button('Back to places').click()
  await expect(page.locator('.place-card')).toHaveCount(1)
  await button('Manage collection').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete collection', exact: true })
    .click()
  await page.screenshot({ path: '/tmp/pinwish-collections-mobile.png' })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete collection', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.place-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.place-card')).toHaveCount(1)
  await button('Sign out').click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  assert.deepEqual(browserErrors, [])
  checks.push(
    'Deployed desktop/mobile UI: create, reload, rename, move, delete, retained place, sign-out and no overflow/browser errors',
  )
  console.log(JSON.stringify({ checks }, null, 2))
} catch (error) {
  console.error('Collection validation failed:', error.message)
  if (page) {
    await page
      .screenshot({ path: '/tmp/pinwish-collections-failure.png' })
      .catch(() => {})
    await writeFile(
      '/tmp/pinwish-collections-failure.txt',
      await page.locator('body').innerText(),
    ).catch(() => {})
  }
  process.exitCode = 1
} finally {
  await browser?.close()
  for (const user of users)
    try {
      await cleanup(user)
    } catch (error) {
      cleanupErrors.push(error.message)
      process.exitCode = 1
    }
  await rm(fixturePath, { force: true })
  await writeFile(
    'infra/generated/collections-validation.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        origin,
        checks,
        browserErrors,
        cleanupErrors,
        passed:
          checks.length === 4 &&
          cleanupErrors.length === 0 &&
          !process.exitCode,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      cleanupErrors: cleanupErrors.length,
      temporaryUsersRemoved: users.length - cleanupErrors.length,
    }),
  )
}
