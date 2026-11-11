import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_LIVE_DIRECT_TESTS !== '1')
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
async function job(token, operation, payload) {
  const id = randomUUID()
  await ok(token, '/jobs', 'POST', { id, operation, payload })
  for (let attempt = 0; attempt < 35; attempt++) {
    await pause(1000)
    const r = await ok(token, '/jobs/' + id)
    if (r.status === 'failed') throw Error(operation + ': ' + r.code)
    if (r.status === 'complete') return { id, result: r.result }
  }
  throw Error(operation + ' timed out')
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
    const email = `pinwish-direct-${Date.now()}-${index}@example.com`,
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
  assert.equal((await request(null, '/jobs', 'POST', {})).status, 401)
  const searched = await job(a.token, 'search', {
    query: 'The Gamble House',
    region: 'Pasadena, California',
    countryCode: 'US',
  })
  const match = searched.result.matches.find(
    (p) => /gamble/i.test(p.englishName ?? '') && /Pasadena/i.test(p.address),
  )
  assert.ok(match, 'Expected venue and city in real Amazon Location results')
  checks.push('English name/address search returns the intended Pasadena venue')
  const details = await job(a.token, 'details', {
    selectionToken: match.selectionToken,
  })
  assert.equal(details.result.place.placeId, match.placeId)
  const body = {
    directSearch: {
      detailsJobId: details.id,
      query: 'The Gamble House',
      region: 'Pasadena, California',
    },
    note: 'Temporary direct-search validation',
    collectionId: 'default',
  }
  assert.equal((await request(b.token, '/places', 'POST', body)).status, 409)
  assert.equal(
    (
      await request(a.token, '/places', 'POST', {
        ...body,
        directSearch: { ...body.directSearch, detailsJobId: searched.id },
      })
    ).status,
    409,
  )
  checks.push('Foreign-account and search-only job IDs cannot authorize a save')
  const saved = await ok(a.token, '/places', 'POST', body)
  assert.deepEqual(saved.item.sources, {})
  assert.equal(saved.item.searchOrigin.query, body.directSearch.query)
  assert.equal(saved.item.placeId, match.placeId)
  const duplicate = await ok(a.token, '/places', 'POST', {
    ...body,
    note: 'Must not overwrite',
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.item.note, body.note)
  const reloaded = await ok(a.token, '/places')
  assert.equal(reloaded.items.length, 1)
  assert.equal(reloaded.items[0].id, saved.item.id)
  assert.equal((await ok(b.token, '/places')).items.length, 0)
  checks.push(
    'Save, reload, duplicate preservation and user isolation pass without an Instagram source',
  )
  const korean = await job(a.token, 'search', {
    query: '그리피스 천문대',
    region: 'Los Angeles',
    countryCode: 'US',
  })
  assert.equal(korean.result.queryConversion.originalQuery, '그리피스 천문대')
  assert.ok(
    korean.result.matches.some((p) => /Griffith/i.test(p.englishName ?? '')),
  )
  checks.push(
    'Korean overseas query is preserved and returns English Griffith Observatory results',
  )
  // Photo discovery may advance the record version while the Korean lookup runs.
  // Refresh before editing, just as the client must after a version conflict.
  const latest = await ok(a.token, '/places/' + saved.item.id)
  const updated = await ok(a.token, '/places/' + saved.item.id, 'PATCH', {
    version: latest.item.version,
    visited: true,
  })
  assert.equal(updated.item.visited, true)
  await ok(a.token, '/places/' + saved.item.id, 'DELETE', {
    version: updated.item.version,
  })
  checks.push(
    'Existing visited and delete actions work for directly saved places',
  )
} finally {
  try {
    execFileSync('node', ['scripts/cloud/runtime.mjs', 'off'], {
      stdio: 'inherit',
    })
  } catch {
    cleanupErrors.push('Runtime pause failed')
  }
  // Let any already-running photo task settle before removing temporary data.
  if (users.length) await pause(12000)
  for (const user of users) {
    try {
      await cleanup(user)
    } catch (e) {
      cleanupErrors.push('Temporary data: ' + e.message)
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
    'docs/validation/direct-place-search-live.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed: checks.length === 5 && cleanupErrors.length === 0,
        checks,
        cleanupErrors,
        temporaryUsersDeleted: users.length,
        note: 'Real AWS API validation; frontend layout is validated separately with browser fixtures.',
      },
      null,
      2,
    ) + '\n',
  )
  assert.deepEqual(cleanupErrors, [])
}
console.log(
  'Direct search AWS validation passed: ' +
    checks.length +
    ' checks; temporary data removed.',
)
