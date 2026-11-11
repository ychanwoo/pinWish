import { test, expect, type Page } from '@playwright/test'
const sourceUrl = 'https://www.instagram.com/p/Example/?img_index=2'
const candidate = {
  name: '그리피스 천문대',
  regionHint: 'Los Angeles',
  locationHint: '2800 E Observatory Rd, Los Angeles, CA 90027',
  slides: [2],
  evidence: '그리피스 천문대',
  needsLocationConfirmation: true,
}
const report = {
  fetchedImages: 2,
  result: { places: [candidate], ignoredSlides: [1] },
}
const a = {
  provider: 'amazon-location',
  placeId: 'A',
  name: 'Griffith Observatory',
  address: '2800 E Observatory Ave, Los Angeles',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118.30039, latitude: 34.11838 },
  placeType: 'PointOfInterest',
  englishName: 'Griffith Observatory',
  koreanName: null,
  selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
}
const results = (matches = [a]) => ({
  queryConversion: {
    originalQuery: candidate.name,
    searchQuery: 'Griffith Observatory',
    searchRegion: 'Los Angeles',
    status: 'translated',
  },
  matches,
  excludedResults: 0,
  unsupportedCountries: [],
  attribution: 'Amazon Location Service',
})
async function openImport(page: Page, data = report) {
  await page.route('**/api/instagram/preview', (r) =>
    r.fulfill({ json: data }),
  )
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(sourceUrl)
  await page
    .getByRole('button', { name: 'Find place', exact: true })
    .click()
  return page.getByRole('region', { name: 'Extracted place candidates' })
}
test('automatically resolves Korean overseas names to English without per-place confirmation', async ({
  page,
}) => {
  let query = ''
  let searchRegion = ''
  await page.route('**/api/places/search', (r) => {
    query = r.request().postDataJSON().query
    searchRegion = r.request().postDataJSON().region
    return r.fulfill({ json: results() })
  })
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: { place: { ...a, retrievedAt: new Date().toISOString() } },
    }),
  )
  const region = await openImport(page)
  await expect(region).toContainText(a.address)
  await expect(region).toContainText('Griffith Observatory')
  expect(query).toBe(candidate.name)
  expect(searchRegion).toBe(candidate.locationHint)
  expect(await region.innerText()).not.toMatch(/\p{Script=Hangul}/u)
  await expect(
    page.getByRole('button', { name: 'Confirm this location' }),
  ).toHaveCount(0)
  await expect(
    region.getByRole('link', { name: 'View original photo' }),
  ).toHaveAttribute('href', sourceUrl)
  await expect(region.getByRole('link')).toContainText('↗')
})
test('failed searches are retryable without re-importing or manual confirmation', async ({
  page,
}) => {
  let searches = 0
  await page.route('**/api/places/search', (r) =>
    ++searches === 1
      ? r.fulfill({ status: 503, json: { code: 'places_access_denied' } })
      : r.fulfill({ json: results() }),
  )
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: { place: { ...a, retrievedAt: new Date().toISOString() } },
    }),
  )
  const region = await openImport(page)
  await expect(region).toContainText('The server cannot access place search.')
  await region.getByRole('button', { name: 'Retry missing places' }).click()
  await expect(region).toContainText(a.address)
})
test('closing lookup cancels stale results and reopening resumes the draft', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  let called!: () => void
  const arrival = new Promise<void>((r) => {
    called = r
  })
  await page.route('**/api/places/search', async (r) => {
    called()
    await gate
    await r.fulfill({ json: results() }).catch(() => {})
  })
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: { place: { ...a, retrievedAt: new Date().toISOString() } },
    }),
  )
  await openImport(page)
  await arrival
  await page.getByRole('button', { name: 'Close save dialog' }).click()
  release()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Extracted place candidates' }),
  ).toContainText(a.address)
})
test('missing places do not block other automatically resolved locations', async ({
  page,
}) => {
  await page.route('**/api/places/search', (r) =>
    r.fulfill({
      json: r.request().postDataJSON().query === 'Unknown'
        ? { ...results([]), queryConversion: { originalQuery: 'Unknown', searchQuery: 'Unknown', searchRegion: 'Los Angeles', status: 'unchanged' } }
        : results(),
    }),
  )
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: { place: { ...a, retrievedAt: new Date().toISOString() } },
    }),
  )
  const region = await openImport(page, {
    fetchedImages: 2,
    result: {
      places: [
        { ...candidate, slides: [1] },
        { ...candidate, name: 'Unknown', slides: [2] },
      ],
      ignoredSlides: [],
    },
  })
  await expect(region).toContainText('1 locations found · 1 not found')
  await expect(region).toContainText(a.address)
  await expect(region).toContainText('No location found')
})
test('mismatched details never become a pin', async ({ page }) => {
  await page.route('**/api/places/search', (r) =>
    r.fulfill({ json: results() }),
  )
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: {
        place: {
          ...a,
          placeId: 'wrong-id',
          retrievedAt: new Date().toISOString(),
        },
      },
    }),
  )
  const region = await openImport(page)
  await expect(region).toContainText('location changed')
  await expect(region).toContainText('0 locations found')
})
test('non-English overseas results remain unavailable rather than revealing Korean fallback text', async ({
  page,
}) => {
  await page.route('**/api/places/search', (r) =>
    r.fulfill({
      json: {
        ...results([{ ...a, name: candidate.name, englishName: null }]),
        queryConversion: undefined,
      },
    }),
  )
  await page.route('**/api/places/details', (r) =>
    r.fulfill({
      json: {
        place: {
          ...a,
          name: candidate.name,
          englishName: null,
          retrievedAt: new Date().toISOString(),
        },
      },
    }),
  )
  const region = await openImport(page)
  await expect(region).toContainText('place name could not be matched reliably')
  expect(await region.innerText()).not.toMatch(/\p{Script=Hangul}/u)
})
test('unsupported Korean coverage is explicit and mobile layout does not overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.route('**/api/places/search', (r) =>
    r.fulfill({ json: { ...results([]), unsupportedCountries: ['KR'] } }),
  )
  const region = await openImport(page)
  await expect(region).toContainText(
    'does not support detailed places in South Korea',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
test('unresolved OCR cannot silently save an address-only fallback as the venue', async ({ page }) => {
  let detailsCalls = 0
  await page.route('**/api/places/search', r => r.fulfill({ json: {
    ...results([{ ...a, name: 'Westward Beach Road', englishName: 'Westward Beach Road', placeType: 'Street' }]),
    queryConversion: { originalQuery: candidate.name, searchQuery: candidate.name, searchRegion: candidate.locationHint, status: 'needs_review' },
  } }))
  await page.route('**/api/places/details', r => { detailsCalls++; return r.fulfill({ json: {} }) })
  const region = await openImport(page)
  await expect(region).toContainText('place name could not be matched reliably')
  await expect(region).toContainText('0 locations found')
  expect(detailsCalls).toBe(0)
})
test('retries with venue and city when address search returns an unrelated tenant', async ({ page }) => {
  const requests: { query: string; region: string }[] = []
  await page.route('**/api/places/search', r => {
    requests.push(r.request().postDataJSON())
    return r.fulfill({ json: results(requests.length === 1 ? [{ ...a, name: 'Nearby Coffee', englishName: 'Nearby Coffee' }] : [a]) })
  })
  await page.route('**/api/places/details', r => r.fulfill({ json: { place: { ...a, retrievedAt: new Date().toISOString() } } }))
  const region = await openImport(page, { ...report, result: { ...report.result, places: [{ ...candidate, regionHint: '' }] } })
  await expect(region).toContainText(a.address)
  expect(requests).toHaveLength(2)
  expect(requests[0].region).toBe(candidate.locationHint)
  expect(requests[1]).toMatchObject({ query: 'Griffith Observatory', region: 'Los Angeles, CA' })
})
