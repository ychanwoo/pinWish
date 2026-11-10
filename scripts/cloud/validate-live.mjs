import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
if (process.env.PINWISH_RUN_LIVE_STORAGE_TESTS !== '1')
  throw Error(
    'Set PINWISH_RUN_LIVE_STORAGE_TESTS=1 for explicit AWS validation',
  )
const region = process.env.AWS_REGION ?? 'us-east-1'
const aws = (args) => {
  const result = execFileSync(
    'aws',
    [...args, '--region', region, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return result.trim() ? JSON.parse(result) : {}
}
const outputs = aws([
  'cloudformation',
  'describe-stacks',
  '--stack-name',
  'pinwish-storage-dev',
]).Stacks[0].Outputs
const config = Object.fromEntries(
  outputs.map((o) => [o.OutputKey, o.OutputValue]),
)
const users = [],
  records = [],
  checks = []
const pause = () => new Promise((r) => setTimeout(r, 650))
async function request(token, path = '', method = 'GET', body) {
  await pause()
  const r = await fetch(config.ApiUrl + '/places' + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const value = await r.json()
  return { status: r.status, value }
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `pinwish-test-${Date.now()}-${i}@example.com`,
      password = randomBytes(24).toString('base64url') + 'aA1!'
    aws([
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id',
      config.UserPoolId,
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
    users.push({ email, password })
    aws([
      'cognito-idp',
      'admin-set-user-password',
      '--user-pool-id',
      config.UserPoolId,
      '--username',
      email,
      '--password',
      password,
      '--permanent',
    ])
    const auth = aws([
      'cognito-idp',
      'initiate-auth',
      '--client-id',
      config.UserPoolClientId,
      '--auth-flow',
      'USER_PASSWORD_AUTH',
      '--auth-parameters',
      JSON.stringify({ USERNAME: email, PASSWORD: password }),
    ])
    users.at(-1).token = auth.AuthenticationResult.AccessToken
    users.at(-1).refresh = auth.AuthenticationResult.RefreshToken
  }
  const [a, b] = users
  assert.equal((await request(null)).status, 401)
  checks.push('Unauthenticated request rejected')
  const original = JSON.parse(
    await readFile('docs/validation/english-query-live.json', 'utf8'),
  ).results[0]
  const match = original.matches[0]
  const place = {
    ...match,
    koreanName: match.koreanName ?? null,
    englishName: match.englishName ?? null,
    displayName: match.englishName || match.name,
    retrievedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    source: {
      instagram: {
        originalUrl: 'https://www.instagram.com/p/DfFCMjzk02S/?img_index=2',
      },
      slides: [2],
      extractedName: original.input.query,
      evidence: original.input.query,
    },
  }
  let saved = await request(a.token, '', 'POST', {
    place,
    note: 'Live storage validation',
    collection: 'Validation',
  })
  assert.equal(saved.status, 201, JSON.stringify(saved))
  records.push({ token: a.token, id: saved.value.item.id })
  const id = saved.value.item.id
  assert.equal(
    (await request(a.token, '', 'POST', { place })).value.item.id,
    id,
  )
  checks.push('Idempotent duplicate create')
  assert.equal((await request(b.token, `/${id}`)).status, 404)
  assert.equal(
    (
      await request(b.token, `/${id}`, 'PATCH', {
        version: 1,
        note: 'other user',
      })
    ).status,
    404,
  )
  assert.equal(
    (await request(b.token, `/${id}`, 'DELETE', { version: 1 })).status,
    404,
  )
  checks.push('Second account cannot read/update/delete first account record')
  const updated = await request(a.token, `/${id}`, 'PATCH', {
    version: 1,
    note: 'Persisted note',
    visited: true,
  })
  assert.equal(updated.status, 200, JSON.stringify(updated))
  assert.equal(
    (await request(a.token, `/${id}`, 'PATCH', { version: 1, note: 'stale' }))
      .status,
    409,
  )
  checks.push('Update persisted and stale version rejected')
  const login = aws([
    'cognito-idp',
    'initiate-auth',
    '--client-id',
    config.UserPoolClientId,
    '--auth-flow',
    'USER_PASSWORD_AUTH',
    '--auth-parameters',
    JSON.stringify({ USERNAME: a.email, PASSWORD: a.password }),
  ])
  a.token = login.AuthenticationResult.AccessToken
  const read = await request(a.token, `/${id}`)
  assert.equal(read.value.item.note, 'Persisted note')
  assert.equal(read.value.item.visited, true)
  checks.push('Record survives a new sign-in')
  const refreshed = aws([
    'cognito-idp',
    'initiate-auth',
    '--client-id',
    config.UserPoolClientId,
    '--auth-flow',
    'REFRESH_TOKEN_AUTH',
    '--auth-parameters',
    JSON.stringify({ REFRESH_TOKEN: a.refresh }),
  ])
  assert.equal(
    (await request(refreshed.AuthenticationResult.AccessToken)).status,
    200,
  )
  checks.push('Refresh-token authentication works')
  // Create a second real provider location to verify pagination.
  const second = JSON.parse(
    await readFile('docs/validation/english-query-live.json', 'utf8'),
  ).results[1].matches[0]
  const another = {
    ...place,
    ...second,
    displayName: second.englishName || second.name,
  }
  const saved2 = await request(a.token, '', 'POST', { place: another })
  assert.equal(saved2.status, 201)
  records.push({ token: a.token, id: saved2.value.item.id })
  const page1 = await request(a.token, '?limit=1')
  assert.equal(page1.value.items.length, 1)
  assert.ok(page1.value.cursor)
  const page2 = await request(
    a.token,
    '?limit=1&cursor=' + encodeURIComponent(page1.value.cursor),
  )
  assert.equal(page2.value.items.length, 1)
  assert.notEqual(page1.value.items[0].id, page2.value.items[0].id)
  assert.equal(
    (
      await request(
        b.token,
        '?cursor=' + encodeURIComponent(page1.value.cursor),
      )
    ).status,
    400,
  )
  checks.push('Pagination works and foreign-owner cursor rejected')
  const result = {
    checkedAt: new Date().toISOString(),
    stack: 'pinwish-storage-dev',
    region,
    checks,
    accountCreation:
      'Temporary admin-created users with message SUPPRESS; no email sent',
    emailDeliveryVerified: false,
  }
  await mkdir('docs/validation', { recursive: true })
  await writeFile(
    'docs/validation/storage-live.json',
    JSON.stringify(result, null, 2) + '\n',
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  for (const record of records) {
    try {
      const r = await request(record.token, `/${record.id}`)
      if (r.status === 200)
        await request(record.token, `/${record.id}`, 'DELETE', {
          version: r.value.item.version,
        })
    } catch {
      console.error('Test record cleanup failed; inspect Validation collection')
    }
  }
  for (const user of users) {
    try {
      aws([
        'cognito-idp',
        'admin-delete-user',
        '--user-pool-id',
        config.UserPoolId,
        '--username',
        user.email,
      ])
    } catch {
      console.error('Test account cleanup failed')
    }
  }
}
