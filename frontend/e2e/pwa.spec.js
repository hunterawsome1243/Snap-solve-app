import { expect, test } from '@playwright/test'
import { blockFonts } from './support/mocks.js'

test('installable: manifest, icons, and an offline-capable service worker', async ({ page, request }) => {
  await blockFonts(page)
  await page.goto('/')
  const m = await (await request.get('/manifest.webmanifest')).json()
  expect(m.display).toBe('standalone')
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBeTruthy()
  expect(await page.locator('link[rel=apple-touch-icon]').getAttribute('href')).toBe('/apple-touch-icon.png')
  const ready = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)
  expect(ready).toBe(true)
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.locator('.logo')).toHaveText(/Hunter Scan/)
})

test('iPhone Safari is told where Add to Home Screen is, once', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await blockFonts(page)
  await page.goto('/')
  await expect(page.getByText('Add to Home Screen')).toBeVisible()
  await page.getByLabel('Dismiss').click()
  await page.reload()
  await expect(page.getByText('Add to Home Screen')).toHaveCount(0)
  await ctx.close()
})
