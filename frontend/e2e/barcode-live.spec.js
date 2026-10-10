import path from 'node:path'
import { expect, test } from '@playwright/test'
import { blockFonts, mockBuyApi } from './support/mocks.js'

// This file's fake camera plays a looping video of a product barcode (the other tests' camera shows a sheet of paper).
test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.resolve('e2e/.tmp/barcode.y4m')}`],
  },
})

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await mockBuyApi(page, { price: 278, checkedAt: Math.floor(Date.now() / 1000) }, [])
  await page.goto('/')
  await page.locator('.tabs button', { hasText: 'Snap Buy' }).click()
})

test('live barcode scan: hold a product up and it reads on its own', async ({ page }) => {
  await page.getByRole('button', { name: 'Scan barcode' }).click()
  await expect(page.getByTestId('barcode-viewfinder')).toBeVisible()
  await expect(page.getByText('Results for Acme Widget 500 ml')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.rec')).toBeVisible()
})
