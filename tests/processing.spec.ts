import { collectionResponse } from './helpers/collection-fixture'
import { test, expect, type Page } from '@playwright/test'
async function login(page: Page) {
  const jwt = `header.${Buffer.from(JSON.stringify({ sub: 'user-a' })).toString('base64url')}.signature`
  await page.route('https://cognito-idp.us-east-1.amazonaws.com/**', (r) =>
    r.fulfill({
      json: {
        AuthenticationResult: {
          AccessToken: jwt,
          RefreshToken: 'refresh',
          ExpiresIn: 300,
        },
      },
    }),
  )
  await page.route('https://storage.example.test/**', (r) =>
    new URL(r.request().url()).pathname === '/collections' ? r.fulfill({json: collectionResponse}) : r.fulfill({ json: { items: [], cursor: null, collectionVersion: 1 } }),
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .first()
    .click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Email', { exact: true }).fill('person@example.com')
  await modal.getByLabel('Password', { exact: true }).fill('Password123!')
  await modal
    .getByRole('button', { name: 'Sign in', exact: true })
    .last()
    .click()
  await expect(modal).toHaveCount(0)
  await page
    .locator('.mobile-save').getByRole('button', { name: 'Save a place', exact: true })
    .first()
    .click()
  await page
    .getByLabel('Instagram post link', { exact: true })
    .fill('https://www.instagram.com/p/DfFCMjzk02S/')
}
test('authenticated cloud import is queued and polled without a local API', async ({
  page,
}) => {
  let id = '',
    polls = 0,
    posts = 0
  await page.route('**/api/**', () => {
    throw Error('Production must not use local API')
  })
  await page.route('https://processing.example.test/jobs**', async (r) => {
    expect(r.request().headers().authorization).toMatch(/^Bearer /)
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON()
      id = body.id
      posts++
      expect(body.operation).toBe('import')
      await r.fulfill({ status: 202, json: { id, status: 'queued' } })
    } else {
      polls++
      await r.fulfill({
        json:
          polls === 1
            ? { id, status: 'running', progress: { stage: 'reading_photos', completed: 1, total: 2 } }
            : {
                id,
                status: 'complete',
                result: {
                  fetchedImages: 2,
                  result: { places: [], ignoredSlides: [1, 2] },
                },
              },
      })
    }
  })
  await login(page)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.locator('.loading-screen')).toContainText('1 of 2 photos read')
  await page.screenshot({ path: '/tmp/pinwish-import-progress-desktop.png' })
  await expect(
    page.getByText('No readable place names', { exact: false }),
  ).toBeVisible({ timeout: 10000 })
  expect(posts).toBe(1)
  expect(polls).toBe(2)
})
test('daily cloud quota errors preserve the original link', async ({
  page,
}) => {
  await page.route('https://processing.example.test/jobs**', (r) =>
    r.fulfill({ status: 429, json: { code: 'daily_limit' } }),
  )
  await login(page)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(
    page.getByText(
      'The daily test limit has been reached. Please try again tomorrow.',
    ),
  ).toBeVisible({ timeout: 10000 })
  await expect(page.getByLabel('Instagram post link', { exact: true })).toHaveValue(
    'https://www.instagram.com/p/DfFCMjzk02S/',
  )
})

test('a lost submission response retries the same idempotency key', async ({
  page,
}) => {
  const ids: string[] = []
  await page.route('https://processing.example.test/jobs**', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON()
      ids.push(body.id)
      if (ids.length === 1) return r.abort('connectionreset')
      return r.fulfill({ status: 202, json: { id: body.id, status: 'queued' } })
    }
    return r.fulfill({
      json: {
        id: ids[0],
        status: 'complete',
        result: {
          fetchedImages: 1,
          result: { places: [], ignoredSlides: [1] },
        },
      },
    })
  })
  await login(page)
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(
    page.getByText('No readable place names', { exact: false }),
  ).toBeVisible({ timeout: 10000 })
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
})

test('mobile import progress stays within the viewport and cancellation discards late updates', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  let id = ''
  await page.route('https://processing.example.test/jobs**', async r => {
    if (r.request().method() === 'POST') {
      id = r.request().postDataJSON().id
      return r.fulfill({status:202,json:{id,status:'queued'}})
    }
    return r.fulfill({json:{id,status:'running',progress:{stage:'reading_photos',completed:6,total:13}}})
  })
  await login(page)
  await page.getByRole('button',{name:'Find place',exact:true}).click()
  await expect(page.locator('.loading-screen')).toContainText('6 of 13 photos read')
  await page.screenshot({path:'/tmp/pinwish-import-progress-mobile.png'})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.loading-screen').getByRole('button',{name:'Cancel',exact:true}).click()
  await expect(page.locator('.loading-screen')).toHaveCount(0)
  await expect(page.getByLabel('Instagram post link',{exact:true})).toHaveValue('https://www.instagram.com/p/DfFCMjzk02S/')
})

test('an interrupted polling body retries the same job without a second import', async ({ page }) => {
  let id = '', posts = 0, polls = 0
  await page.route('https://processing.example.test/jobs**', async r => {
    if (r.request().method() === 'POST') {
      posts++
      id = r.request().postDataJSON().id
      return r.fulfill({status:202,json:{id,status:'queued'}})
    }
    expect(new URL(r.request().url()).pathname).toBe('/jobs/'+id)
    if (++polls === 1) return r.fulfill({status:200,body:'{"id":'})
    return r.fulfill({json:{id,status:'complete',result:{fetchedImages:1,result:{places:[],ignoredSlides:[1]}}}})
  })
  await login(page)
  await page.getByRole('button',{name:'Find place',exact:true}).click()
  await expect(page.getByText('No readable place names',{exact:false})).toBeVisible({timeout:10000})
  expect(posts).toBe(1)
  expect(polls).toBe(2)
})

test('unreachable processing endpoint reports connection failure and preserves the link', async ({ page }) => {
  const ids: string[] = []
  await page.route('https://processing.example.test/jobs**', r => {
    ids.push(r.request().postDataJSON().id)
    return r.abort('connectionreset')
  })
  await login(page)
  await page.getByRole('button',{name:'Find place',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Could not connect to the analysis service',{timeout:10000})
  await expect(page.getByLabel('Instagram post link',{exact:true})).toHaveValue('https://www.instagram.com/p/DfFCMjzk02S/')
  expect(ids).toHaveLength(3)
  expect(new Set(ids).size).toBe(1)
})
