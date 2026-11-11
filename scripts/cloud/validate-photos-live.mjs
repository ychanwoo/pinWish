import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import { chromium } from '@playwright/test'
if (process.env.PINWISH_RUN_LIVE_PHOTO_TESTS !== '1')
  throw Error('Set PINWISH_RUN_LIVE_PHOTO_TESTS=1 to run AWS photo validation')
const aws = (args) => {
  try {
    const v = execFileSync(
      'aws',
      [...args, '--region', 'us-east-1', '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return v.trim() ? JSON.parse(v) : {}
  } catch {
    // Avoid leaking temporary passwords/tokens through execFileSync error arguments.
    throw new Error(`AWS ${args[0]} ${args[1]} failed`)
  }
}
const config = Object.fromEntries(
  aws([
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    'pinwish-storage-dev',
  ]).Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
)
assert.ok(
  config.PhotoBucketName,
  'Wait for the CloudFormation update to complete before testing photos',
)
const users = [],
  checks = []
let current, originalKey
async function request(token, suffix = '', method = 'GET', body) {
  await new Promise((r) => setTimeout(r, 650))
  const response = await fetch(config.ApiUrl + '/places' + suffix, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  })
  return { status: response.status, value: await response.json() }
}
const exists = (objectKey) => {
  try {
    aws([
      's3api',
      'head-object',
      '--bucket',
      config.PhotoBucketName,
      '--key',
      objectKey,
    ])
    return true
  } catch {
    return false
  }
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `pinwish-photo-${Date.now()}-${i}@example.com`,
      password = 'aA1!' + randomBytes(24).toString('base64url')
    const account = aws([
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
    const user = {
      email,
      password,
      sub: account.User.Attributes.find((a) => a.Name === 'sub').Value,
    }
    users.push(user)
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
    user.token = aws([
      'cognito-idp',
      'initiate-auth',
      '--client-id',
      config.UserPoolClientId,
      '--auth-flow',
      'USER_PASSWORD_AUTH',
      '--auth-parameters',
      JSON.stringify({ USERNAME: email, PASSWORD: password }),
    ]).AuthenticationResult.AccessToken
  }
  const real = JSON.parse(
    await readFile('docs/validation/automatic-import-live.json', 'utf8'),
  ).lookups.find((x) => x.top.name === 'The Gamble House').top
  const p = {
    ...real,
    displayName: real.name,
    retrievedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    source: {
      instagram: { originalUrl: 'https://www.instagram.com/p/DfFCMjzk02S/' },
      slides: [10],
      extractedName: real.name,
      evidence: 'Automatic photo validation from real saved place',
    },
  }
  const created = await request(users[0].token, '', 'POST', {
    place: p,
    collection: 'Photo validation',
    note: 'Preserve this note',
  })
  assert.equal(created.status, 201)
  current = created.value.item
  // Do not call the photo endpoint until the background job has attached its photo.
  // This proves POST /places itself triggers discovery, without an upload or detail view.
  for (let attempt = 0; attempt < 30; attempt++) {
    const latest = await request(users[0].token, `/${current.id}`)
    current = latest.value.item
    if (current.coverPhoto) break
    if (['not_found', 'unavailable'].includes(current.photoLookup?.status))
      throw Error('Automatic photo lookup: ' + current.photoLookup.status)
    await new Promise((r) => setTimeout(r, 2000))
  }
  assert.ok(current.coverPhoto, 'Background discovery must attach photo')
  originalKey = current.coverPhoto.objectKey
  assert.equal(current.coverPhoto.provider, 'wikimedia-commons')
  assert.equal(current.note, 'Preserve this note')
  assert.ok(exists(originalKey))
  checks.push(
    'Saving real Gamble House automatically discovers and stores its photo without opening details',
  )
  const downloaded = await request(users[0].token, `/${current.id}/photo`)
  assert.equal(downloaded.status, 200)
  const decoded = jpeg.decode(
    Buffer.from(downloaded.value.imageBase64, 'base64'),
  )
  assert.ok(decoded.width >= 1000)
  checks.push(
    'Owner retrieves high-resolution decodable JPEG with author, license and source',
  )
  const direct = await fetch(
    `https://${config.PhotoBucketName}.s3.us-east-1.amazonaws.com/${originalKey}`,
  )
  assert.equal(direct.status, 403)
  assert.equal(
    (await request(users[1].token, `/${current.id}/photo`)).status,
    404,
  )
  assert.equal((await request('', `/${current.id}/photo`)).status, 401)
  assert.equal(
    (await request(users[0].token, `/${current.id}/photo`, 'POST', {})).status,
    404,
  )
  checks.push(
    'Private S3, cross-user isolation and removed upload route verified',
  )
  if (process.env.PINWISH_PHOTO_BROWSER_URL) {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      })
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(process.env.PINWISH_PHOTO_BROWSER_URL)
      await page
        .getByRole('button', { name: 'Sign in', exact: true })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Email', { exact: true }).fill(users[0].email)
      await dialog
        .getByLabel('Password', { exact: true })
        .fill(users[0].password)
      await dialog
        .getByRole('button', { name: 'Sign in', exact: true })
        .last()
        .click()
      await page
        .locator('.place-card-title')
        .filter({ hasText: 'The Gamble House' })
        .click()
      const photo = page.getByRole('button', {
        name: 'Enlarge photo of The Gamble House',
      })
      await photo.waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(
        () => document.querySelector('.cover-frame img')?.naturalWidth > 1000,
      )
      assert.equal(await page.locator('input[type=file]').count(), 0)
      await page.screenshot({
        path: '/tmp/pinwish-automatic-photo-desktop.png',
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({
        path: '/tmp/pinwish-automatic-photo-mobile.png',
        fullPage: true,
      })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      )
      await photo.click()
      await page
        .getByRole('dialog', { name: 'Photo of The Gamble House' })
        .waitFor()
      await page.keyboard.press('Escape')
      assert.deepEqual(errors, [])
      checks.push(
        'Real browser login and automatic photo display, mobile fit, enlargement, no upload UI and no JS errors',
      )
    } finally {
      await browser.close()
    }
  }
  const deleted = await request(users[0].token, `/${current.id}`, 'DELETE', {
    version: current.version,
  })
  assert.equal(deleted.status, 200)
  assert.equal(exists(originalKey), false)
  current = null
  checks.push('Deleting saved place also removes its automatic cover photo')
} finally {
  if (current && users[0]) {
    const latest = await request(users[0].token, `/${current.id}`)
    if (latest.status === 200)
      await request(users[0].token, `/${current.id}`, 'DELETE', {
        version: latest.value.item.version,
      })
  }
  for (const user of users) {
    const objects =
      aws([
        's3api',
        'list-objects-v2',
        '--bucket',
        config.PhotoBucketName,
        '--prefix',
        `photos/${user.sub}/`,
      ]).Contents ?? []
    for (const object of objects)
      aws([
        's3api',
        'delete-object',
        '--bucket',
        config.PhotoBucketName,
        '--key',
        object.Key,
      ])
    aws([
      'cognito-idp',
      'admin-delete-user',
      '--user-pool-id',
      config.UserPoolId,
      '--username',
      user.email,
    ])
  }
}
const report = {
  testedAt: new Date().toISOString(),
  services: ['Cognito', 'API Gateway', 'Lambda', 'DynamoDB', 'S3'],
  checks,
  temporaryUsersDeleted: users.length,
  testObjectsRemoved: true,
}
await writeFile(
  'docs/validation/place-photos-live.json',
  JSON.stringify(report, null, 2) + '\n',
)
console.log(JSON.stringify(report))
