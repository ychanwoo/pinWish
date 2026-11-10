import { test, expect, type Page } from '@playwright/test'
const records = [
  {
    id: 'a'.repeat(64),
    displayName: 'Museum',
    coordinates: { longitude: -118.3, latitude: 34.1 },
  },
  {
    id: 'b'.repeat(64),
    displayName: 'Pier',
    coordinates: { longitude: -118.5, latitude: 34 },
  },
].map((r) => ({
  ...r,
  provider: 'amazon-location',
  placeId: r.id,
  name: r.displayName,
  address: 'Los Angeles, CA',
  countryCode: 'US',
  countryName: 'United States',
  placeType: 'PointOfInterest',
  note: '',
  collection: 'LA weekend',
  visited: false,
  bookmarked: true,
  version: 1,
  sources: {},
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
}))
async function setup(page: Page, failMap = false) {
  await page.route('https://maps.geo.us-east-1.amazonaws.com/**', (route) =>
    route.fulfill(
      failMap
        ? { status: 403, body: '{}' }
        : {
            json: {
              version: 8,
              glyphs: 'https://fonts.example.test/{fontstack}/{range}.pbf',
              sources: {},
              layers: [
                {
                  id: 'background',
                  type: 'background',
                  paint: { 'background-color': '#e4ece4' },
                },
              ],
            },
          },
    ),
  )
  await page.route('https://fonts.example.test/**', (route) =>
    route.fulfill({ body: Buffer.alloc(0) }),
  )
  await page.route(
    'https://cognito-idp.us-east-1.amazonaws.com/**',
    (route) =>
      route.fulfill({
        json: {
          AuthenticationResult: {
            AccessToken: `x.${Buffer.from(JSON.stringify({ sub: 'map-user' })).toString('base64url')}.y`,
            RefreshToken: 'refresh',
            ExpiresIn: 300,
          },
        },
      }),
  )
  await page.route('https://storage.example.test/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('cursor=')
        ? { items: [records[1]], cursor: null }
        : { items: [records[0]], cursor: 'page2' },
    }),
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  await page.getByLabel('Email', { exact: true }).fill('map@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Password123!')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test('all pages reach the map; selection switches detail, filters and logout clear private pins', async ({
  page,
}) => {
  await setup(page)
  const picker = page.getByLabel('Select a saved place on the map')
  await expect(picker.locator('option')).toHaveCount(3)
  await expect(
    page.getByRole('button', { name: 'Show all', exact: true }),
  ).toBeEnabled()
  const canvas = page.locator('.live-map canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box!.height).toBeGreaterThan(300)
  expect(box!.width).toBeGreaterThan(200)
  await picker.selectOption(records[0].id)
  await expect(page.locator('#place-heading')).toHaveText('Museum')
  await picker.selectOption(records[1].id)
  await expect(page.locator('#place-heading')).toHaveText('Pier')
  await page
    .getByRole('button', { name: 'Close place details', exact: true })
    .filter({ visible: true })
    .click()
  // Allow the layout resize and worker-rendered points to settle after closing the dossier.
  await page.waitForTimeout(200)
  const centeredCanvas = page.locator('.live-map canvas')
  const centeredBox = await centeredCanvas.boundingBox()
  await centeredCanvas.click({
    position: { x: centeredBox!.width / 2, y: centeredBox!.height / 2 },
  })
  await expect(page.locator('#place-heading')).toHaveText('Pier')
  await page
    .getByRole('button', { name: 'Close place details', exact: true })
    .filter({ visible: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Search places', exact: true })
    .fill('Museum')
  await expect(picker.locator('option')).toHaveCount(2)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(picker.locator('option')).toHaveCount(1)
  await expect(page.locator('.place-card')).toHaveCount(0)
})
test('map failure offers retry and preserves the list', async ({
  page,
}) => {
  await setup(page, true)
  await expect(
    page.getByRole('button', { name: 'Retry map' }),
  ).toBeVisible()
  await expect(page.locator('.place-card')).toHaveCount(2)
  await page.unroute('https://maps.geo.us-east-1.amazonaws.com/**')
  await page.route('https://maps.geo.us-east-1.amazonaws.com/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        glyphs: 'https://fonts.example.test/{fontstack}/{range}.pbf',
        sources: {},
        layers: [],
      },
    }),
  )
  await page.getByRole('button', { name: 'Retry map' }).click()
  await expect(
    page.getByRole('button', { name: 'Show all', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Retry map' })).toHaveCount(
    0,
  )
})
test('mobile map and detail work without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page
    .getByRole('button', { name: /Map/ })
    .filter({ visible: true })
    .first()
    .click()
  const picker = page.getByLabel('Select a saved place on the map')
  await expect(picker).toBeVisible()
  await picker.selectOption(records[0].id)
  await expect(page.locator('#place-heading')).toHaveText('Museum')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
