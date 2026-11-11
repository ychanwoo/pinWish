import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { db } from './unit/storage-fake.mjs'
import { place } from './unit/storage-fixture.mjs'
const { createHandler } = createRequire(import.meta.url)(
  '../backend/storage.cjs',
)
async function setup(page: Page) {
  const client = db()
  const handler = createHandler({ client, table: 'test' })
  const invoke = (
    method: string,
    path: string,
    body = {},
    owner: string | null = 'user-a',
    query = {},
  ) =>
    handler({
      rawPath: path,
      pathParameters: { id: path.split('/')[2] },
      requestContext: {
        http: { method },
        ...(owner
          ? {
              authorizer: {
                jwt: { claims: { sub: owner, token_use: 'access' } },
              },
            }
          : {}),
      },
      queryStringParameters: query,
      body: JSON.stringify(body),
    })
  await invoke('POST', '/places', { place, note: 'This note is private' })
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (route) =>
    route.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: `x.${Buffer.from(JSON.stringify({ sub: 'user-a' })).toString('base64url')}.y`,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  const requests: { path: string; auth?: string }[] = []
  await page.route('https://storage.example.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      anonymous = url.pathname.startsWith('/shared/')
    requests.push({ path: url.pathname, auth: request.headers().authorization })
    const result = await invoke(
      request.method(),
      url.pathname,
      request.postDataJSON() ?? {},
      anonymous ? null : 'user-a',
      Object.fromEntries(url.searchParams),
    )
    await route.fulfill({
      status: result.statusCode,
      contentType: 'application/json',
      body: result.body,
    })
  })
  return { invoke, client, requests }
}
async function login(page: Page) {
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email', { exact: true }).fill('person@example.com')
  await dialog.getByLabel('Password', { exact: true }).fill('Password123!')
  await dialog
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Refresh places', exact: true }),
  ).toBeEnabled()
}
for (const mobile of [false, true])
  test(`owner sharing and anonymous browsing (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 })
    const { invoke, requests } = await setup(page)
    await page.goto('/')
    await login(page)
    if (mobile) {
      await page
        .getByRole('button', { name: 'Manage collection', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Share collection', exact: true })
        .click()
    } else {
      await page
        .getByRole('button', { name: 'Options for Saved places', exact: true })
        .click()
      await page
        .getByRole('menuitem', { name: 'Share collection', exact: true })
        .click()
    }
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('personal notes')
    await dialog
      .getByRole('button', { name: 'Create sharing link', exact: true })
      .click()
    const link = await dialog.getByLabel('Read-only link').inputValue()
    expect(link).toContain('/#share=')
    await page.screenshot({
      path: `/tmp/pinwish-sharing-dialog-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await dialog
      .getByRole('button', { name: 'Stop sharing', exact: true })
      .click()
    await expect(dialog).toContainText('Stop sharing?')
    await dialog
      .getByRole('button', { name: 'Keep sharing', exact: true })
      .click()
    await expect(dialog.getByLabel('Read-only link')).toHaveValue(link)
    await page.goto(link)
    await expect(
      page.getByRole('heading', { name: 'Saved places', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Museum/ })).toBeVisible()
    await expect(
      page.getByText('This note is private', { exact: true }),
    ).toHaveCount(0)
    expect(
      requests
        .filter((r) => r.path.startsWith('/shared/'))
        .every((r) => !r.auth),
    ).toBe(true)
    await page.getByRole('button', { name: /Museum/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Museum', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Directions', exact: true }),
    ).toHaveAttribute('href', /destination=34,-118/)
    await expect(
      page.getByRole('button', { name: 'Edit personal note' }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/tmp/pinwish-shared-detail-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await invoke('DELETE', '/collections/default/sharing')
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'This link is unavailable' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Museum', exact: true }),
    ).toHaveCount(0)
  })
test('owner can revoke, recover failed requests and create a different link', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Options for Saved places' }).click()
  await page.getByRole('menuitem', { name: 'Share collection' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Create sharing link' }).click()
  const first = await dialog.getByLabel('Read-only link').inputValue()
  await dialog
    .getByRole('button', { name: 'Stop sharing', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Stop sharing', exact: true })
    .click()
  await expect(dialog).toContainText('The old link no longer works.')
  await dialog.getByRole('button', { name: 'Create sharing link' }).click()
  await expect(dialog.getByLabel('Read-only link')).not.toHaveValue(first)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Options for Saved places' }),
  ).toBeFocused()
})
test('public errors are recoverable and empty collections are honest', async ({
  page,
}) => {
  const { invoke } = await setup(page)
  const created = JSON.parse(
    (await invoke('POST', '/collections', { name: 'Empty trip' })).body,
  ).item
  const token = JSON.parse(
    (await invoke('POST', `/collections/${created.id}/sharing`)).body,
  ).token
  await page.goto(`/#share=${token}`)
  await expect(
    page.getByText('No places in this collection yet.', { exact: true }),
  ).toBeVisible()
  await page.route('https://storage.example.test/shared/**', (route) =>
    route.fulfill({ status: 503, json: { code: 'storage_unavailable' } }),
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Could not load collection' }),
  ).toBeVisible()
  await page.unroute('https://storage.example.test/shared/**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { name: 'Empty trip', exact: true }),
  ).toBeVisible()
})

test('sharing dialog fits a short screen and copy denial leaves a selectable link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Denied')) },
    }),
  )
  await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Manage collection' }).click()
  await page.getByRole('button', { name: 'Share collection' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Create sharing link' }).click()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog).toContainText('Select and copy the link above.')
  const box = await dialog.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(568)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Manage collection' })).toBeFocused()
})
