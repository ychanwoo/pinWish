import { collectionResponse } from './helpers/collection-fixture'
import { test, expect, type Page } from '@playwright/test'
import jpeg from 'jpeg-js'
const photoBytes = jpeg.encode(
  { width: 640, height: 480, data: Buffer.alloc(640 * 480 * 4, 190) },
  90,
).data
const record = {
  id: 'a'.repeat(64),
  provider: 'amazon-location',
  placeId: 'museum',
  name: 'Museum',
  displayName: 'Museum',
  address: '100 Museum Road',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118, latitude: 34 },
  placeType: 'PointOfInterest',
  note: '',
  collection: 'Saved places',
  collectionId: 'default',
  visited: false,
  bookmarked: true,
  version: 1,
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
  sources: {},
}
async function setup(
  page: Page,
  mode: 'ready' | 'pending' | 'not_found' | 'failure' = 'ready',
  openDetail = true,
) {
  let requests = 0,
    failing = mode === 'failure'
  const row = {
    ...record,
    version: 3,
    coverPhoto: {
      objectKey: 'photos/owner/a/photo.jpg',
      width: 640,
      height: 480,
      bytes: photoBytes.length,
      contentType: 'image/jpeg',
      updatedAt: new Date().toISOString(),
      author: 'Photo author',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Photo.jpg',
    },
  }
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) =>
    r.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: `header.${Buffer.from(JSON.stringify({ sub: 'photo-user' })).toString('base64url')}.signature`,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  await page.route('https://storage.example.test/**', (r) => {
    if(new URL(r.request().url()).pathname === '/collections') return r.fulfill({json: collectionResponse})
    if (new URL(r.request().url()).pathname.endsWith('/photo')) {
      expect(r.request().method()).toBe('GET')
      requests++
      if (failing)
        return r.fulfill({ status: 503, json: { code: 'photos_unavailable' } })
      if (mode === 'not_found')
        return r.fulfill({ json: { status: 'not_found', item: record } })
      if (mode === 'pending' && requests === 1)
        return r.fulfill({ json: { status: 'pending', item: record } })
      return r.fulfill({
        json: {
          status: 'ready',
          item: row,
          imageBase64: photoBytes.toString('base64'),
          contentType: 'image/jpeg',
          objectKey: row.coverPhoto.objectKey,
        },
      })
    }
    return r.fulfill({ json: { items: [record], cursor: null, collectionVersion: 1 } })
  })
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const auth = page.getByRole('dialog')
  await auth.getByLabel('Email', { exact: true }).fill('photo@example.com')
  await auth.getByLabel('Password', { exact: true }).fill('Password123!')
  await auth
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(auth).toHaveCount(0)
  if (openDetail) await page.locator('.place-card-title').first().click()
  return {
    recover() {
      failing = false
    },
    get requests() {
      return requests
    },
  }
}
test('automatically loads photo, shows attribution, enlarges and survives reload without upload UI', async ({
  page,
}) => {
  await setup(page, 'pending')
  const enlarge = page.getByRole('button', { name: 'Enlarge photo of Museum' })
  await expect(enlarge).toBeVisible({ timeout: 10000 })
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /upload|replace photo|remove photo/i }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Photo source' })).toBeVisible()
  await enlarge.click()
  await expect(
    page.getByRole('dialog', { name: 'Photo of Museum' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await page.locator('.place-card-title').first().click()
  await expect(enlarge).toBeVisible()
})
test('unavailable photo leaves saved place usable and can retry', async ({
  page,
}) => {
  const f = await setup(page, 'failure')
  await expect(
    page.getByText('Photo temporarily unavailable. Try again shortly.'),
  ).toBeVisible()
  await expect(page.locator('#place-heading')).toHaveText('Museum')
  f.recover()
  await page.getByRole('button', { name: 'Retry photo' }).click()
  await expect(
    page.getByRole('button', { name: 'Enlarge photo of Museum' }),
  ).toBeVisible()
})
test('no match does not ask the user to upload or loop requests', async ({
  page,
}) => {
  const f = await setup(page, 'not_found')
  await expect(
    page.getByText('Photo unavailable', { exact: true }),
  ).toBeVisible()
  expect(f.requests).toBe(1)
  await expect(page.locator('input[type=file]')).toHaveCount(0)
})
test('mobile automatic photo and attribution fit viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await expect(
    page.getByRole('button', { name: 'Enlarge photo of Museum' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('prefetch finishes before opening detail; repeated openings reuse the photo without network', async ({
  page,
}) => {
  const state = await setup(page, 'ready', false)
  await expect.poll(() => state.requests).toBe(1)
  // Wait for the prefetched response to be cached, then make the network unavailable.
  await page.waitForFunction(async () => {
    const photos = await import('/src/lib/place-photo.ts')
    return !!photos.cachedPhoto('a'.repeat(64))?.url
  })
  await page.route('https://storage.example.test/**/photo', (r) => r.abort())
  await page.locator('.place-card-title').first().click()
  await expect(
    page.getByRole('button', { name: 'Enlarge photo of Museum' }),
  ).toBeVisible({ timeout: 1000 })
  await page
    .getByRole('button', { name: 'Close place details', exact: true })
    .filter({ visible: true })
    .click()
  await page.locator('.place-card-title').first().click()
  await expect(
    page.getByRole('button', { name: 'Enlarge photo of Museum' }),
  ).toBeVisible({ timeout: 1000 })
  expect(state.requests).toBe(1)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const photos = await import('/src/lib/place-photo.ts')
        return !!photos.cachedPhoto('a'.repeat(64))
      }),
    )
    .toBe(false)
})
