import { test, expect, type Page } from '@playwright/test'
const jwt = (sub = 'user-a') =>
  `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`
const token = {
  AccessToken: jwt(),
  RefreshToken: 'test-refresh',
  ExpiresIn: 300,
}
const record = {
  id: 'a'.repeat(64),
  provider: 'amazon-location',
  placeId: 'museum-id',
  name: 'Museum',
  displayName: 'Museum',
  address: '100 Museum Road',
  countryCode: 'US',
  countryName: 'United States',
  coordinates: { longitude: -118, latitude: 34 },
  placeType: 'PointOfInterest',
  note: 'Original note',
  collection: 'LA weekend',
  visited: false,
  bookmarked: true,
  version: 1,
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
  sources: {
    source: {
      originalUrl: 'https://www.instagram.com/p/Example/?img_index=2',
      canonicalUrl: 'https://www.instagram.com/p/Example/',
      slides: [2],
      extractedName: '박물관',
      evidence: '박물관',
    },
  },
}
async function setup(page: Page, records: (typeof record)[] = []) {
  await page.route(
    'https://cognito-idp.us-east-1.amazonaws.com/**',
    (route) => {
      const action = route.request().headers()['x-amz-target']?.split('.').pop()
      return route.fulfill({
        json: action === 'InitiateAuth' ? { AuthenticationResult: token } : {},
        headers: { 'access-control-allow-origin': '*' },
      })
    },
  )
  await page.route('https://storage.example.test/**', (route) =>
    route.fulfill({ json: { items: records, cursor: null } }),
  )
}
async function login(page: Page, remember = false) {
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Email', { exact: true }).fill('person@example.com')
  await modal.getByLabel('Password', { exact: true }).fill('Password123!')
  if (remember) await modal.getByLabel('Keep me signed in for 7 days').check()
  await modal
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(modal).toHaveCount(0)
}
test('top-right sign-in and inline invalid-email errors prevent requests', async ({
  page,
}) => {
  let calls = 0
  await setup(page)
  page.on('request', (r) => {
    if (r.url().includes('cognito-idp')) calls++
  })
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Email', { exact: true }).fill('wrong@')
  await modal.getByLabel('Password', { exact: true }).fill('Password123!')
  await modal
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(modal.getByLabel('Email', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(
    modal.getByText('Enter a valid email address, such as name@example.com.'),
  ).toHaveCSS('color', 'rgb(180, 35, 24)')
  expect(calls).toBe(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
test('create account opens verification, then returns to sign-in with email; password rules enforced', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const modal = page.getByRole('dialog')
  await modal
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await modal.getByLabel('Email', { exact: true }).fill('new@example.com')
  await modal.getByLabel('Password', { exact: true }).fill('short')
  await modal
    .getByRole('button', { name: 'Create account', exact: true })
    .last()
    .click()
  await expect(modal.getByLabel('Password', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await modal.getByLabel('Password', { exact: true }).fill('ValidPassword123!')
  await modal
    .getByRole('button', { name: 'Create account', exact: true })
    .last()
    .click()
  await expect(modal.getByRole('heading')).toHaveText('Check your email')
  await expect(modal.getByLabel('Email', { exact: true })).toHaveValue(
    'new@example.com',
  )
  await expect(modal.getByRole('status')).toContainText('Account created')
  await modal.getByLabel('Verification code').fill('123456')
  await modal.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(modal.getByRole('heading')).toHaveText('Welcome back')
  await expect(modal.getByLabel('Email', { exact: true })).toHaveValue('new@example.com')
  await expect(modal.getByRole('button', { name: 'Verify email', exact: true })).toHaveCount(0)
})
test('remembered login persists for seven days, reloads cloud records, and sign-out clears storage', async ({
  page,
}) => {
  await setup(page, [record])
  await page.goto('/')
  await login(page, true)
  await expect(page.locator('.place-card-title')).toContainText('Museum')
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pinwish:session:test-client')!),
  )
  expect(stored.rememberUntil - Date.now()).toBeGreaterThan(6.99 * 86400000)
  await page.reload()
  await expect(page.locator('.place-card-title')).toContainText('Museum')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      localStorage.getItem('pinwish:session:test-client'),
    ),
  ).toBeNull()
})
test('unchecked login stays in session storage; expired remembered session requires login', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await login(page)
  expect(
    await page.evaluate(() =>
      localStorage.getItem('pinwish:session:test-client'),
    ),
  ).toBeNull()
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('pinwish:session:test-client'),
    ),
  ).toBeTruthy()
  await page.evaluate(() => {
    const key = 'pinwish:session:test-client'
    const s = JSON.parse(sessionStorage.getItem(key)!)
    sessionStorage.removeItem(key)
    localStorage.setItem(
      key,
      JSON.stringify({ ...s, rememberUntil: Date.now() - 1 }),
    )
  })
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }).first(),
  ).toBeVisible()
})
test('signed-out link submission prompts login and restores the original draft', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await page.locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true }).click()
  await page
    .getByLabel('Link or address', { exact: true })
    .fill('https://www.instagram.com/p/Example/?img_index=2')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toContainText('Your link and review will be kept')
  await modal.getByLabel('Email', { exact: true }).fill('person@example.com')
  await modal.getByLabel('Password', { exact: true }).fill('Password123!')
  await modal
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(page.getByLabel('Link or address', { exact: true })).toHaveValue(
    'https://www.instagram.com/p/Example/?img_index=2',
  )
})
test('password recovery flow validates and returns to sign-in', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Forgot password?' }).click()
  await modal.getByLabel('Email', { exact: true }).fill('person@example.com')
  await modal.getByRole('button', { name: 'Send reset code' }).click()
  await modal.getByLabel('Verification code').fill('123456')
  await modal.getByLabel('Password', { exact: true }).fill('NewPassword123!')
  await modal.getByRole('button', { name: 'Update password' }).click()
  await expect(modal.getByRole('heading')).toHaveText('Welcome back')
})

test('cloud note edits retry after failure, visit updates persist, and deletion requires confirmation', async ({
  page,
}) => {
  let current = { ...record }
  let failures = 1
  let deleted = false
  await setup(page)
  await page.route('https://storage.example.test/**', (route) => {
    const method = route.request().method()
    if (method === 'PATCH') {
      if (failures-- > 0)
        return route.fulfill({
          status: 503,
          json: { code: 'storage_unavailable' },
        })
      const body = route.request().postDataJSON()
      current = { ...current, ...body, version: current.version + 1 }
      return route.fulfill({ json: { item: current } })
    }
    if (method === 'DELETE') {
      deleted = true
      return route.fulfill({ json: { deleted: true } })
    }
    return route.fulfill({
      json: { items: deleted ? [] : [current], cursor: null },
    })
  })
  await page.goto('/')
  await login(page)
  await page.locator('.place-card-title').click()
  await page
    .getByRole('button', { name: 'Edit personal note', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Personal note', exact: true })
    .fill('Keep my edit')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Personal note', exact: true }),
  ).toHaveValue('Keep my edit')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.personal-note')).toContainText('Keep my edit')
  await page.getByRole('button', { name: 'Unvisited', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Visited', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Delete place', exact: true }).click()
  expect(deleted).toBe(false)
  await page
    .getByRole('button', { name: 'Confirm delete', exact: true })
    .click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  expect(deleted).toBe(true)
})
test('partial import save keeps confirmations and retry is idempotent', async ({
  page,
}) => {
  await setup(page)
  const base = {
    provider: 'amazon-location',
    placeId: 'A',
    name: 'Museum A',
    address: '100 Example Road',
    countryCode: 'US',
    countryName: 'United States',
    coordinates: { longitude: -118, latitude: 34 },
    placeType: 'PointOfInterest',
    englishName: 'Museum A',
    koreanName: null,
    selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  }
  await page.route('**/api/instagram/preview', (r) =>
    r.fulfill({
      json: {
        fetchedImages: 2,
        result: {
          places: [
            {
              name: 'Museum A',
              regionHint: 'LA',
              slides: [1],
              evidence: 'Museum A',
              needsLocationConfirmation: true,
            },
            {
              name: 'Museum B',
              regionHint: 'LA',
              slides: [2],
              evidence: 'Museum B',
              needsLocationConfirmation: true,
            },
          ],
          ignoredSlides: [],
        },
      },
    }),
  )
  await page.route('**/api/places/search', (r) => {
    const b = r.request().postDataJSON().query === 'Museum B'
    return r.fulfill({
      json: {
        matches: [
          b
            ? {
                ...base,
                placeId: 'B',
                name: 'Museum B',
                englishName: 'Museum B',
                selectionToken: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              }
            : base,
        ],
        excludedResults: 0,
        unsupportedCountries: [],
        attribution: 'Test fixture',
      },
    })
  })
  await page.route('**/api/places/details', (r) => {
    const b = r.request().postDataJSON().selectionToken.startsWith('b')
    return r.fulfill({
      json: {
        place: {
          ...base,
          ...(b
            ? { placeId: 'B', name: 'Museum B', englishName: 'Museum B' }
            : {}),
          retrievedAt: '2026-11-10T00:00:00Z',
        },
      },
    })
  })
  const records = new Map<string, typeof record>()
  let fail = true
  await page.route('https://storage.example.test/**', (r) => {
    if (r.request().method() === 'POST') {
      const p = r.request().postDataJSON().place
      if (p.placeId === 'B' && fail) {
        fail = false
        return r.fulfill({ status: 503, json: { code: 'storage_unavailable' } })
      }
      const item = {
        ...record,
        id: p.placeId === 'A' ? 'a'.repeat(64) : 'b'.repeat(64),
        displayName: p.displayName,
      }
      records.set(p.placeId, item)
      return r.fulfill({ json: { item } })
    }
    return r.fulfill({ json: { items: [...records.values()], cursor: null } })
  })
  await page.goto('/')
  await login(page)
  await page.locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true }).click()
  await page
    .getByLabel('Link or address', { exact: true })
    .fill('https://www.instagram.com/p/Example/')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('1 of 2 saved')
  await page
    .getByRole('button', { name: 'Add to map', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'View map', exact: true })).toBeVisible()
  expect(records.size).toBe(2)
  await page.getByRole('button', { name: 'View map', exact: true }).click()
  await page.getByRole('button', { name: 'Your places', exact: true }).click()
  await expect(page.locator('.place-card')).toHaveCount(2)
})

test('expired access token refreshes without dropping remembered login or loading another account', async ({
  page,
}) => {
  await setup(page, [record])
  await page.goto('/')
  await login(page, true)
  await page.evaluate(() => {
    const key = 'pinwish:session:test-client'
    const s = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(
      key,
      JSON.stringify({ ...s, expiresAt: Date.now() - 1 }),
    )
  })
  let refreshes = 0
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) => {
    if (r.request().postDataJSON().AuthFlow === 'REFRESH_TOKEN_AUTH')
      refreshes++
    return r.fulfill({
      json: { AuthenticationResult: { AccessToken: jwt(), ExpiresIn: 300 } },
    })
  })
  await page.reload()
  await expect(page.locator('.place-card-title')).toContainText('Museum')
  expect(refreshes).toBe(1)
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('pinwish:session:test-client')!)
          .refreshToken,
    ),
  ).toBe('test-refresh')
})
test('remembered login survives a new browser context while expired credentials prompt login', async ({
  page,
  browser,
}) => {
  await setup(page, [record])
  await page.goto('/')
  await login(page, true)
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
  })
  try {
    const next = await context.newPage()
    await setup(next, [record])
    await next.goto('http://127.0.0.1:5176/')
    await expect(next.locator('.place-card-title')).toContainText('Museum')
    await next.route('https://storage.example.test/places', (r) =>
      r.fulfill({ status: 401, json: { code: 'unauthorized' } }),
    )
    await next
      .getByRole('button', { name: 'Refresh places', exact: true })
      .click()
    await expect(
      next.getByRole('button', { name: 'Sign in', exact: true }).first(),
    ).toBeVisible()
    await expect(next.locator('.place-card')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('temporary API throttling retries without losing the session', async ({
  page,
}) => {
  await setup(page, [record])
  let calls = 0
  await page.route('https://storage.example.test/places', (r) =>
    ++calls === 1
      ? r.fulfill({ status: 429, json: { code: 'throttled' } })
      : r.fulfill({ json: { items: [record], cursor: null } }),
  )
  await page.goto('/')
  await login(page)
  await expect(page.locator('.place-card-title')).toContainText('Museum')
  expect(calls).toBe(2)
})

test('unverified sign-in resumes verification and allows retrying a wrong code', async ({ page }) => {
  await setup(page)
  let confirms = 0
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', route => {
    const action = route.request().headers()['x-amz-target']?.split('.').pop()
    if (action === 'InitiateAuth') return route.fulfill({ status: 400, json: { __type: 'UserNotConfirmedException', message: 'User is not confirmed.' } })
    if (action === 'ConfirmSignUp' && ++confirms === 1) return route.fulfill({ status: 400, json: { __type: 'CodeMismatchException', message: 'Invalid code.' } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('button', { name: 'Verify email', exact: true })).toHaveCount(0)
  await modal.getByLabel('Email', { exact: true }).fill('unverified@example.com')
  await modal.getByLabel('Password', { exact: true }).fill('Password123!')
  await modal.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  await expect(modal.getByRole('heading')).toHaveText('Check your email')
  await expect(modal.getByLabel('Email', { exact: true })).toHaveValue('unverified@example.com')
  await modal.getByLabel('Verification code').fill('000000')
  await modal.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('That code is incorrect')
  await expect(modal.getByRole('heading')).toHaveText('Check your email')
  await modal.getByRole('button', { name: 'Resend code' }).click()
  await expect(modal.getByRole('status')).toContainText('A new verification code')
  await modal.getByLabel('Verification code').fill('123456')
  await modal.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(modal.getByRole('heading')).toHaveText('Welcome back')
  await expect(modal.getByLabel('Email', { exact: true })).toHaveValue('unverified@example.com')
  await expect(modal.getByRole('button', { name: 'Verify email', exact: true })).toHaveCount(0)
})

test('a Korean overseas post automatically saves and opens its English map pin without confirmation', async ({ page }) => {
  await setup(page)
  const match = { provider: 'amazon-location', placeId: 'museum-id', name: 'Museum', englishName: 'Museum', koreanName: null, address: record.address, countryCode: 'US', countryName: 'United States', coordinates: record.coordinates, placeType: 'PointOfInterest', selectionToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
  await page.route('**/api/instagram/preview', r => r.fulfill({ json: { fetchedImages: 1, result: { places: [{ name: '박물관', evidence: '박물관', regionHint: 'Los Angeles', slides: [1], needsLocationConfirmation: true }], ignoredSlides: [] } } }))
  await page.route('**/api/places/search', r => r.fulfill({ json: { matches: [match], excludedResults: 0, unsupportedCountries: [], attribution: 'AWS', queryConversion: { originalQuery: '박물관', searchQuery: 'Museum', searchRegion: 'Los Angeles', status: 'translated' } } }))
  await page.route('**/api/places/details', r => r.fulfill({ json: { place: { ...match, retrievedAt: new Date().toISOString() } } }))
  let saves = 0
  let original = ''
  await page.route('https://storage.example.test/**', r => {
    if (r.request().method() === 'POST') {
      saves++
      const place = r.request().postDataJSON().place
      original = place.source.extractedName
      return r.fulfill({ json: { item: { ...record, sources: { source: { ...record.sources.source, extractedName: original, evidence: original } } } } })
    }
    return r.fulfill({ json: { items: saves ? [record] : [], cursor: null } })
  })
  await page.goto('/')
  await login(page)
  await page.locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true }).click()
  await page.getByLabel('Link or address', { exact: true }).fill('https://www.instagram.com/p/Example/')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Select a saved place on the map').locator('option')).toHaveCount(2)
  expect(saves).toBe(1)
  expect(original).toBe('박물관')
  await page.getByLabel('Select a saved place on the map').selectOption(record.id)
  await expect(page.locator('#place-heading')).toHaveText('Museum')
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Script=Hangul}/u)
})
