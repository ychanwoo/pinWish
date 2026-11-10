import { test, expect } from '@playwright/test'
// Fixture API responses test UI behavior only, never the actual accuracy of extraction.
const url = 'https://www.instagram.com/p/DfFCMjzk02S/?img_index=1'
const report = { fetchedImages: 2, result: { places: [{ name: 'Example Museum', regionHint: 'LA', slides: [2], evidence: 'Example Museum', needsLocationConfirmation: true }], ignoredSlides: [1] } }
test('shows candidates without saving, preserves them on reopen, and allows editing source', async ({ page }) => {
  await page.route('**/api/instagram/preview', route => route.fulfill({ json: { ...report, result: {
    ...report.result, places: [{ ...report.result.places[0], correctedName: 'Untrusted correction',
      confirmedLocation: { countryCode: 'US', englishName: 'Unverified English name' } }],
  } } }))
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('Example Museum')
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).not.toContainText('Untrusted correction')
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).not.toContainText('Unverified English name')
  await expect(page.getByRole('button', { name: 'Location confirmation pending' })).toBeDisabled()
  await expect(page.locator('.resolved-place')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Review photo 2', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/p/DfFCMjzk02S/?img_index=2')
  await page.getByRole('button', { name: 'Edit candidate 1 name' }).click()
  await page.getByLabel('Place name', { exact: true }).fill('한글 장소 수정')
  await page.getByRole('button', { name: 'Keep name correction' }).click()
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('Name edited by you')
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('Read from photo: Example Museum')
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('Originally extracted name: Example Museum')
  await page.getByRole('button', { name: 'Close save dialog' }).click()
  await page.getByRole('button', { name: 'Add pin', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('한글 장소 수정')
  await page.getByRole('button', { name: 'Edit original link' }).click()
  await expect(page.getByLabel('Link or address', { exact: true })).toBeEditable()
})

test('mobile review handles long Korean names, empty extraction and unverified slides', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.route('**/api/instagram/preview', route => route.fulfill({ json: {
    fetchedImages: 2, result: { places: [], ignoredSlides: [1,2] },
  } }))
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('This does not mean the post contains no places')
  await expect(page.getByRole('button', { name: 'Location confirmation pending' })).toBeDisabled()
  await page.getByRole('button', { name: 'Edit original link' }).click()
  await page.unroute('**/api/instagram/preview')
  await page.route('**/api/instagram/preview', route => route.fulfill({ json: { ...report, result: { ...report.result,
    places: [{ ...report.result.places[0], name: '도째비골 스카이밸리&해랑전망대' }],
  } } }))
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await page.getByRole('button', { name: 'Edit candidate 1 name' }).click()
  await page.getByLabel('Place name', { exact: true }).fill('')
  await expect(page.getByRole('button', { name: 'Keep name correction' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel correction' }).click()
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toContainText('도째비골 스카이밸리&해랑전망대')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('distinguishes unsupported video from no location and preserves source', async ({ page }) => {
  await page.route('**/api/instagram/preview', route => route.fulfill({ status: 502, json: { code: 'unsupported_video_slide' } }))
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('includes video')
  await expect(page.getByLabel('Link or address', { exact: true })).toHaveValue(url)
})
test('rejects malformed successful responses without showing candidates', async ({ page }) => {
  await page.route('**/api/instagram/preview', route => route.fulfill({ json: { result: { places: [{}] } } }))
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not be verified')
  await expect(page.getByRole('region', { name: 'Extracted place candidates' })).toHaveCount(0)
})
