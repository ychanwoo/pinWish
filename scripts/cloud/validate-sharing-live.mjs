import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_LIVE_SHARING_TESTS !== '1')
  throw Error('Explicit live test opt-in required')
const { outputs } = configuration()
let browserVerified = false
const lookupTokens = []
const users = [],
  checks = [],
  cleanupErrors = []
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function request(token, path, method = 'GET', body) {
  for (let retry = 0; retry < 6; retry++) {
    await pause(550)
    const response = await fetch(outputs.ApiUrl + path, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429) {
      await pause(1000)
      continue
    }
    const data = await response.json()
    // Re-enabling the API endpoint can briefly return gateway-level 403/404
    // while the control-plane change propagates. Do not retry app-level errors.
    if ([403, 404].includes(response.status) && !data.code && retry < 5) {
      await pause(2500)
      continue
    }
    return { status: response.status, body: data }
  }
  throw Error('Request remained throttled')
}
async function ok(token, path, method = 'GET', body) {
  const r = await request(token, path, method, body)
  assert.ok(
    r.status >= 200 && r.status < 300,
    `${path}: ${r.status} ${r.body.code ?? ''}`,
  )
  return r.body
}
async function cleanup(user) {
  for (const table of [outputs.TableName, outputs.JobsTableName]) {
    if (!user.sub || !table) continue
    let cursor
    do {
      const r = aws([
        'dynamodb',
        'query',
        '--table-name',
        table,
        '--key-condition-expression',
        'pk = :pk',
        '--expression-attribute-values',
        JSON.stringify({ ':pk': { S: 'USER#' + user.sub } }),
        ...(cursor ? ['--exclusive-start-key', JSON.stringify(cursor)] : []),
      ])
      for (let start = 0; start < (r.Items ?? []).length; start += 25) {
        let pending = r.Items.slice(start, start + 25).map((row) => ({
          DeleteRequest: { Key: { pk: row.pk, sk: row.sk } },
        }))
        for (let attempt = 0; pending.length && attempt < 5; attempt++) {
          pending =
            aws([
              'dynamodb',
              'batch-write-item',
              '--request-items',
              JSON.stringify({ [table]: pending }),
            ]).UnprocessedItems?.[table] ?? []
          if (pending.length) await pause(1000)
        }
        assert.equal(pending.length, 0)
      }
      cursor = r.LastEvaluatedKey
    } while (cursor)
  }
  if (user.sub) {
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
      const r = aws([
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
      assert.equal(r.Errors?.length ?? 0, 0)
    }
  }
}
try {
  execFileSync('node', ['scripts/cloud/runtime.mjs', 'on', '15'], {
    stdio: 'inherit',
  })
  for (let index = 0; index < 2; index++) {
    const email = `pinwish-sharing-${Date.now()}-${index}@example.com`,
      password = 'Pw!' + randomBytes(24).toString('base64url') + 'aA1!'
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
  const collection = (
    await ok(a.token, '/collections', 'POST', {
      name: 'Sharing validation',
      id: randomUUID(),
    })
  ).item
  assert.equal(
    (await request(null, `/collections/${collection.id}/sharing`, 'POST'))
      .status,
    401,
  )
  assert.equal(
    (await request(b.token, `/collections/${collection.id}/sharing`, 'POST'))
      .status,
    404,
  )
  assert.equal(
    (await ok(a.token, `/collections/${collection.id}/sharing`)).active,
    false,
  )
  checks.push('Only the authenticated collection owner can enable sharing')
  // Seed a synthetic saved record: verify the deployed sharing API without invoking OCR or place search.
  const id = createHash('sha256')
    .update('sharing-validation-' + a.sub)
    .digest('hex')
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { marshal } = require('../../backend/storage.cjs')
  const jpeg = require('jpeg-js')
  const objectKey = `photos/${a.sub}/${id}/${randomUUID()}.jpg`
  const image = jpeg.encode(
    { width: 160, height: 120, data: Buffer.alloc(160 * 120 * 4, 210) },
    80,
  ).data
  const file = `/tmp/pinwish-sharing-${a.sub}.jpg`
  await writeFile(file, image)
  try {
    aws([
      's3api',
      'put-object',
      '--bucket',
      outputs.PhotoBucketName,
      '--key',
      objectKey,
      '--body',
      file,
      '--content-type',
      'image/jpeg',
    ])
  } finally {
    const { unlink } = await import('node:fs/promises')
    await unlink(file)
  }
  const seeded = {
    pk: 'USER#' + a.sub,
    sk: 'PLACE#' + id,
    id,
    name: 'Validation museum',
    displayName: 'Validation museum',
    address: '100 Test Road',
    countryName: 'United States',
    coordinates: { longitude: -118, latitude: 34 },
    collectionId: collection.id,
    note: 'PRIVATE NOTE DO NOT SHARE',
    visited: true,
    sources: { secret: { evidence: 'PRIVATE SOURCE' } },
    version: 1,
    coverPhoto: {
      objectKey,
      author: 'Automated test fixture',
      license: 'CC0',
      sourceUrl: 'https://example.com/test-fixture',
    },
  }
  aws([
    'dynamodb',
    'put-item',
    '--table-name',
    outputs.TableName,
    '--item',
    JSON.stringify(marshal(seeded)),
  ])
  const settings = await ok(
    a.token,
    `/collections/${collection.id}/sharing`,
    'POST',
  )
  lookupTokens.push(settings.token)
  const shared = await ok(null, `/shared/${settings.token}`)
  assert.equal(shared.items.length, 1)
  assert.equal(shared.items[0].name, seeded.name)
  assert.equal(JSON.stringify(shared).includes('PRIVATE'), false)
  assert.equal(JSON.stringify(shared).includes(a.sub), false)
  assert.equal(JSON.stringify(shared).includes('objectKey'), false)
  checks.push('Anonymous collection reads return only approved fields')
  const photo = await ok(null, `/shared/${settings.token}/places/${id}/photo`)
  assert.equal(photo.status, 'ready')
  assert.equal(photo.imageBase64, image.toString('base64'))
  assert.equal(photo.attribution.license, 'CC0')
  assert.equal(JSON.stringify(photo).includes(objectKey), false)
  checks.push(
    'Anonymous photos use existing private S3 bytes with attribution and no object keys',
  )
  if (process.env.PINWISH_SHARING_BROWSER_URL) {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(`${process.env.PINWISH_SHARING_BROWSER_URL}/#share=${settings.token}`)
      await page.getByRole('heading', { name: 'Sharing validation', exact: true }).waitFor({ timeout: 30000 })
      await page.getByRole('button', { name: /Validation museum/ }).click()
      await page.getByRole('img', { name: 'Validation museum', exact: true }).waitFor({ timeout: 30000 })
      assert.equal(await page.getByText('PRIVATE NOTE DO NOT SHARE', { exact: true }).count(), 0)
      for (let i = 0; i < 30 && !await page.getByRole('button', { name: 'Show all', exact: true }).isEnabled(); i++) await pause(1000)
      assert.equal(await page.getByRole('button', { name: 'Show all', exact: true }).isEnabled(), true)
      assert.equal(await page.getByRole('button', { name: 'Retry map', exact: true }).count(), 0)
      // Map load precedes the first rendered tiles and selection animation.
      await page.waitForTimeout(5000)
      await page.screenshot({ path: '/tmp/pinwish-sharing-hosted-desktop.png' })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: '/tmp/pinwish-sharing-hosted-mobile.png' })
      browserVerified = true
    } finally { await browser.close() }
  }
  await ok(a.token, `/collections/${collection.id}/sharing`, 'DELETE')
  assert.equal((await request(null, `/shared/${settings.token}`)).status, 404)
  assert.equal(
    (await request(null, `/shared/${settings.token}/places/${id}/photo`))
      .status,
    404,
  )
  const fresh = await ok(
    a.token,
    `/collections/${collection.id}/sharing`,
    'POST',
  )
  lookupTokens.push(fresh.token)
  assert.notEqual(fresh.token, settings.token)
  await ok(a.token, `/collections/${collection.id}`, 'DELETE', {
    version: collection.version,
  })
  assert.equal((await request(null, `/shared/${fresh.token}`)).status, 404)
  checks.push(
    'Revocation, re-sharing and collection deletion invalidate the correct links',
  )
} finally {
  try {
    execFileSync('node', ['scripts/cloud/runtime.mjs', 'off'], {
      stdio: 'inherit',
    })
  } catch {
    cleanupErrors.push('Could not pause runtime')
  }
  for (const token of lookupTokens) {
    try {
      aws([
        'dynamodb',
        'delete-item',
        '--table-name',
        outputs.TableName,
        '--key',
        JSON.stringify({
          pk: {
            S: 'SHARE#' + createHash('sha256').update(token).digest('hex'),
          },
          sk: { S: 'LINK' },
        }),
      ])
    } catch {
      cleanupErrors.push('Share lookup cleanup failed')
    }
  }
  for (const user of users) {
    try {
      await cleanup(user)
    } catch {
      cleanupErrors.push('Temporary data cleanup failed')
    }
    try {
      aws([
        'cognito-idp',
        'admin-delete-user',
        '--user-pool-id',
        outputs.UserPoolId,
        '--username',
        user.username,
      ])
    } catch {
      cleanupErrors.push('Temporary user cleanup failed')
    }
  }
  await mkdir('docs/validation', { recursive: true })
  await writeFile(
    'docs/validation/collection-sharing-live.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed: checks.length === 4 && !cleanupErrors.length,
        checks,
        cleanupErrors,
        temporaryUsersDeleted: users.length,
        browserVerified,
        note: 'Real deployed API and S3 checks with synthetic temporary records; no OCR or place-search calls.',
      },
      null,
      2,
    ) + '\n',
  )
  assert.deepEqual(cleanupErrors, [])
}
console.log('Collection sharing AWS checks passed: ' + checks.length)
