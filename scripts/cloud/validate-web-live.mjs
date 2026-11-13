import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFile, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_LIVE_WEB_TESTS !== '1')
  throw Error('Explicit live test opt-in required')
const { outputs } = configuration(),
  { origin } = JSON.parse(await readFile('infra/generated/hosting.json'))
const users = [],
  checks = [],
  jobs = [],
  errors = []
const shareTokens = []
const networkFailures = []
let browser, page, failure
const record = check => { checks.push(check); console.log('Passed:', check) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function request(token, path, method = 'GET', body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(outputs.ApiUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    })
    if (r.status === 429) {
      await sleep(1000)
      continue
    }
    return { status: r.status, body: await r.json() }
  }
  throw Error('API remained throttled')
}
async function cleanupUser(user) {
  try {
    const records = await request(user.token, '/places')
    for (const record of records.body.items ?? []) {
      await request(user.token, '/places/' + record.id, 'DELETE', {
        version: record.version,
      })
      await sleep(300)
    }
    // Only this temporary test account's partition and images are removed.
    for (const table of [outputs.JobsTableName, outputs.TableName].filter(
      Boolean,
    )) {
      const rows =
        aws([
          'dynamodb',
          'query',
          '--table-name',
          table,
          '--key-condition-expression',
          'pk = :pk',
          '--expression-attribute-values',
          JSON.stringify({ ':pk': { S: 'USER#' + user.sub } }),
        ]).Items ?? []
      for (let offset = 0; offset < rows.length; offset += 25) {
        let pending = rows
          .slice(offset, offset + 25)
          .map((row) => ({
            DeleteRequest: { Key: { pk: row.pk, sk: row.sk } },
          }))
        for (let attempt = 0; pending.length && attempt < 4; attempt++) {
          const result = aws([
            'dynamodb',
            'batch-write-item',
            '--request-items',
            JSON.stringify({ [table]: pending }),
          ])
          pending = result.UnprocessedItems?.[table] ?? []
          if (pending.length) await sleep(1000)
        }
        if (pending.length)
          throw Error('Temporary test rows could not be cleaned up')
      }
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
    if (objects.length)
      aws([
        's3api',
        'delete-objects',
        '--bucket',
        outputs.PhotoBucketName,
        '--delete',
        JSON.stringify({
          Objects: objects.map((object) => ({ Key: object.Key })),
          Quiet: true,
        }),
      ])
  } finally {
    aws([
      'cognito-idp',
      'admin-delete-user',
      '--user-pool-id',
      outputs.UserPoolId,
      '--username',
      user.sub,
    ])
  }
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `pinwish-deploy-${Date.now()}-${i}@example.com`,
      password = 'aA1!' + randomBytes(24).toString('base64url')
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
      sub: result.User.Attributes.find((a) => a.Name === 'sub').Value,
    }
    users.push(user)
    console.log('Temporary test account created')
    aws([
      'cognito-idp',
      'admin-set-user-password',
      '--user-pool-id',
      outputs.UserPoolId,
      '--username',
      email,
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
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(30000)
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('requestfailed', async (r) => {
    if (r.url().startsWith(outputs.ApiUrl)) {
      const item = { method: r.method(), path: new URL(r.url()).pathname.replace(/\/[a-f0-9]{32,}/g, '/:id'), error: r.failure()?.errorText, responseStatus: (await r.response().catch(() => null))?.status() ?? null }
      networkFailures.push(item)
      console.log('API network failure:', JSON.stringify(item))
    }
  })
  page.on('response', (r) => {
    if (r.url().startsWith(outputs.ApiUrl) && r.status() >= 400)
      console.log('API error:', r.request().method(), new URL(r.url()).pathname.replace(/\/[a-f0-9]{32,}/g, '/:id'), r.status())
  })
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/jobs' &&
      request.method() === 'POST'
    ) {
      try {
        const body = request.postDataJSON()
        jobs.push({ id: body.id, operation: body.operation })
        console.log('Job submitted:', body.operation)
      } catch {}
    }
  })
  await page.goto(origin + '/?validation=' + Date.now())
  console.log(
    'Hosted page loaded; sign-in buttons:',
    await page.getByRole('button', { name: 'Sign in', exact: true }).count(),
  )
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email', { exact: true }).fill(users[0].email)
  await dialog.getByLabel('Password', { exact: true }).fill(users[0].password)
  await dialog
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(dialog).toHaveCount(0, { timeout: 20000 })
  record('Real Cognito sign-in on HTTPS Amplify origin')
  console.log('Cognito sign-in completed')
  await page
    .locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true })
    .first()
    .click()
  await page
    .getByLabel('Instagram post link', { exact: true })
    .fill('https://www.instagram.com/p/DfFCMjzk02S/?img_index=1')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  // The application auto-saves all matched locations and closes the dialog.
  await expect
    .poll(
      async () => {
        const saved = await request(users[0].token, '/places')
        return saved.body.items?.length ?? 0
      },
      { timeout: 240000, intervals: [2000] },
    )
    .toBe(10)
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 })
  await expect(page.locator('.live-map canvas')).toBeVisible({ timeout: 30000 })
  const saved = await request(users[0].token, '/places')
  assert.equal(saved.status, 200)
  assert.ok(
    saved.body.items.every((p) => !/\p{Script=Hangul}/u.test(p.displayName)),
  )
  const imports = jobs.filter((job) => job.operation === 'import')
  assert.equal(imports.length, 1)
  const imported = await request(users[0].token, '/jobs/' + imports[0].id)
  assert.equal(imported.body.result.fetchedImages, 12)
  assert.equal(imported.body.result.result.places.length, 10)
  record(
    'Real 12-slide Instagram post: 10 English locations resolved and saved through AWS jobs',
  )
  const jobId = jobs.find((j) => j.operation === 'import')?.id
  assert.equal((await request(users[1].token, '/jobs/' + jobId)).status, 404)
  assert.equal((await request(users[1].token, '/places')).body.items.length, 0)
  record('Cross-account job and saved-place isolation')
  await page
    .getByRole('button', { name: 'Hide collections', exact: true })
    .click()
  await expect(page.locator('#collection-sidebar')).toBeHidden()
  await page
    .getByRole('button', { name: 'Show collections', exact: true })
    .click()
  await expect(page.locator('#collection-sidebar')).toBeVisible()
  await page.screenshot({ path: '/tmp/pinwish-deployed-desktop.png' })
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect
    .poll(async () => page.locator('.place-card').count(), { timeout: 20000 })
    .toBe(10)
  record(
    'Session and 10 saved places survive reload; sidebar toggle preserves layout',
  )
  await page
    .locator('.place-card-title')
    .filter({ hasText: 'Griffith Observatory' })
    .click()
  await expect(page.locator('#place-heading')).toContainText(
    'Griffith Observatory',
  )
  await expect(page.locator('.cover-frame img')).toBeVisible({ timeout: 45000 })
  record('Automatic representative photo renders without upload')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({ path: '/tmp/pinwish-deployed-mobile.png' })
  assert.deepEqual(errors, [])
  record(
    'Mobile detail has no horizontal overflow; no uncaught browser errors',
  )
  if (process.env.PINWISH_RUN_RELEASE_TESTS === '1') {
    const { validateReleaseBrowser } = await import('./validate-release-browser.mjs')
    await validateReleaseBrowser({ page, browser, origin, user: users[0], request, checks, shareTokens })
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ checks }, null, 2))
} catch (e) {
  failure = e.message
  console.error('Live validation failed:', e.message)
  if (page) {
    await page
      .screenshot({ path: '/tmp/pinwish-deployment-failure.png' })
      .catch(() => {})
    await writeFile(
      '/tmp/pinwish-deployment-failure.txt',
      await page.locator('body').innerText(),
    ).catch(() => {})
  }
  throw e
} finally {
  await browser?.close()
  const cleanupErrors = []
  for (const user of users) {
    try {
      await cleanupUser(user)
    } catch (error) {
      cleanupErrors.push(error.message)
      process.exitCode = 1
    }
  }

  for (const {type, token} of shareTokens) {
    try {
      const prefix = type === 'trip' ? 'TRIPSHARE#' : 'SHARE#'
      aws(['dynamodb', 'delete-item', '--table-name', outputs.TableName, '--key', JSON.stringify({pk:{S:prefix+createHash('sha256').update(token).digest('hex')},sk:{S:'LINK'}})])
    } catch (error) { cleanupErrors.push(error.message); process.exitCode = 1 }
  }
  try {
    execFileSync('node', ['scripts/cloud/runtime.mjs', 'off'], {stdio:'inherit'})
  } catch (error) { cleanupErrors.push('Runtime pause failed: '+error.message); process.exitCode=1 }
  await writeFile(
    'infra/generated/web-validation.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        origin,
        checks,
        passed: !failure && !errors.length && !cleanupErrors.length,
        failure: failure ?? null,
        errors,
        cleanupErrors,
      networkFailures,
        jobs: jobs.map(({ operation, status, code }) => ({
          operation,
          status,
          code,
        })),
      },
      null,
      2,
    ),
  )
}
