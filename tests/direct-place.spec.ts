import { test, expect, type Page } from '@playwright/test'
import { collectionResponse } from './helpers/collection-fixture'
const token = '11111111-1111-4111-8111-111111111111'
const match = {
  provider: 'amazon-location',
  placeId: 'gamble',
  name: 'The Gamble House',
  englishName: 'The Gamble House',
  koreanName: null,
  address: '4 Westmoreland Pl, Pasadena, CA 91103',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118.1606, latitude: 34.1517 },
  placeType: 'PointOfInterest',
  selectionToken: token,
}
async function setup(
  page: Page,
  options: {
    empty?: boolean
    failSearch?: boolean
    failSave?: boolean
    slow?: boolean
    duplicate?: boolean
    expired?: boolean
    mismatch?: boolean
    failCollection?: boolean
  } = {},
) {
  let stored: any[] = [],
    saves = 0
  const collections = structuredClone(collectionResponse)
  collections.items.push({ ...collections.items[0], id: 'weekend', name: 'LA weekend', isDefault: false })
  const jobs = new Map<string, any>()
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) =>
    r.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: `x.${Buffer.from(JSON.stringify({ sub: 'direct-user' })).toString('base64url')}.y`,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  await page.route('https://processing.example.test/**', async (r) => {
    if (options.expired)
      return r.fulfill({ status: 401, json: { code: 'unauthorized' } })
    if (r.request().method() === 'POST') {
      const input = r.request().postDataJSON()
      jobs.set(input.id, input)
      return r.fulfill({ json: { id: input.id } })
    }
    const id = r.request().url().split('/').at(-1)!
    const job = jobs.get(id)
    if (options.slow) await new Promise((resolve) => setTimeout(resolve, 1200))
    if (options.failSearch && job.operation === 'search') {
      options.failSearch = false
      return r.fulfill({
        json: { id, status: 'failed', code: 'places_throttled' },
      })
    }
    return r.fulfill({
      json: {
        id,
        status: 'complete',
        result:
          job.operation === 'search'
            ? {
                queryConversion: {
                  originalQuery: job.payload.query,
                  searchQuery: 'The Gamble House',
                  searchRegion: job.payload.region,
                  status: 'translated',
                },
                matches: options.empty
                  ? []
                  : [
                      match,
                      {
                        ...match,
                        placeId: 'other',
                        address: 'Another address, Seattle, WA',
                        selectionToken: '22222222-2222-4222-8222-222222222222',
                      },
                    ],
                excludedResults: 0,
                unsupportedCountries: [],
                attribution:
                  'Search results provided by Amazon Location Service',
              }
            : {
                place: {
                  ...match,
                  placeId: options.mismatch ? 'changed-place' : match.placeId,
                  retrievedAt: new Date().toISOString(),
                },
              },
      },
    })
  })
  await page.route('https://storage.example.test/**', async (r) => {
    const path = new URL(r.request().url()).pathname
    if (path === '/collections') {
      if (r.request().method() === 'POST') {
        const body = r.request().postDataJSON()
        let item = collections.items.find(c => c.id === body.id)
        if (!item) {
          item = { ...collections.items[0], id: body.id, name: body.name, isDefault: false }
          collections.items.push(item)
        }
        if (options.failCollection) {
          options.failCollection = false
          return r.fulfill({ status: 503, json: { code: 'storage_unavailable' } })
        }
        return r.fulfill({ json: { item } })
      }
      return r.fulfill({ json: collections })
    }
    if (path.endsWith('/photo'))
      return r.fulfill({
        status: 503,
        json: { code: 'photos_unavailable' },
      })
    if (r.request().method() === 'POST') {
      saves++
      if (options.failSave) {
        options.failSave = false
        return r.fulfill({
          status: 503,
          json: { code: 'storage_unavailable' },
        })
      }
      const body = r.request().postDataJSON()
      expect(body.place).toBeUndefined()
      expect(jobs.get(body.directSearch.detailsJobId).operation).toBe('details')
      stored = [
        {
          ...match,
          displayName: match.name,
          id: 'a'.repeat(64),
          sources: {},
          searchOrigin: {
            query: body.directSearch.query,
            region: body.directSearch.region,
          },
          note: body.note,
          collection: collections.items.find(c => c.id === body.collectionId)!.name,
          collectionId: body.collectionId,
          visited: false,
          bookmarked: true,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
      return r.fulfill({
        json: { item: stored[0], duplicate: !!options.duplicate },
      })
    }
    return r.fulfill({
      json: { items: stored, cursor: null, collectionVersion: 1 },
    })
  })
  return { jobs, collections, saves: () => saves }
}
async function login(page: Page) {
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  await page.getByLabel('Email', { exact: true }).fill('direct@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Password123!')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function open(page: Page) {
  await page
    .getByRole('button', { name: /^(Add pin|Save a place)$/ })
    .filter({ visible: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Place search', exact: true }).click()
}
async function search(page: Page) {
  await page
    .getByLabel('Place name or address', { exact: true })
    .fill('갬블 하우스')
  await page.getByLabel('City or region', { exact: false }).fill('Pasadena')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
}
for (const mobile of [false, true])
  test(`direct search, choose, save and reload (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    const f = await setup(page)
    await page.goto('/')
    await login(page)
    await open(page)
    await expect(
      page.getByRole('button', { name: 'Add to map', exact: true }),
    ).toBeDisabled()
    await search(page)
    await expect(page.locator('.direct-result')).toHaveCount(2)
    await expect(
      page.getByRole('button', { name: 'Add to map', exact: true }),
    ).toBeDisabled()
    await page.screenshot({
      path: `/tmp/pinwish-direct-results-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await page.locator('.direct-result').first().click()
    await expect(
      page.getByRole('region', { name: 'Selected place' }),
    ).toBeVisible()
    await page
      .getByLabel('Personal note', { exact: false })
      .fill('See the woodwork.')
    await expect(page.getByLabel('Collection', { exact: true })).toHaveValue(
      'default',
    )
    await expect(page.locator('.direct-footer')).toBeInViewport({
      ratio: 1,
    })
    await expect(
      page.getByRole('button', { name: 'Close save dialog', exact: true }),
    ).toBeInViewport({ ratio: 1 })
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    await page.screenshot({
      path: `/tmp/pinwish-direct-selected-${mobile ? 'mobile' : 'desktop'}.png`,
    })
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
    await page
      .getByRole('button', { name: 'Add to map', exact: true })
      .dblclick()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('#place-heading')).toHaveText('The Gamble House')
    await expect(page.locator('.detail-panel')).toContainText(
      'Added from place search',
    )
    expect(f.saves()).toBe(1)
    await page.reload()
    await expect(page.locator('.place-card-title h2')).toHaveText([
      'The Gamble House',
    ])
    await page.locator('.place-card-title').click()
    await expect(page.locator('.personal-note')).toContainText(
      'See the woodwork.',
    )
  })
test('failed search and save retain input; retry and duplicate response are safe', async ({
  page,
}) => {
  const f = await setup(page, {
    failSearch: true,
    failSave: true,
    duplicate: true,
  })
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await expect(page.getByRole('alert')).toContainText('temporarily limited')
  await expect(
    page.getByLabel('Place name or address', { exact: true }),
  ).toHaveValue('갬블 하우스')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('.direct-result').first().click()
  await page
    .getByLabel('Personal note', { exact: false })
    .fill('Keep this note')
  await page.getByRole('button', { name: 'Add to map', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Saving is temporarily unavailable',
  )
  await expect(page.getByLabel('Personal note', { exact: false })).toHaveValue(
    'Keep this note',
  )
  await page.getByRole('button', { name: 'Add to map', exact: true }).click()
  await expect(page.locator('.notice-toast')).toContainText('Already saved')
  expect(f.saves()).toBe(2)
})
test('empty results and edited or cancelled searches never enable saving', async ({
  page,
}) => {
  await setup(page, { empty: true })
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await expect(page.getByText('No places found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('.loading-screen').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Add to map', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('.direct-result')).toHaveCount(0)
})
test('unauthenticated search prompts sign in and retains the search draft', async ({
  page,
}) => {
  const f = await setup(page)
  await page.goto('/')
  await open(page)
  await search(page)
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  expect(f.jobs.size).toBe(0)
  await page.getByLabel('Email', { exact: true }).fill('direct@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Password123!')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(
    page.getByLabel('Place name or address', { exact: true }),
  ).toHaveValue('갬블 하우스')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('.direct-result').first().click()
  await expect(page.getByLabel('Collection', { exact: true })).toHaveValue(
    'default',
  )
})
test('editing a running query discards late results and closing retains fields', async ({
  page,
}) => {
  await setup(page, { slow: true })
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await page
    .getByLabel('Place name or address', { exact: true })
    .fill('New query')
  await expect(page.locator('.direct-result')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Close save dialog', exact: true })
    .click()
  await open(page)
  await expect(
    page.getByLabel('Place name or address', { exact: true }),
  ).toHaveValue('New query')
  await expect(
    page.getByRole('button', { name: 'Add to map', exact: true }),
  ).toBeDisabled()
})

test('expired sessions offer sign-in without sending a save', async ({
  page,
}) => {
  const f = await setup(page, { expired: true })
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await expect(
    page.getByRole('button', { name: 'Sign in to continue', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Sign in to continue', exact: true })
    .click()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  expect(f.saves()).toBe(0)
})
test('changed place details cannot enable saving a different location', async ({
  page,
}) => {
  const f = await setup(page, { mismatch: true })
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await page.locator('.direct-result').first().click()
  await expect(page.getByRole('alert')).toContainText('could not be verified')
  await expect(
    page.getByRole('button', { name: 'Add to map', exact: true }),
  ).toBeDisabled()
  expect(f.saves()).toBe(0)
})

test('narrow mobile keeps actions visible and Escape preserves the note draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await setup(page)
  await page.goto('/')
  await login(page)
  await open(page)
  await search(page)
  await page.locator('.direct-result').first().click()
  await page
    .getByLabel('Personal note', { exact: false })
    .fill('Keep for next visit')
  await expect(page.locator('.direct-footer')).toBeInViewport({ ratio: 1 })
  await expect(
    page.getByRole('button', { name: 'Close save dialog', exact: true }),
  ).toBeInViewport({ ratio: 1 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Add to map', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Close save dialog', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await open(page)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('.direct-result').first().click()
  await expect(page.getByLabel('Personal note', { exact: false })).toHaveValue(
    'Keep for next visit',
  )
})

test('explicit sign-out clears the direct search draft', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await login(page)
  await open(page)
  await page.getByLabel('Place name or address', { exact: true }).fill('Private trip plan')
  await page.getByRole('button', { name: 'Close save dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await open(page)
  await expect(page.getByLabel('Place name or address', { exact: true })).toHaveValue('')
})

for (const mobile of [false, true]) test(`create collection during direct save retains selection and retries safely (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 })
  const f = await setup(page, { failCollection: true })
  await page.goto('/'); await login(page); await open(page); await search(page)
  await page.locator('.direct-result').first().click()
  await page.getByLabel('Collection', { exact: true }).selectOption('weekend')
  await expect(page.getByLabel('Collection', { exact: true })).toHaveValue('weekend')
  await page.getByLabel('Collection', { exact: true }).selectOption('__new__')
  await expect(page.getByRole('button', { name: 'Add to map', exact: true })).toBeDisabled()
  await page.getByLabel('New collection name', { exact: true }).fill('Campus visits')
  await page.getByLabel('Personal note', { exact: false }).fill('See the library')
  await page.screenshot({ path: `/tmp/pinwish-new-collection-${mobile ? 'mobile' : 'desktop'}.png` })
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('New collection name', { exact: true })).toHaveValue('Campus visits')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByLabel('New collection name', { exact: true })).toHaveCount(0)
  const created = f.collections.items.filter(c => c.name === 'Campus visits')
  expect(created).toHaveLength(1)
  await expect(page.getByLabel('Collection', { exact: true })).toHaveValue(created[0].id)
  await expect(page.getByLabel('Personal note', { exact: false })).toHaveValue('See the library')
  await page.getByRole('button', { name: 'Add to map', exact: true }).click()
  await expect(page.locator('.collection-tag')).toContainText('Campus visits')
  await page.reload()
  if (mobile) await page.locator('.collection-chips button').filter({ hasText: 'Campus visits' }).click()
  else await page.locator('.collection-link').filter({ hasText: 'Campus visits' }).click()
  await expect(page.locator('.place-card')).toHaveCount(1)
  await page.screenshot({ path: `/tmp/pinwish-refined-card-${mobile ? 'mobile' : 'desktop'}.png` })
  if (!mobile) {
    await page.getByRole('button', { name: 'Options for Campus visits', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit name', exact: true })).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeEnabled()
  }
})
