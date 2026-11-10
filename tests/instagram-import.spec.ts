import { test, expect } from '@playwright/test'
// Fixture API responses test UI behavior only, never the actual accuracy of extraction.
const url = 'https://www.instagram.com/p/DfFCMjzk02S/?img_index=1'
const report = {
  fetchedImages: 2,
  result: {
    places: [
      {
        name: 'Example Museum',
        regionHint: 'LA',
        slides: [2],
        evidence: 'Example Museum',
        needsLocationConfirmation: true,
      },
    ],
    ignoredSlides: [1],
  },
}
test('preserves source without accepting untrusted display metadata', async ({
  page,
}) => {
  await page.route('**/api/places/search', (r) =>
    r.fulfill({
      json: {
        matches: [],
        excludedResults: 0,
        unsupportedCountries: [],
        attribution: 'AWS',
      },
    }),
  )
  await page.route('**/api/instagram/preview', (r) =>
    r.fulfill({
      json: {
        ...report,
        result: {
          ...report.result,
          places: [
            {
              ...report.result.places[0],
              correctedName: 'Untrusted correction',
              confirmedLocation: {
                countryCode: 'US',
                englishName: 'Unverified English name',
              },
            },
          ],
        },
      },
    }),
  )
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page
    .getByRole('button', { name: 'Find place', exact: true })
    .click()
  const region = page.getByRole('region', {
    name: 'Extracted place candidates',
  })
  await expect(region).toContainText('Example Museum')
  await expect(region).not.toContainText('Untrusted correction')
  await expect(region).not.toContainText('Unverified English name')
  await expect(
    region.getByRole('link', { name: 'View original photo' }),
  ).toHaveAttribute(
    'href',
    'https://www.instagram.com/p/DfFCMjzk02S/?img_index=2',
  )
  await page.getByRole('button', { name: 'Edit original link' }).click()
  await expect(
    page.getByLabel('Link or address', { exact: true }),
  ).toHaveValue(url)
})
test('empty extraction is explained and never added', async ({ page }) => {
  await page.route('**/api/instagram/preview', (r) =>
    r.fulfill({
      json: {
        fetchedImages: 2,
        result: { places: [], ignoredSlides: [1, 2] },
      },
    }),
  )
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page
    .getByRole('button', { name: 'Find place', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Extracted place candidates' }),
  ).toContainText('No readable place names')
  await expect(
    page.getByRole('button', { name: 'Add to map' }),
  ).toBeDisabled()
})
test('distinguishes unsupported video from no location and preserves source', async ({
  page,
}) => {
  await page.route('**/api/instagram/preview', (route) =>
    route.fulfill({
      status: 502,
      json: { code: 'unsupported_video_slide' },
    }),
  )
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page
    .getByRole('button', { name: 'Find place', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('includes video')
  await expect(
    page.getByLabel('Link or address', { exact: true }),
  ).toHaveValue(url)
})
test('rejects malformed successful responses without showing candidates', async ({
  page,
}) => {
  await page.route('**/api/instagram/preview', (route) =>
    route.fulfill({ json: { result: { places: [{}] } } }),
  )
  await page.goto('/?state=entry')
  await page.getByLabel('Link or address', { exact: true }).fill(url)
  await page
    .getByRole('button', { name: 'Find place', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'could not be verified',
  )
  await expect(
    page.getByRole('region', { name: 'Extracted place candidates' }),
  ).toHaveCount(0)
})
