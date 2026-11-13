import { collectionResponse } from './helpers/collection-fixture'
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
  collection: 'Saved places',
  collectionId: 'default',
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
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (route) =>
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
  const saved = records.map((p) => ({ ...p }))
  let preferences = { colors: {} as Record<string, string>, version: 0 }
  await page.route('https://storage.example.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/collections')
      return route.fulfill({ json: collectionResponse })
    if (path === '/map-preferences') {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON()
        const colors = { ...preferences.colors }
        if (body.color === null) delete colors[body.collectionId]
        else colors[body.collectionId] = body.color
        preferences = { colors, version: preferences.version + 1 }
      }
      return route.fulfill({ json: preferences })
    }
    const place = saved.find((p) => path.includes(p.id))
    if (path.endsWith('/details'))
      return route.fulfill({
        json: {
          region: {
            key: 'c'.repeat(64),
            label: 'Los Angeles',
            context: 'California, US',
            level: 'city',
          },
          hours: {
            status: 'available',
            display: ['Daily: 09:00–18:00'],
            windows: Array.from({ length: 7 }, (_, day) => ({
              day,
              start: 540,
              end: 1080,
            })),
          },
          zone: 'America/Los_Angeles',
          checkedAt: new Date().toISOString(),
          stale: false,
        },
      })
    if (place && route.request().method() === 'PATCH') {
      Object.assign(place, route.request().postDataJSON(), {
        version: place.version + 1,
      })
      return route.fulfill({ json: { item: place } })
    }
    return route.fulfill({
      json: route.request().url().includes('cursor=')
        ? { items: [saved[1]], cursor: null, collectionVersion: 1 }
        : { items: [saved[0]], cursor: 'page2', collectionVersion: 1 },
    })
  })
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
test('map failure offers retry and preserves the list', async ({ page }) => {
  await setup(page, true)
  await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Retry map' })).toHaveCount(0)
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

test('anonymous shared places render real map layers and selection without private records', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('https://maps.geo.us-east-1.amazonaws.com/**', (route) =>
    route.fulfill({
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
    }),
  )
  await page.route('https://fonts.example.test/**', (route) =>
    route.fulfill({ body: Buffer.alloc(0) }),
  )
  let revoked = false
  await page.route('https://storage.example.test/**', (route) => {
    expect(route.request().headers().authorization).toBeUndefined()
    expect(new URL(route.request().url()).pathname).toContain('/shared/')
    return revoked
      ? route.fulfill({ status: 404, json: { code: 'share_unavailable' } })
      : route.fulfill({
          json: {
            name: 'Places to explore',
            items: records.map((p) => ({
              id: p.id,
              name: p.name,
              address: p.address,
              countryName: p.countryName,
              coordinates: p.coordinates,
              hasPhoto: false,
            })),
            cursor: null,
          },
        })
  })
  await page.goto('/#share=' + 'a'.repeat(64))
  await expect(
    page.getByRole('button', { name: 'Show all', exact: true }),
  ).toBeEnabled()
  const picker = page.getByLabel('Select a saved place on the map')
  await expect(picker.locator('option')).toHaveCount(3)
  await picker.selectOption(records[0].id)
  await expect(page.locator('#shared-place-title')).toHaveText('Museum')
  await picker.selectOption(records[1].id)
  await expect(page.locator('#shared-place-title')).toHaveText('Pier')
  const bounds = await page.locator('.live-map canvas').boundingBox()
  expect(bounds!.width).toBeGreaterThan(200)
  await page.screenshot({ path: '/tmp/pinwish-shared-map-desktop.png' })
  await page.getByRole('button', { name: 'Close place details' }).click()
  revoked = true
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(
    page.getByRole('heading', { name: 'This link is unavailable' }),
  ).toBeVisible()
  await expect(page.locator('.live-map canvas')).toHaveCount(0)
})

for (const mobile of [false, true])
  test(`collection colors persist, visited pins and opening hours stay synchronized ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    if (mobile)
      await page.getByRole('button', { name: 'Map', exact: true }).click()
    const toggle = page.getByRole('button', { name: 'Map colors', exact: true })
    await toggle.click()
    const green = page.getByRole('button', {
      name: 'Pine for Saved places',
      exact: true,
    })
    await expect(green).toBeEnabled()
    await green.click()
    await expect(green).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.locator('.collection-row .collection-color-icon').first(),
    ).toHaveAttribute('stroke', '#426b57')
    await page.screenshot({
      path: `/tmp/pinwish-map-colors-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await page.reload()
    if (mobile)
      await page.getByRole('button', { name: 'Map', exact: true }).click()
    await toggle.click()
    await expect(green).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Reset', exact: true }),
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Close map colors' }).click()
    await page
      .getByLabel('Select a saved place on the map')
      .selectOption(records[0].id)
    await expect(page.getByText(/based on listed hours/)).toBeVisible()
    await page.getByText('Weekly hours', { exact: true }).click()
    await expect(
      page.getByText('Daily: 09:00–18:00', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Unvisited', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Visited', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page
        .getByLabel('Select a saved place on the map')
        .locator('option:checked'),
    ).toHaveText('✓ Museum · Visited')
    if (!mobile)
      await page.screenshot({ path: '/tmp/pinwish-map-visited-desktop.png' })
  })

test('a failed collection color save retains the existing color and can be retried', async ({
  page,
}) => {
  await setup(page)
  await page.getByRole('button', { name: 'Map colors', exact: true }).click()
  const green = page.getByRole('button', {
    name: 'Pine for Saved places',
    exact: true,
  })
  await expect(green).toBeEnabled()
  let fail = true
  await page.route('https://storage.example.test/map-preferences', (route) => {
    if (fail && route.request().method() === 'PATCH') {
      fail = false
      return route.fulfill({ status: 503, json: { code: 'unavailable' } })
    }
    return route.fallback()
  })
  await green.click()
  await expect(page.locator('.map-color-panel [role=alert]')).toBeVisible()
  await expect(green).toHaveAttribute('aria-pressed', 'false')
  await green.click()
  await expect(green).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.map-color-panel [role=alert]')).toHaveCount(0)
})

test('hovering a pin shows only its name and dismisses on Escape or pointer exit', async ({
  page,
}) => {
  await setup(page)
  await page
    .getByLabel('Select a saved place on the map')
    .selectOption(records[1].id)
  await page
    .getByRole('button', { name: 'Close place details', exact: true })
    .filter({ visible: true })
    .click()
  const canvas = page.locator('.live-map canvas')
  await expect(async () => {
    const box = await canvas.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(page.locator('.place-hover-label')).toHaveText('Pier')
  }).toPass()
  await page.keyboard.press('Escape')
  await expect(page.locator('.place-hover-label')).toHaveCount(0)
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2 + 1, box!.y + box!.height / 2)
  await expect(page.locator('.place-hover-label')).toHaveText('Pier')
  await page.mouse.move(0, 0)
  await expect(page.locator('.place-hover-label')).toHaveCount(0)
})

test('unrelated sidebar changes do not rebuild map source data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage
    ;(window as unknown as { mapDataUpdates: number }).mapDataUpdates = 0
    Worker.prototype.postMessage = function (
      ...args: Parameters<Worker['postMessage']>
    ) {
      if (args[0]?.type === 'LD')
        (window as unknown as { mapDataUpdates: number }).mapDataUpdates++
      return Reflect.apply(send, this, args)
    }
  })
  await setup(page)
  await expect(page.locator('.live-map canvas')).toBeVisible()
  await expect(
    page.getByLabel('Select a saved place on the map').locator('option'),
  ).toHaveCount(3)
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    ;(window as unknown as { mapDataUpdates: number }).mapDataUpdates = 0
  })
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole('button', {
        name: i % 2 ? 'Show collections' : 'Hide collections',
        exact: true,
      })
      .click()
    await page.waitForTimeout(150)
  }
  const updates = await page.evaluate(
    () => (window as unknown as { mapDataUpdates: number }).mapDataUpdates,
  )
  console.log('MAP_SIDEBAR_DATA_UPDATES=' + updates)
  if (process.env.PINWISH_RECORD_BASELINE !== '1') expect(updates).toBe(0)
})
