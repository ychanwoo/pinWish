import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_LIVE_MAP_TESTS !== '1')
  throw Error('Explicit live test opt-in required')
const { outputs } = configuration()
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
    const email = `pinwish-map-${Date.now()}-${index}@example.com`,
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
  const { createRequire } = await import('node:module')
  const { marshal } = createRequire(import.meta.url)(
    '../../backend/storage.cjs',
  )
  const { GeoPlacesClient, SearchTextCommand } =
    await import('@aws-sdk/client-geo-places')
  const found = await new GeoPlacesClient({
    region: 'us-east-1',
    maxAttempts: 1,
  }).send(
    new SearchTextCommand({
      QueryText: 'Griffith Observatory Los Angeles',
      BiasPosition: [-118.25, 34.05],
      Language: 'en',
      MaxResults: 1,
      IntendedUse: 'Storage',
    }),
    { abortSignal: AbortSignal.timeout(8000) },
  )
  const match = found.ResultItems?.[0]
  assert.ok(match?.PlaceId && match.Position)
  const place = {
    id: match.PlaceId,
    name: match.Title,
    position: match.Position,
  }
  const id = createHash('sha256')
    .update(place.id + a.sub)
    .digest('hex')
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
        placeId: place.id,
        name: place.name,
        displayName: place.name,
        address: 'Los Angeles, CA',
        countryCode: 'US',
        countryName: 'United States',
        coordinates: {
          longitude: place.position[0],
          latitude: place.position[1],
        },
        collectionId: 'default',
        collection: 'Saved places',
        note: '',
        sources: {},
        visited: false,
        bookmarked: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        placeType: 'PointOfInterest',
      }),
    ),
  ])
  assert.equal((await request(null, '/map-preferences')).status, 401)
  assert.equal((await request(b.token, `/places/${id}/details`)).status, 404)
  checks.push(
    'Metadata and preferences require authentication and owned places',
  )
  const detail = await ok(a.token, `/places/${id}/details`)
  assert.ok(detail.region.key && detail.region.label)
  assert.equal(detail.zone, 'America/Los_Angeles')
  assert.equal(detail.hours.status, 'available')
  const cached = await ok(a.token, `/places/${id}/details`)
  assert.equal(cached.checkedAt, detail.checkedAt)
  checks.push(
    'Actual provider region, time zone and weekly hours are returned and cached',
  )
  await ok(a.token, '/collections')
  let preferences = await ok(a.token, '/map-preferences')
  preferences = await ok(a.token, '/map-preferences', 'PATCH', {
    collectionId: 'default',
    color: '#426b57',
    version: preferences.version,
  })
  assert.equal(
    (await ok(a.token, '/map-preferences')).colors.default,
    '#426b57',
  )
  assert.deepEqual((await ok(b.token, '/map-preferences')).colors, {})
  assert.equal(
    (
      await request(a.token, '/map-preferences', 'PATCH', {
        collectionId: 'default',
        color: '#426782',
        version: 0,
      })
    ).status,
    409,
  )
  checks.push('Collection colors persist per account and reject stale versions')
  const reset = await ok(a.token, '/map-preferences', 'PATCH', {
    collectionId: 'default',
    color: null,
    version: preferences.version,
  })
  assert.deepEqual(reset.colors, {})
  const visited = await ok(a.token, `/places/${id}`, 'PATCH', {
    visited: true,
    version: 1,
  })
  assert.equal(visited.item.visited, true)
  checks.push('Color reset and existing visited-state updates persist')
} finally {
  try {
    execFileSync('node', ['scripts/cloud/runtime.mjs', 'off'], {
      stdio: 'inherit',
    })
  } catch {
    cleanupErrors.push('Could not pause runtime')
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
            pk: { S: `DETAILSLIMIT#USER#${user.sub}#${hour}` },
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
    'docs/validation/map-appearance-live.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed: checks.length === 4 && !cleanupErrors.length,
        checks,
        cleanupErrors,
        temporaryUsersDeleted: users.length,
        note: 'Actual AWS API checks. Public place metadata cache expires after seven days; quota bookkeeping after two days. Runtime paused.',
      },
      null,
      2,
    ) + '\n',
  )
}
assert.equal(cleanupErrors.length, 0)
console.log('Map appearance AWS checks passed: ' + checks.length)
