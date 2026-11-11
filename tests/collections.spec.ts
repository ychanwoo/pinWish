import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { db } from './unit/storage-fake.mjs'
import { place } from './unit/storage-fixture.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../backend/storage.cjs',
)

async function setup(page: Page) {
  const client = db(),
    handler = createHandler({ client, table: 'test' })
  let owner = 'user-a',
    failCreate = true
  await page.route(
    'https://cognito-idp.us-east-1.amazonaws.com/**',
    (route) => {
      const body = route.request().postDataJSON()
      if (body.AuthParameters?.USERNAME)
        owner = body.AuthParameters.USERNAME.startsWith('other')
          ? 'user-b'
          : 'user-a'
      return route.fulfill({
        json: {
          AuthenticationResult: {
            AccessToken: `x.${Buffer.from(JSON.stringify({ sub: owner })).toString('base64url')}.y`,
            RefreshToken: 'refresh',
            ExpiresIn: 300,
          },
        },
      })
    },
  )
  const invoke = async (method: string, path: string, body?: unknown) => {
    const result = await handler({
      rawPath: path,
      pathParameters: path.split('/')[2]
        ? { id: path.split('/')[2] }
        : undefined,
      requestContext: {
        http: { method },
        authorizer: { jwt: { claims: { sub: owner, token_use: 'access' } } },
      },
      body: JSON.stringify(body ?? {}),
    })
    return result
  }
  await invoke('POST', '/places', { place, note: 'Keep this note' })
  await page.route('https://storage.example.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname.endsWith('/photo')) {
      const photo = await invoke('GET', url.pathname.replace(/\/photo$/, ''))
      return route.fulfill({json: {status: 'not_found', item: JSON.parse(photo.body).item}})
    }
    const result = await invoke(
      request.method(),
      url.pathname,
      request.postDataJSON(),
    )
    if (
      request.method() === 'POST' &&
      url.pathname === '/collections' &&
      failCreate
    ) {
      failCreate = false
      return route.fulfill({
        status: 503,
        json: { code: 'storage_unavailable' },
      })
    }
    return route.fulfill({
      status: result.statusCode,
      contentType: 'application/json',
      body: result.body,
    })
  })
  return { client, invoke }
}
async function login(page: Page, email = 'person@example.com') {
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByLabel('Password', { exact: true }).fill('Password123!')
  await dialog
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Refresh places' }),
  ).toBeEnabled()
}
const visibleButton = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .filter({ visible: true })
    .first()
async function selectCollection(page: Page, name: string) {
  const locator = page
    .locator('.collection-link, .collection-chips button')
    .filter({ hasText: name })
    .filter({ visible: true })
    .first()
  await locator.click()
}
for (const mobile of [false, true])
  test(`persistent collection lifecycle, retry and account isolation (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    test.setTimeout(60000)
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    const { client } = await setup(page)
    await page.goto('/')
    // Creation is login-gated even when there are no places.
    await visibleButton(page, 'Create collection').click()
    await expect(page.getByRole('dialog')).toContainText('Sign in to create')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await login(page)
    await expect(page.locator('.place-card')).toHaveCount(1)
    await visibleButton(page, 'Create collection').click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Collection name').fill('Coffee')
    await dialog
      .getByRole('button', { name: 'Create collection', exact: true })
      .click()
    await expect(dialog.getByRole('alert')).toContainText(
      'temporarily unavailable',
    )
    await expect(dialog.getByLabel('Collection name')).toHaveValue('Coffee')
    await dialog
      .getByRole('button', { name: 'Create collection', exact: true })
      .click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.place-card')).toHaveCount(0)
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Refresh places' }),
    ).toBeEnabled()
    await selectCollection(page, 'Coffee')
    await expect(page.locator('.place-card')).toHaveCount(0)
    // A real user collection named Coffee must not become the demo category filter.
    await selectCollection(page, 'Saved places')
    await page.locator('.place-card-title').click()
    await page.getByLabel('Collection', { exact: true }).selectOption('Coffee')
    await page.getByRole('button', { name: 'Move', exact: true }).click()
    await expect(page.locator('.notice-toast')).toContainText('Changes saved')
    await expect(page.locator('.personal-note')).toContainText('Keep this note')
    await visibleButton(
      page,
      mobile ? 'Back to places' : 'Close place details',
    ).click()
    await expect(page.locator('.place-card')).toHaveCount(1)
    await visibleButton(page, 'Manage collection').click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Collection name').fill('Weekend trip')
    await dialog.getByRole('button', { name: 'Save name' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.place-card')).toHaveCount(1)
    await page.reload()
    await selectCollection(page, 'Weekend trip')
    await expect(page.locator('.place-card')).toHaveCount(1)
    await visibleButton(page, 'Manage collection').click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete collection', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toContainText(
      'notes, photos and original links will be kept',
    )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Keep collection' })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete collection', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete collection', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.place-card')).toHaveCount(1)
    await expect(page.locator('.list-footer')).toContainText('Saved places')
    await expect(
      page.getByRole('button', { name: 'Manage collection' }),
    ).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.place-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.locator('.place-card')).toHaveCount(0)
    await login(page, 'other@example.com')
    await expect(page.locator('.place-card')).toHaveCount(0)
    await expect(page.getByText('Weekend trip', { exact: true })).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      [...client.data.values()].filter((r: any) => r.sk.startsWith('PLACE#')),
    ).toHaveLength(1)
  })

test('cached photo metadata cannot restore a renamed or deleted collection', async ({page}) => {
  const {invoke} = await setup(page)
  const trip = JSON.parse((await invoke('POST', '/collections', {name:'Original trip'})).body).item
  const saved = JSON.parse((await invoke('GET', '/places')).body).items[0]
  await invoke('PATCH', '/places/'+saved.id, {version:saved.version, collectionId:trip.id})
  await page.goto('/')
  await login(page)
  await selectCollection(page,'Original trip')
  await page.locator('.place-card-title').click()
  await expect(page.getByText('Photo unavailable',{exact:true})).toBeVisible()
  await visibleButton(page,'Close place details').click()
  await visibleButton(page,'Manage collection').click()
  await page.getByLabel('Collection name').fill('Renamed trip')
  await page.getByRole('button',{name:'Save name'}).click()
  await page.locator('.place-card-title').click()
  await expect(page.getByLabel('Collection',{exact:true})).toHaveValue('Renamed trip')
  await expect(page.locator('.collection-tag')).toContainText('Renamed trip')
  await visibleButton(page,'Close place details').click()
  await visibleButton(page,'Manage collection').click()
  await page.getByRole('dialog').getByRole('button',{name:'Delete collection',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Delete collection',exact:true}).click()
  await page.locator('.place-card-title').click()
  await expect(page.locator('.collection-tag')).toContainText('Saved places')
  await visibleButton(page,'Close place details').click()
  await expect(page.locator('.place-card')).toHaveCount(1)
})
