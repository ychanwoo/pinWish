import { test, expect } from '@playwright/test'

test('search filters real cards and opening a result shows the matching detail', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('textbox', { name: 'Search places', exact: true })
    .fill('Maru')
  await expect(page.locator('.place-card')).toHaveCount(1)
  await page.locator('.place-card-title').click()
  await expect(page.locator('#place-heading')).toHaveText('Maru Coffee')
})

test('invalid input is retained; a sample link resolves and detects an existing saved place', async ({
  page,
}) => {
  await page.goto('/?state=entry')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Link or address', { exact: true }).fill('not-a-link')
  await dialog.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Check your link or address',
  )
  await expect(
    dialog.getByLabel('Link or address', { exact: true }),
  ).toHaveValue('not-a-link')
  await dialog
    .getByLabel('Link or address', { exact: true })
    .fill('https://www.instagram.com/p/example/')
  await dialog.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Save place', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Save place', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'View saved place', exact: true }),
  ).toBeVisible()
  await dialog
    .getByRole('button', { name: 'View saved place', exact: true })
    .click()
  await expect(page.locator('#place-heading')).toHaveText(
    'Grand Central Market',
  )
})

test('save retry retains note and collection and creates only one sample record', async ({
  page,
}, info) => {
  await page.goto('/?state=ready&scenario=save_error')
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Personal note', { exact: true })
    .fill('Meet here on Saturday.')
  await dialog
    .getByLabel('Collection', { exact: true })
    .selectOption('Weekend ideas')
  await dialog.getByRole('button', { name: 'Save place', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Couldn’t save your place',
  )
  await expect(dialog.getByLabel('Personal note', { exact: true })).toHaveValue(
    'Meet here on Saturday.',
  )
  await expect(dialog.getByLabel('Collection', { exact: true })).toHaveValue(
    'Weekend ideas',
  )
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click()
  const result =
    info.project.name === 'desktop' ? page.locator('.saved-toast') : dialog
  await expect(
    result.getByRole('button', { name: 'View place', exact: true }),
  ).toBeVisible()
  await result.getByRole('button', { name: 'View place', exact: true }).click()
  await expect(page.locator('#place-heading')).toHaveText(
    'Grand Central Market',
  )
  await expect(page.locator('.personal-note')).toContainText(
    'Meet here on Saturday.',
  )
})

test('closing and reopening preserves the draft', async ({ page }, info) => {
  await page.goto('/?state=ready')
  await page
    .getByLabel('Personal note', { exact: true })
    .fill('Keep this draft')
  await page
    .getByRole('button', {
      name:
        info.project.name === 'mobile' ? 'Back to places' : 'Close save dialog',
      exact: true,
    })
    .click()
  await page
    .getByRole('button', {
      name: info.project.name === 'mobile' ? 'Save a place' : 'Add pin',
      exact: true,
    })
    .click()
  await expect(page.getByLabel('Personal note', { exact: true })).toHaveValue(
    'Keep this draft',
  )
})

test('cancelled lookup cannot replace a newer draft', async ({ page }) => {
  await page.goto('/?state=entry')
  await page
    .getByLabel('Link or address', { exact: true })
    .fill('https://www.instagram.com/p/example/')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel lookup', exact: true }).click()
  await page.getByLabel('Link or address', { exact: true }).fill('Maru Coffee')
  await page.getByRole('button', { name: 'Find place', exact: true }).click()
  await expect(page.locator('.resolved-place')).toContainText('Maru Coffee')
})

test('screen previews load assets without horizontal overflow', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (info.project.name === 'mobile')
    await page.setViewportSize({ width: 320, height: 740 })
  for (const query of [
    '',
    '?view=map',
    '?view=detail',
    '?view=empty',
    '?view=saved',
    '?view=list_loading',
    '?view=list_error',
    ...[
      'entry',
      'resolving',
      'ready',
      'invalid',
      'not_found',
      'lookup_error',
      'saving',
      'save_error',
      'duplicate',
      'success',
    ].map((s) => `?state=${s}`),
  ]) {
    await page.goto('/' + query)
    await page.evaluate(() => document.fonts.ready)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.images].filter((i) => !i.complete || !i.naturalWidth)
              .length,
        ),
      )
      .toBe(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  expect(errors).toEqual([])
})

test('desktop map callout opens the selected place dossier by mouse and keyboard', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop workspace callout')
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Select Maru Coffee', exact: true })
    .click()
  await expect(page.locator('.detail-panel')).toHaveCount(0)
  const callout = page.getByRole('button', {
    name: 'View details for Maru Coffee',
    exact: true,
  })
  await callout.click()
  await expect(page.locator('#place-heading')).toHaveText('Maru Coffee')
  await page
    .getByRole('button', { name: 'Close place details', exact: true })
    .filter({ visible: true })
    .click()
  await expect(callout).toBeVisible()
  await callout.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#place-heading')).toHaveText('Maru Coffee')
})

test('detail pins switch the dossier without closing it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop map beside the dossier')
  await page.goto('/?view=detail')
  for (const name of [
    'Maru Coffee',
    'Gjusta',
    'The Broad',
    'Grand Central Market',
  ]) {
    await page
      .getByRole('button', { name: `Select ${name}`, exact: true })
      .click()
    await expect(page.locator('#place-heading')).toHaveText(name)
    await expect(page.locator('.map-pin')).toHaveCount(5)
  }
})

test('note cancel discards edits; saved edits survive reopening a place', async ({
  page,
}, info) => {
  await page.goto('/?view=detail')
  const original = await page.locator('.personal-note p').innerText()
  await page
    .getByRole('button', { name: 'Edit personal note', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Personal note', exact: true })
    .fill('Discard this')
  await page
    .getByRole('button', { name: 'Cancel note editing', exact: true })
    .click()
  await expect(page.locator('.personal-note p')).toHaveText(original, {
    useInnerText: true,
  })
  await page
    .getByRole('button', { name: 'Edit personal note', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Personal note', exact: true })
    .fill('Bring a friend next time')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await page
    .getByRole('button', {
      name:
        info.project.name === 'mobile'
          ? 'Back to places'
          : 'Close place details',
      exact: true,
    })
    .filter({ visible: true })
    .click()
  await page
    .locator('.place-card-title')
    .filter({ hasText: 'Grand Central Market' })
    .click()
  await expect(page.locator('.personal-note')).toContainText(
    'Bring a friend next time',
  )
})

test('new collections remain selectable and isolate their places', async ({
  page,
}, info) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Create collection', exact: true })
    .filter({ visible: true })
    .click()
  await page.getByLabel('Collection name').fill('Weekend trip')
  await page
    .getByRole('button', { name: 'Create collection', exact: true })
    .filter({ visible: true })
    .last()
    .click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  await page
    .getByRole('button', {
      name: info.project.name === 'mobile' ? 'LA weekend' : 'All Curated Pins',
      exact: false,
    })
    .filter({ visible: true })
    .click()
  await expect(page.locator('.place-card')).toHaveCount(5)
  await page
    .getByRole('button', { name: 'Weekend trip', exact: false })
    .filter({ visible: true })
    .click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  await expect(page.locator('.map-pin')).toHaveCount(0)
})

test('search and category filters keep map pins aligned with cards', async ({
  page,
}, info) => {
  await page.goto('/')
  await page
    .getByRole('textbox', { name: 'Search places', exact: true })
    .fill('Maru')
  await expect(page.locator('.place-card')).toHaveCount(1)
  await expect(page.locator('.map-pin')).toHaveCount(1)
  await page
    .getByRole('textbox', { name: 'Search places', exact: true })
    .fill('No such place')
  await expect(page.locator('.place-card')).toHaveCount(0)
  await expect(page.locator('.map-pin')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  if (info.project.name === 'mobile') return
  await page.getByRole('button', { name: 'Coffee (1)', exact: true }).click()
  await expect(page.locator('.place-card')).toHaveCount(1)
  await expect(page.locator('.map-pin')).toHaveCount(1)
})
