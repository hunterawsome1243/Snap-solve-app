import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { barcodePhoto } from './support/barcodePhoto.js'
import { blockFonts, EAN_PNG, mockBuyApi, PAPER_PNG } from './support/mocks.js'

let state, calls
test.beforeEach(async ({ page }) => {
  state = { price: 278, checkedAt: Math.floor(Date.now() / 1000) }
  calls = []
  await blockFonts(page)
  await mockBuyApi(page, state, calls)
  await page.goto('/')
  await page.locator('.tabs button', { hasText: 'Snap Buy' }).click()
})

async function search(page) {
  await page.getByRole('button', { name: 'Type it' }).click()
  await page.locator('#buy-query').fill('Sony WH-1000XM5 headphones')
  await page.getByRole('button', { name: 'Find best price' }).click()
  await page.locator('.rec').waitFor()
}

test('reads a barcode from a photo', async ({ page }) => {
  await page.setInputFiles('#buy-scan', EAN_PNG)
  await expect(page.getByRole('heading', { name: 'Barcode found' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#buy-query')).toHaveValue('UPC 5901234123457')
})

test('photo → product → recommended store with freshness details', async ({ page }) => {
  await page.setInputFiles('#buy-cam', PAPER_PNG)
  await page.locator('.crop-box').waitFor()
  await page.getByRole('button', { name: 'Read equation' }).click()
  await expect(page.locator('#buy-query')).toHaveValue('Sony WH-1000XM5 headphones')
  await page.getByRole('button', { name: 'Find best price' }).click()
  await expect(page.locator('.rec')).toContainText('bestbuy.com')
  await expect(page.getByText('page seen 2 days ago')).toBeVisible()
  await expect(page.getByText(/Prices checked just now/)).toBeVisible()
  await expect(page.getByText('over a day old')).toHaveCount(0)
})

test('filters re-rank the offers without searching again', async ({ page }) => {
  await search(page)
  const searches = () => calls.filter((c) => c[0] === 'prices').length
  const list = page.locator('.card', { has: page.getByRole('heading', { name: 'All offers, cheapest first' }) }).locator('.offer-name')
  await page.locator('summary', { hasText: 'Filters' }).click()
  await page.getByRole('button', { name: 'New only' }).click()
  await expect(list).not.toContainText(['ebay.com'])
  await page.locator('#maxp').fill('290')
  await expect(list).toHaveCount(1)
  await expect(page.getByText('hidden by your filters')).toBeVisible()
  await page.locator('#maxp').fill('1')
  await expect(page.getByText('No offers match your filters')).toBeVisible()
  expect(searches()).toBe(1)
})

test('tracking: a price drop on re-check raises an alert, and a target price does too', async ({ page }) => {
  await search(page)
  await page.getByRole('button', { name: /Track this price/ }).click()
  await page.getByRole('tab', { name: /Tracked/ }).click()
  await expect(page.locator('.offer-price.big')).toHaveText('$278.00')

  state.price = 249
  await page.getByRole('button', { name: 'Re-check', exact: true }).first().click()
  await expect(page.getByText('Price drop!')).toBeVisible()
  await expect(page.locator('.offer-price.big')).toHaveText('$249.00')
  await expect(page.locator('.delta')).toContainText('↓ $29.00')

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await page.locator('input[id^="tg"]').fill('240')
  state.price = 235
  await page.getByRole('button', { name: 'Re-check', exact: true }).first().click()
  await expect(page.getByText('Hit your target price')).toBeVisible()
})

test('history keeps searches, flags old ones, and re-checks on request', async ({ page }) => {
  await search(page)
  await page.locator('.tabs button', { hasText: 'History' }).click()
  await expect(page.locator('.type-tag', { hasText: 'Snap Buy' })).toHaveCount(1)
  // pretend the search is three days old
  await page.evaluate(() => {
    const k = 'snapsolve.history.v1'
    const h = JSON.parse(localStorage.getItem(k))
    h.forEach((i) => { if (i.type === 'buy') { i.ts = Date.now() - 3 * 86400e3; i.result.checked_at = Math.floor(i.ts / 1000) } })
    localStorage.setItem(k, JSON.stringify(h))
  })
  await page.reload()
  await page.locator('.tabs button', { hasText: 'History' }).click()
  await page.getByRole('tab', { name: 'Snap Buy' }).click()
  await expect(page.locator('.history-item').first()).toContainText('3 days ago')
  await expect(page.locator('.history-item .stale')).toHaveCount(1)
  await page.locator('.history-open').first().click()
  await expect(page.getByText('These prices are over a day old.')).toBeVisible()
  await page.getByRole('button', { name: 'Re-check now' }).click()
  await page.locator('.rec').waitFor()
  expect(calls.filter((c) => c[0] === 'prices')).toHaveLength(2)
})

const HARD_PHOTOS = {
  'small and off to one side': { frac: 0.08, cx: 0.72, cy: 0.3 },
  'tiny': { frac: 0.05 },
  'dim and noisy': { frac: 0.3, dark: 0.45, noise: 40 },
  'tilted 40 degrees': { frac: 0.3, deg: 40 },
  'on its side and small': { frac: 0.1, deg: 90, cx: 0.4 },
  'out of focus': { frac: 0.3, blur: 6 },
}
for (const [name, opts] of Object.entries(HARD_PHOTOS)) {
  test(`reads a barcode from a hard photo: ${name}`, async ({ page }) => {
    test.setTimeout(90_000)
    const file = test.info().outputPath('hard.jpg')
    fs.writeFileSync(file, Buffer.from(await barcodePhoto(page, opts), 'base64'))
    await page.setInputFiles('#buy-scan', file)
    await expect(page.getByRole('heading', { name: 'Barcode found' })).toBeVisible({ timeout: 40_000 })
    await expect(page.locator('#buy-query')).toHaveValue('UPC 5901234123457')
  })
}

test('says so when there is no barcode to read', async ({ page }) => {
  await page.setInputFiles('#buy-scan', PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText("Couldn't read a barcode", { timeout: 40_000 })
})
