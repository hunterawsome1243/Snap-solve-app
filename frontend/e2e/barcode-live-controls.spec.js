import { expect, test } from '@playwright/test'
import { blockFonts, mockBuyApi } from './support/mocks.js'

// The default fake camera shows a sheet of paper (no barcode), so the live scanner stays open for these.
test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await mockBuyApi(page, { price: 278, checkedAt: Math.floor(Date.now() / 1000) }, [])
  await page.goto('/')
  await page.locator('.tabs button', { hasText: 'Snap Buy' }).click()
})

test('live barcode scan: it can be cancelled, or swapped for a photo', async ({ page }) => {
  await page.getByRole('button', { name: 'Scan barcode' }).click()
  await expect(page.getByTestId('barcode-viewfinder')).toBeVisible()
  await page.getByLabel('Cancel').click()
  await expect(page.getByRole('heading', { name: 'Snap it.' })).toBeVisible()
  await page.getByRole('button', { name: 'Scan barcode' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Take a photo of it instead' }).click()
  await chooser // the photo picker opens
})

test('live barcode scan: with no barcode in view it stays open and keeps looking', async ({ page }) => {
  await page.getByRole('button', { name: 'Scan barcode' }).click()
  await expect(page.getByTestId('bc-hint')).toHaveText('Point at the barcode and hold steady', { timeout: 15_000 })
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('barcode-viewfinder')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Barcode found' })).toHaveCount(0)
})
