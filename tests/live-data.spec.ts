import { test, expect, type Page } from '@playwright/test'
import { collectionResponse } from './helpers/collection-fixture'
const rows = [
  {
    id: 'a'.repeat(64),
    name: 'Older Museum',
    createdAt: '2026-09-01T12:00:00Z',
    visited: true,
    address: '20 First Avenue',
  },
  {
    id: 'b'.repeat(64),
    name: 'Newest Garden',
    createdAt: '2026-11-10T12:00:00Z',
    visited: false,
    address: '50 Spring Road',
  },
  {
    id: 'c'.repeat(64),
    name: 'Middle Pier',
    createdAt: '2026-10-01T12:00:00Z',
    visited: false,
    address: '10 Ocean Avenue',
  },
].map((p) => ({
  ...p,
  displayName: p.name,
  provider: 'amazon-location',
  placeId: p.id,
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118, latitude: 34 },
  placeType: 'PointOfInterest',
  note: '',
  collection: 'Saved places',
  collectionId: 'default',
  bookmarked: true,
  version: 1,
  updatedAt: '2026-11-11T12:00:00Z',
  sources: {},
}))
async function setup(
  page: Page,
  options: { fail?: boolean; delay?: number } = {},
) {
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) =>
    r.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: `x.${Buffer.from(JSON.stringify({ sub: 'polish-user' })).toString('base64url')}.y`,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  await page.route('https://storage.example.test/**', async (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === '/collections')
      return r.fulfill({ json: collectionResponse })
    if (url.pathname.endsWith('/photo'))
      return r.fulfill({ status: 503, json: { code: 'photos_unavailable' } })
    if (options.delay)
      await new Promise((resolve) => setTimeout(resolve, options.delay))
    if (options.fail)
      return r.fulfill({ status: 503, json: { code: 'storage_unavailable' } })
    return r.fulfill({
      json: {
        items: url.searchParams.has('cursor')
          ? rows.slice(1)
          : rows.slice(0, 1),
        cursor: url.searchParams.has('cursor') ? null : 'next',
        collectionVersion: 1,
      },
    })
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          sessionStorage.setItem('test:copied', value)
        },
      },
    })
  })
}
async function login(page: Page) {
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  await page.getByLabel('Email', { exact: true }).fill('polish@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Password123!')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
for (const mobile of [false, true])
  test(`live sorting, filters, metadata and controls (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    await page.goto('/')
    await login(page)
    const titles = page.locator('.place-card-title h2')
    await expect(titles).toHaveText([
      'Newest Garden',
      'Middle Pier',
      'Older Museum',
    ])
    await expect(page.locator('.category-tabs')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toHaveCount(0)
    await page.getByLabel('Sort places').selectOption('name')
    await expect(titles).toHaveText([
      'Middle Pier',
      'Newest Garden',
      'Older Museum',
    ])
    await page.reload()
    await expect(titles).toHaveText([
      'Newest Garden',
      'Middle Pier',
      'Older Museum',
    ])
    const picker = page.getByLabel('Select a saved place on the map')
    await expect(picker.locator('option')).toHaveCount(4)
    await page
      .getByRole('button', { name: 'Show unvisited places only' })
      .click()
    await expect(titles).toHaveText(['Newest Garden', 'Middle Pier'])
    await expect(picker.locator('option')).toHaveCount(3)
    await page
      .getByRole('textbox', { name: 'Search places', exact: true })
      .fill('Ocean Avenue')
    await expect(titles).toHaveText(['Middle Pier'])
    await expect(picker.locator('option')).toHaveCount(2)
    await page
      .getByRole('textbox', { name: 'Search places', exact: true })
      .fill('does not exist')
    await expect(
      page.getByText('No matching places', { exact: true }),
    ).toBeVisible()
    await expect(picker.locator('option')).toHaveCount(1)
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .click()
    await expect(titles).toHaveCount(3)
    await page.locator('.place-card-title').first().click()
    await expect(page.locator('.personal-note')).toContainText('No note yet.')
    await expect(
      page.getByRole('button', { name: 'More place options' }),
    ).toHaveCount(0)
    await expect(page.getByText('Updated 2d ago', { exact: true })).toHaveCount(
      0,
    )
    await expect(page.locator('.open-dot')).toHaveCount(0)
    await expect(page.locator('.detail-tags')).toHaveCount(0)
    await expect(
      page.getByRole('button', {
        name: 'Open directions in Google Maps',
        exact: true,
      }),
    ).toBeVisible()
    if (!mobile)
      await expect(
        page.getByRole('button', { name: 'Open in Google Maps', exact: true }),
      ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy Link', exact: true })).toHaveCSS('white-space', 'nowrap')
    await page
      .getByRole('button', { name: 'Copy Link', exact: true })
      .click()
    await expect(page.locator('.notice-toast')).toContainText(
      'Only your account',
    )
    const copied = await page.evaluate(() =>
      sessionStorage.getItem('test:copied'),
    )
    expect(copied).toContain(rows[1].id)
    await page.goto(copied!)
    await expect(page.locator('#place-heading')).toHaveText('Newest Garden')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/tmp/pinwish-polish-${mobile ? 'mobile' : 'desktop'}.png`,
    })
  })
test('private link waits for sign-in and reports an unavailable place without exposing data', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/?view=detail&place=' + 'f'.repeat(64))
  await expect(page.locator('#place-heading')).toHaveCount(0)
  await login(page)
  await expect(page.locator('.notice-toast')).toContainText(
    'not available in your account',
  )
  await expect(page.locator('#place-heading')).toHaveCount(0)
  await expect(page.locator('.place-card')).toHaveCount(3)
})
test('initial loading and failure do not claim that a collection is empty', async ({
  page,
}) => {
  const options = { fail: true, delay: 300 }
  await setup(page, options)
  await page.goto('/')
  await login(page)
  await expect(
    page.getByText('No places here yet', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByText(
      'Your places could not be loaded. Use Refresh places to try again.',
    ),
  ).toBeVisible()
  options.fail = false
  options.delay = 0
  await page.getByRole('button', { name: 'Refresh places' }).click()
  await expect(page.locator('.place-card')).toHaveCount(3)
})
test('cloud entry accepts Instagram links and never resolves sample names as real places', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await login(page)
  await page
    .getByRole('button', { name: 'Save a place', exact: true })
    .filter({ visible: true })
    .first()
    .click()
  const field = page.getByLabel('Instagram post link', { exact: true })
  await field.fill('Maru Coffee')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('dialog')).toContainText(
    'Use Place search to add a place by name or address',
  )
  await expect(page.locator('.resolved-place')).toHaveCount(0)
})
