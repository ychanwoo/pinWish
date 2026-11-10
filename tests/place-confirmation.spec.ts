import { test, expect, type Page } from '@playwright/test'
// Synthetic API fixtures test interaction contracts; real AWS checks are recorded separately.
const sourceUrl = 'https://www.instagram.com/p/Example/?img_index=2'
const report = { fetchedImages: 2, result: { places: [{ name: '그리피스 천문대', regionHint: 'Los Angeles', slides: [2], evidence: '그리피스 천문대', needsLocationConfirmation: true }], ignoredSlides: [1] } }
const a = { provider: 'amazon-location', placeId: 'A', name: 'Griffith Observatory', address: '2800 E Observatory Ave, Los Angeles', countryCode: 'US', countryName: 'United States', coordinates: { longitude: -118.30039, latitude: 34.11838 }, placeType: 'PointOfInterest', englishName: 'Griffith Observatory', koreanName: null, selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
const b = { ...a, placeId: 'B', name: 'Museum Annex', englishName: 'Museum Annex', address: '2 Example Street', selectionToken: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }
const results = (matches = [a]) => ({ matches, excludedResults: 0, unsupportedCountries: [], attribution: 'Amazon Location Service' })
const details = (place = a) => ({ place: { ...place, retrievedAt: '2026-11-10T00:00:00Z' } })
async function openImport(page: Page) {
  await page.route('**/api/instagram/preview', route => route.fulfill({ json: report }))
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(sourceUrl)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await page.getByText('Find and confirm locations · 0 confirmed', { exact: true }).click()
  return page.getByRole('region', { name: 'Candidate 1, location 1', exact: true })
}
async function mockPlaces(page: Page) {
  await page.route('**/api/places/search', route => route.fulfill({ json: results(route.request().postDataJSON().query === 'Annex' ? [b] : [a]) }))
  await page.route('**/api/places/details', route => route.fulfill({ json: details(route.request().postDataJSON().selectionToken === b.selectionToken ? b : a) }))
}
test('explicit confirmation uses provider English name, preserves source, and survives closing the draft', async ({ page }) => {
  await mockPlaces(page)
  const target = await openImport(page)
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('button', { name: 'Confirm this location' })).toHaveCount(0)
  await target.getByRole('button', { name: 'Select Griffith Observatory', exact: true }).click()
  await expect(target).toContainText('34.11838, -118.30039')
  await expect(page.getByRole('button', { name: 'Location confirmation pending' })).toBeDisabled()
  await target.getByRole('button', { name: 'Confirm this location' }).click()
  await expect(target).toContainText('Location confirmed for this session')
  await expect(page.getByRole('listitem', { name: 'Place candidate 1', exact: true })).toContainText('Read from photo: 그리피스 천문대')
  await page.getByRole('button', { name: 'Done reviewing' }).click()
  await page.getByRole('button', { name: 'Add pin', exact: true }).click()
  await page.getByText('Find and confirm locations · 1 confirmed', { exact: true }).click()
  await expect(page.getByRole('region', { name: 'Candidate 1, location 1', exact: true })).toContainText('Griffith Observatory')
  await expect(page.getByRole('link', { name: 'Review photo 2', exact: true })).toHaveAttribute('href', sourceUrl)
  await expect(page.getByRole('button', { name: 'Done reviewing' })).toBeEnabled()
})
test('search/detail failures can be retried and ambiguity requires selection', async ({ page }) => {
  let searches = 0, lookups = 0
  await page.route('**/api/places/search', route => ++searches === 1
    ? route.fulfill({ status: 503, json: { code: 'places_access_denied' } }) : route.fulfill({ json: results([a,b]) }))
  await page.route('**/api/places/details', route => ++lookups === 1
    ? route.fulfill({ status: 429, json: { code: 'places_throttled' } }) : route.fulfill({ json: details(b) }))
  const target = await openImport(page)
  await target.getByLabel('Search place name', { exact: true }).fill('Museum')
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('AWS credentials')
  await expect(target.getByLabel('Search place name', { exact: true })).toHaveValue('Museum')
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('button', { name: /^Select / })).toHaveCount(2)
  await expect(target.getByRole('button', { name: 'Confirm this location' })).toHaveCount(0)
  await target.getByRole('button', { name: 'Select Museum Annex', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('limited requests')
  await target.getByRole('button', { name: 'Select Museum Annex', exact: true }).click()
  await target.getByRole('button', { name: 'Confirm this location' }).click()
  await expect(target).toContainText('Museum Annex')
})
test('editing a query aborts old results and Enter never re-imports the post', async ({ page }) => {
  let release!: () => void
  let arrived!: () => void
  const waiting = new Promise<void>(r => { arrived = r })
  const gate = new Promise<void>(r => { release = r })
  await page.route('**/api/places/search', async route => {
    if (route.request().postDataJSON().query === 'Old') { arrived(); await gate; await route.fulfill({ json: results([a]) }).catch(() => {}) }
    else await route.fulfill({ json: results([b]) })
  })
  let imports = 0
  page.on('request', r => { if (r.url().endsWith('/api/instagram/preview')) imports++ })
  const target = await openImport(page)
  await target.getByLabel('Search place name', { exact: true }).fill('Old')
  await target.getByLabel('Search place name', { exact: true }).press('Enter')
  await waiting
  await target.getByLabel('Search place name', { exact: true }).fill('New')
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('button', { name: 'Select Museum Annex', exact: true })).toBeVisible()
  release()
  await expect(target.getByRole('button', { name: 'Select Griffith Observatory', exact: true })).toHaveCount(0)
  expect(imports).toBe(1)
})
test('mobile compound candidates support multiple locations, duplicate protection, and skipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 884 })
  await mockPlaces(page)
  const first = await openImport(page)
  await first.getByRole('button', { name: 'Search locations', exact: true }).click()
  await first.getByRole('button', { name: 'Select Griffith Observatory', exact: true }).click()
  await first.getByRole('button', { name: 'Confirm this location' }).click()
  await page.getByRole('button', { name: 'Add another location from this photo' }).click()
  const second = page.getByRole('region', { name: 'Candidate 1, location 2', exact: true })
  await second.getByLabel('Search place name', { exact: true }).fill('Same museum')
  await second.getByRole('button', { name: 'Search locations', exact: true }).click()
  await second.getByRole('button', { name: 'Select Griffith Observatory', exact: true }).click()
  await expect(second.getByRole('button', { name: 'Confirm this location' })).toBeDisabled()
  await second.getByLabel('Search place name', { exact: true }).fill('Annex')
  await second.getByRole('button', { name: 'Search locations', exact: true }).click()
  await second.getByRole('button', { name: 'Select Museum Annex', exact: true }).click()
  await second.getByRole('button', { name: 'Confirm this location' }).click()
  await page.getByRole('button', { name: 'Add another location from this photo' }).click()
  const third = page.getByRole('region', { name: 'Candidate 1, location 3', exact: true })
  await third.getByRole('button', { name: 'Skip location' }).click()
  await expect(page.getByRole('button', { name: 'Done reviewing' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await third.getByRole('button', { name: 'Review again' }).click()
  await expect(page.getByRole('button', { name: 'Location confirmation pending' })).toBeDisabled()
  await expect(first).toContainText('Location confirmed')
  await expect(second).toContainText('Location confirmed')
})
test('unsupported Korean coverage and empty results are distinct; neither auto-confirms', async ({ page }) => {
  await page.route('**/api/places/search', route => route.request().postDataJSON().countryCode === 'KR'
    ? route.fulfill({ status: 422, json: { code: 'unsupported_country' } }) : route.fulfill({ json: results([]) }))
  const target = await openImport(page)
  await target.getByLabel('Country filter').selectOption('KR')
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('does not support detailed places in South Korea')
  await target.getByLabel('Country filter').selectOption('US')
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await expect(target.getByRole('status')).toContainText('No matching detailed places')
  await expect(target.getByRole('button', { name: 'Confirm this location' })).toHaveCount(0)
})
test('expired selections and invalid details never confirm a location', async ({ page }) => {
  await page.route('**/api/places/search', route => route.fulfill({ json: results() }))
  let count = 0
  await page.route('**/api/places/details', route => ++count === 1 ? route.fulfill({ status:409, json:{code:'selection_expired'} }) : route.fulfill({ json:details({ ...a, coordinates: { longitude:999, latitude:34 } }) }))
  const target = await openImport(page)
  await target.getByRole('button', { name: 'Search locations', exact: true }).click()
  await target.getByRole('button', { name: 'Select Griffith Observatory', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('expired')
  await target.getByRole('button', { name: 'Select Griffith Observatory', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('could not be verified')
  await expect(target.getByRole('button', { name: 'Confirm this location' })).toHaveCount(0)
})

test('automatic English query is disclosed while original source stays unchanged through confirmation', async ({ page }) => {
 await mockPlaces(page)
 await page.route('**/api/places/search', route => {
   expect(route.request().postDataJSON().query).toBe('그리피스 천문대')
   return route.fulfill({json:{...results(),queryConversion:{originalQuery:'그리피스 천문대',searchQuery:'Griffith Observatory',searchRegion:'Los Angeles',status:'translated'}}})
 })
 const target=await openImport(page)
 await target.getByRole('button',{name:'Search locations',exact:true}).click()
 await expect(target.locator('.query-conversion')).toContainText('English search: Griffith Observatory')
 await expect(target.getByLabel('Search place name',{exact:true})).toHaveValue('그리피스 천문대')
 await target.getByRole('button',{name:'Select Griffith Observatory',exact:true}).click()
 await target.getByRole('button',{name:'Confirm this location'}).click()
 await expect(target).toContainText('Griffith Observatory')
 await expect(page.getByRole('listitem',{name:'Place candidate 1',exact:true})).toContainText('Read from photo: 그리피스 천문대')
})
test('translation outage gives explicit editable fallback rather than invented English',async({page})=>{
 await page.route('**/api/places/search',r=>r.fulfill({json:{...results([]),queryConversion:{originalQuery:'그리피스 천문대',searchQuery:'그리피스 천문대',searchRegion:'Los Angeles',status:'unavailable'}}}))
 const target=await openImport(page)
 await target.getByRole('button',{name:'Search locations',exact:true}).click()
 await expect(target.locator('.query-conversion')).toContainText('Searched your original text')
 await expect(target.getByLabel('Search place name',{exact:true})).toHaveValue('그리피스 천문대')
 await expect(target.getByRole('button',{name:'Confirm this location'})).toHaveCount(0)
})
