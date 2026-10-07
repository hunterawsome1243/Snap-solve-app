import { expect, test } from '@playwright/test'
import { blockFonts, mockMathApi, PAPER_PNG } from './support/mocks.js'

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await mockMathApi(page)
})

// brightness of a corner of the photo shown in the crop screen, read back through a canvas
const cornerBrightness = (page) => page.evaluate(() => {
  const img = document.querySelector('.crop-wrap img')
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return (d[0] + d[1] + d[2]) / 3 }
  const w = c.width, h = c.height
  return { w, h, corners: [px(4, 4), px(w - 5, 4), px(4, h - 5), px(w - 5, h - 5)] }
})

test('a chosen photo is flattened and cleaned, and the original is one tap away', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[capture]', PAPER_PNG)
  await page.locator('.crop-box').waitFor()
  await expect(page.getByRole('button', { name: 'Flattened and cleaned' })).toHaveAttribute('aria-pressed', 'true')
  const clean = await cornerBrightness(page)
  expect(clean.w).toBeGreaterThan(300)
  // the desk is gone and the shadow is evened out: every corner of the flattened page is paper white
  clean.corners.forEach((v) => expect(v).toBeGreaterThan(215))

  await page.getByRole('button', { name: 'Original' }).click()
  const original = await cornerBrightness(page)
  expect(original.w).toBe(640)
  expect(original.corners.some((v) => v < 80)).toBe(true) // dark desk at the corners
  await page.getByRole('button', { name: 'Flattened and cleaned' }).click()
  expect((await cornerBrightness(page)).w).toBe(clean.w)
})

test('live camera: outlines the page and takes the photo on its own once it is steady', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Snap Equation' }).click()
  await expect(page.getByTestId('viewfinder')).toBeVisible()
  await expect(page.locator('.vf-quad')).toBeVisible({ timeout: 15_000 }) // the outline appears once the page is found
  // ...then it holds still, captures by itself, and lands on the crop screen with a flattened page
  await expect(page.locator('.crop-box')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Flattened and cleaned' })).toBeVisible()
  const clean = await cornerBrightness(page)
  clean.corners.forEach((v) => expect(v).toBeGreaterThan(215))
})

test('live camera: the shutter button works with auto-capture off', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Snap Equation' }).click()
  await page.getByLabel(/Take the photo for me/).uncheck()
  await expect(page.locator('.vf-quad')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(2500) // long enough that auto-capture would have fired
  await expect(page.getByTestId('viewfinder')).toBeVisible()
  await page.getByTestId('shutter').click()
  await expect(page.locator('.crop-box')).toBeVisible()
})

test('if the camera is blocked, it falls back to the phone camera app with an explanation', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
  })
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Snap Equation' }).click()
  await chooser
  await expect(page.getByText('Camera access was blocked')).toBeVisible()
})

test('without a secure connection it goes straight to the camera app', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined }))
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Snap Equation' }).click()
  await chooser
  await expect(page.getByText(/needs a secure connection/)).toBeVisible()
})
