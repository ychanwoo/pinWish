import { test, expect, type Page } from '@playwright/test'
import { itineraryFixture } from './itinerary-fixture.mjs'
async function setup(page: Page, unknown = false) {
  const fixture = await itineraryFixture({ unknown })
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) =>
    r.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: `x.${Buffer.from(JSON.stringify({ sub: 'user-a' })).toString('base64url')}.y`,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  await page.route('https://storage.example.test/**', async (r) => {
    const req = r.request(),
      url = new URL(req.url())
    const result = await fixture.call(
      req.method(),
      url.pathname,
      req.postDataJSON() ?? {},
      url.pathname.startsWith('/trip-shares/') ? null : 'user-a',
      Object.fromEntries(url.searchParams),
    )
    await r.fulfill({
      status: result.statusCode,
      contentType: 'application/json',
      body: result.body,
    })
  })
  return fixture
}
async function enter(page: Page, mobile = false) {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const auth = page.getByRole('dialog')
  await auth.getByLabel('Email', { exact: true }).fill('person@example.com')
  await auth.getByLabel('Password', { exact: true }).fill('Password123!')
  await auth
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(auth).toHaveCount(0)
  if (mobile) {
    await page
      .getByRole('button', { name: 'Manage collection', exact: true })
      .click()
    await page.getByRole('button', { name: 'Plan a trip', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Options for Saved places' }).click()
    await page.getByRole('menuitem', { name: 'Plan a trip' }).click()
  }
  await expect(
    page.getByRole('heading', { name: 'Plan a trip', exact: true }),
  ).toBeVisible()
}
for (const mobile of [false, true])
  test(`trip planning, saved editing, sharing and deletion ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 })
    await setup(page)
    await enter(page, mobile)
    await page.screenshot({
      path: `/tmp/pinwish-trip-selection-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await page.getByRole('button', { name: 'Review hours & time' }).click()
    await expect(
      page.getByRole('heading', { name: 'Review hours & visit times' }),
    ).toBeVisible()
    await page.getByLabel('Start date', { exact: true }).fill('2026-11-18')
    await page.getByLabel('Visit length for The Broad').selectOption('180')
    await page.screenshot({
      path: `/tmp/pinwish-trip-review-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await page
      .getByRole('button', { name: 'Create journey', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Day by day', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Within listed opening hours')).toHaveCount(3)
    await page.getByLabel('Journey name').fill('Our Los Angeles trip')
    await page.screenshot({
      path: `/tmp/pinwish-trip-result-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await page
      .getByRole('button', { name: 'Save journey', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Your saved trip', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Create sharing link' }).click()
    const link = await page
      .getByLabel('Sharing link', { exact: true })
      .inputValue()
    await page.getByRole('button', { name: 'Close trip planner' }).click()
    await page.reload()
    if (mobile) {
      await page
        .getByRole('button', { name: 'Manage collection', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Plan a trip', exact: true })
        .click()
    } else {
      await page
        .getByRole('button', { name: 'Options for Saved places' })
        .click()
      await page.getByRole('menuitem', { name: 'Plan a trip' }).click()
    }
    await page.getByRole('button', { name: /Our Los Angeles trip/ }).click()
    await page
      .getByRole('button', { name: 'Edit journey', exact: true })
      .click()
    await page.getByRole('button', { name: 'Review hours & time' }).click()
    await expect(page.getByLabel('Visit length for The Broad')).toHaveValue(
      '180',
    )
    await page.getByRole('button', { name: 'Close trip planner' }).click()
    await page.goto(link)
    await expect(
      page.getByRole('heading', { name: 'Our Los Angeles trip' }),
    ).toBeVisible()
    await expect(page.getByText('PRIVATE DO NOT SHARE')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Edit journey' }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/tmp/pinwish-trip-public-${mobile ? 'mobile' : 'desktop'}.png`,
    })
  })
test('unknown hours allow saving with an explicit notice; manual override and narrow viewport work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await setup(page, true)
  await enter(page, true)
  await page.getByRole('button', { name: 'Review hours & time' }).click()
  await page.getByLabel('Start date', { exact: true }).fill('2026-11-18')
  await expect(page.getByText('Hours unverified', { exact: true })).toHaveCount(
    1,
  )
  await page
    .getByRole('button', { name: 'Create journey', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Save journey', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByText('Hours unverified · check before visiting', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Adjust plan' }).click()
  await page
    .locator('.trip-review-place')
    .filter({
      has: page.getByRole('heading', { name: 'Museum of Art', exact: true }),
    })
    .getByLabel('Use hours I have checked')
    .check()
  await page
    .getByRole('button', { name: 'Create journey', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Save journey', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
test('invalid and revoked public trip links clear content and offer retry', async ({
  page,
}) => {
  const f = await setup(page)
  await page.goto('/#trip=' + 'a'.repeat(64))
  await expect(
    page.getByRole('heading', { name: 'Journey unavailable' }),
  ).toBeVisible()
  const ctx = JSON.parse(
    (
      await f.call('POST', '/collections/default/itineraries/prepare', {
        ids: f.places.map((p: { id: string }) => p.id),
      })
    ).body,
  )
  const preview = JSON.parse(
    (
      await f.call('POST', '/itineraries/preview', {
        contextId: ctx.contextId,
        settings: {
          date: '2026-11-18',
          start: '09:00',
          end: '18:00',
          days: 0,
          mode: 'Car',
          stops: f.places.map((p: { id: string }) => ({
            id: p.id,
            duration: 60,
          })),
        },
      })
    ).body,
  )
  const id = crypto.randomUUID()
  await f.call('POST', '/itineraries', {
    id,
    name: 'Revocable trip',
    previewId: preview.previewId,
  })
  const saved = JSON.parse(
    (await f.call('POST', `/itineraries/${id}/sharing`)).body,
  ).item
  await page.goto('/#trip=' + saved.share.token)
  await expect(
    page.getByRole('heading', { name: 'Revocable trip' }),
  ).toBeVisible()
  await f.call('DELETE', `/itineraries/${id}/sharing`)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(
    page.getByRole('heading', { name: 'Journey unavailable' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Revocable trip' }),
  ).toHaveCount(0)
})

test('all selected visits remain saveable when their durations exceed listed windows', async ({ page }) => {
  await setup(page)
  await enter(page)
  await page.getByRole('button', { name: 'Review hours & time' }).click()
  await page.getByLabel('Start date', { exact: true }).fill('2026-11-18')
  for (const name of ['The Broad', 'Griffith Observatory', 'Museum of Art'])
    await page.getByLabel(`Visit length for ${name}`).selectOption('600')
  await page.getByRole('button', { name: 'Create journey', exact: true }).click()
  await expect(page.locator('.trip-stop-detail')).toHaveCount(3)
  await expect(page.getByText('Suggested time · confirm opening hours', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Save journey', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Save journey', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your saved trip', exact: true })).toBeVisible()
  await expect(page.locator('.trip-stop-detail')).toHaveCount(3)
})
