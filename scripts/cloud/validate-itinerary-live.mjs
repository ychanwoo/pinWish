import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_LIVE_ITINERARY_TESTS !== '1')
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
    const email = `pinwish-itinerary-${Date.now()}-${index}@example.com`,
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
      name: 'Itinerary validation',
      id: randomUUID(),
    })
  ).item
  const { readFile } = await import('node:fs/promises')
  // Run the explicit probe first when this is a fresh workstation.
  let probe
  try {
    probe = JSON.parse(
      await readFile('/tmp/pinwish-itinerary-probe.json', 'utf8'),
    )
  } catch {
    execFileSync('node', ['scripts/cloud/probe-itinerary.mjs'], {
      stdio: 'pipe',
    })
    probe = JSON.parse(
      await readFile('/tmp/pinwish-itinerary-probe.json', 'utf8'),
    )
  }
  const { createRequire } = await import('node:module')
  const { marshal } = createRequire(import.meta.url)(
    '../../backend/storage.cjs',
  )
  const ids = []
  for (const p of probe.places) {
    const id = createHash('sha256')
      .update(p.id + a.sub)
      .digest('hex')
    ids.push(id)
    aws([
      'dynamodb',
      'put-item',
      '--table-name',
      outputs.TableName,
      '--item',
      JSON.stringify(
        marshal({
          pk: 'USER#' + a.sub,
          sk: 'PLACE#' + id,
          id,
          placeId: p.id,
          name: p.name,
          displayName: p.name,
          address: 'Los Angeles, CA',
          countryCode: 'US',
          countryName: 'United States',
          coordinates: { longitude: p.position[0], latitude: p.position[1] },
          collectionId: collection.id,
          note: 'PRIVATE NOTE DO NOT SHARE',
          sources: {},
          visited: false,
          bookmarked: false,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          placeType: 'PointOfInterest',
        }),
      ),
    ])
  }
  assert.equal(
    (
      await request(
        null,
        `/collections/${collection.id}/itineraries/prepare`,
        'POST',
        { ids },
      )
    ).status,
    401,
  )
  assert.equal(
    (
      await request(
        b.token,
        `/collections/${collection.id}/itineraries/prepare`,
        'POST',
        { ids },
      )
    ).status,
    404,
  )
  checks.push('Only the collection owner can prepare a trip')
  const context = await ok(
    a.token,
    `/collections/${collection.id}/itineraries/prepare`,
    'POST',
    { ids },
  )
  assert.equal(context.places.length, 3)
  assert.ok(context.places.every((p) => p.hours.status === 'available'))
  assert.equal(context.zone, 'America/Los_Angeles')
  checks.push(
    'Real provider weekday opening hours and local time zone are retrieved',
  )
  const settings = {
    date: '2026-11-18',
    start: '09:00',
    end: '18:00',
    days: 0,
    mode: 'Car',
    order: 'recommended',
    stops: ids.map((id) => ({ id, duration: 120 })),
  }
  const preview = await ok(a.token, '/itineraries/preview', 'POST', {
    contextId: context.contextId,
    settings,
  })
  assert.equal(preview.plan.complete, true)
  // LACMA is closed Wednesday in this response and must appear on another day.
  const closed = probe.places.find(
    (p) => p.name === 'Los Angeles County Museum of Art',
  )
  if (closed) {
    const id = ids[probe.places.indexOf(closed)]
    assert.ok(
      !preview.plan.days
        .find((d) => d.date === '2026-11-18')
        ?.stops.some((s) => s.id === id),
    )
  }
  const { windowsOn } = createRequire(import.meta.url)(
    '../../backend/itinerary-planner.cjs',
  )
  for (const day of preview.plan.days)
    for (const stop of day.stops) {
      const p = context.places.find((p) => p.id === stop.id),
        input = settings.stops.find((p) => p.id === stop.id)
      assert.ok(
        windowsOn(p, input, day.date).some(
          (w) => stop.arrival >= w.start && stop.departure <= w.end,
        ),
      )
    }
  checks.push(
    'Calculated routes and weekday hours produce feasible visits without scheduling a closed museum',
  )
  const id = randomUUID(),
    saved = (
      await ok(a.token, '/itineraries', 'POST', {
        id,
        name: 'Los Angeles museum days',
        previewId: preview.previewId,
      })
    ).item
  assert.equal((await request(b.token, `/itineraries/${id}`)).status, 404)
  assert.equal((await ok(a.token, `/itineraries/${id}`)).item.name, saved.name)
  const shared = (await ok(a.token, `/itineraries/${id}/sharing`, 'POST')).item
  lookupTokens.push(shared.share.token)
  const publicTrip = await ok(null, `/trip-shares/${shared.share.token}`)
  assert.equal(JSON.stringify(publicTrip).includes('PRIVATE'), false)
  assert.equal(JSON.stringify(publicTrip).includes(a.sub), false)
  checks.push(
    'Saved itineraries persist with account isolation and public field filtering',
  )
  if (process.env.PINWISH_ITINERARY_BROWSER_URL) {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      })
      await page.goto(
        `${process.env.PINWISH_ITINERARY_BROWSER_URL}/#trip=${shared.share.token}`,
      )
      await page
        .getByRole('heading', { name: saved.name, exact: true })
        .waitFor({ timeout: 30000 })
      assert.equal(await page.getByText('PRIVATE NOTE DO NOT SHARE').count(), 0)
      await page.screenshot({
        path: '/tmp/pinwish-trip-live-desktop.png',
        fullPage: true,
      })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      )
      await page.screenshot({
        path: '/tmp/pinwish-trip-live-mobile.png',
        fullPage: true,
      })
      browserVerified = true
    } finally {
      await browser.close()
    }
  }
  await ok(a.token, `/itineraries/${id}/sharing`, 'DELETE')
  assert.equal(
    (await request(null, `/trip-shares/${shared.share.token}`)).status,
    404,
  )
  const fresh = (await ok(a.token, `/itineraries/${id}/sharing`, 'POST')).item
  lookupTokens.push(fresh.share.token)
  await ok(a.token, `/itineraries/${id}`, 'DELETE', { version: fresh.version })
  assert.equal(
    (await request(null, `/trip-shares/${fresh.share.token}`)).status,
    404,
  )
  checks.push('Revocation and deletion block previously issued public links')
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
            S: 'TRIPSHARE#' + createHash('sha256').update(token).digest('hex'),
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
      for (const hour of [
        Math.floor(Date.now() / 3600000),
        Math.floor(Date.now() / 3600000) - 1,
      ])
        aws([
          'dynamodb',
          'delete-item',
          '--table-name',
          outputs.TableName,
          '--key',
          JSON.stringify({
            pk: { S: `TRIPLIMIT#USER#${user.sub}#${hour}` },
            sk: { S: 'COUNT' },
          }),
        ])
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
    'docs/validation/collection-itinerary-live.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed: checks.length === 5 && !cleanupErrors.length,
        checks,
        cleanupErrors,
        temporaryUsersDeleted: users.length,
        browserVerified,
        note: 'Real AWS opening-hours and route-matrix calls, private itinerary persistence and anonymous sharing. Temporary accounts and records removed.',
      },
      null,
      2,
    ) + '\n',
  )
  assert.deepEqual(cleanupErrors, [])
}
console.log('Itinerary AWS checks passed: ' + checks.length)
