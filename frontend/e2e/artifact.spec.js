// Tests the single-file phone artifact (artifact/hunter-scan.html) with a faked Claude runtime:
// window.claude.use('sample') answers prompts, use('downloads') records saves. Libraries that the real page loads
// from a CDN are served from node_modules, so nothing here touches the network.
import { expect, test } from '@playwright/test'
import { blockFonts, EAN_PNG, PAPER_PNG } from './support/mocks.js'
import { fakeRuntime, routeArtifact } from './support/fakeClaude.js'

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await routeArtifact(page)
  await page.addInitScript(fakeRuntime)
  await page.goto('http://app.test/')
  await page.locator('.snap').waitFor()
})

const read = async (page) => {
  await page.setInputFiles('#cam', PAPER_PNG)
  await page.locator('.cbox').waitFor()
  await page.getByRole('button', { name: 'Read equation' }).click()
  await page.getByRole('heading', { name: '3 problems found' }).waitFor()
}
const fixAndSolve = async (page) => {
  await page.getByRole('button', { name: 'Edit & solve' }).first().click()
  await page.locator('.tok.flag').click()
  await page.locator('.fix-panel .chip', { hasText: '5' }).click()
  await page.locator('.btn.primary', { hasText: 'Solve' }).click()
  await page.locator('svg.graph').waitFor()
}

const cornerBrightness = (page) => page.evaluate(() => {
  const img = document.querySelector('.cwrap img')
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return (d[0] + d[1] + d[2]) / 3 }
  return { w: c.width, corners: [px(4, 4), px(c.width - 5, 4), px(4, c.height - 5), px(c.width - 5, c.height - 5)] }
})

test('a chosen photo is flattened and cleaned, and the original is one tap away', async ({ page }) => {
  await page.setInputFiles('#cam', PAPER_PNG)
  await page.locator('.cbox').waitFor()
  await expect(page.getByRole('button', { name: 'Flattened and cleaned' })).toHaveAttribute('aria-pressed', 'true')
  const clean = await cornerBrightness(page)
  clean.corners.forEach((v) => expect(v).toBeGreaterThan(215))
  await page.getByRole('button', { name: 'Original' }).click()
  const original = await cornerBrightness(page)
  expect(original.w).toBe(640)
  expect(original.corners.some((v) => v < 80)).toBe(true)
})

test('solve: several problems, tap-to-fix, graph, line checks, save as image and PDF', async ({ page }) => {
  await read(page)
  await fixAndSolve(page)
  await expect(page.locator('svg.graph path')).toHaveCount(2)
  await expect(page.locator('svg.graph circle')).toHaveCount(1)
  await expect(page.locator('.chk.ok')).toHaveCount(2)
  await expect(page.locator('.chk.bad')).toHaveCount(1)
  await expect(page.locator('.banner.warn')).toContainText('line 3')

  await page.getByRole('button', { name: 'Save as image' }).click()
  await page.waitForFunction(() => window.__saved.length >= 1, null, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Save as PDF' }).click()
  await page.waitForFunction(() => window.__saved.length >= 2, null, { timeout: 30_000 })
  const saved = await page.evaluate(() => window.__saved)
  expect(saved[0]).toMatchObject({ filename: 'hunter-scan.png', type: 'image/png' })
  expect(saved[0].size).toBeGreaterThan(5_000)
  expect(saved[1]).toMatchObject({ filename: 'hunter-scan.pdf', type: 'application/pdf' })
  await expect(page.locator('.sheet-wrap')).toHaveCount(0)
})

test('solve all, then the word problem answers in words with every line checked', async ({ page }) => {
  await read(page)
  await page.getByRole('button', { name: /Solve all/ }).click()
  await expect(page.locator('.status.done')).toHaveCount(2, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Turn into equation' }).click()
  await expect(page.locator('#latex')).toHaveValue('x+(x+3)=15')
  await page.locator('.btn.primary', { hasText: 'Solve' }).click()
  await expect(page.locator('.answer-text')).toHaveText('Ann has 6 apples.')
  await expect(page.locator('.chk.ok')).toHaveCount(3)
})

test('practice: hint on demand, wrong answer resets the streak, a clean solve grows it', async ({ page }) => {
  await read(page)
  await fixAndSolve(page)
  await page.getByRole('button', { name: 'Practice similar' }).click()
  await page.locator('#ans').waitFor()
  await page.getByRole('button', { name: 'Show hint' }).click()
  await expect(page.getByText('Try factoring.')).toBeVisible()
  await page.locator('#ans').fill('5')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText('Not quite')).toBeVisible()
  await page.locator('#ans').fill('x = 2 or x = 3')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText(/Correct/)).toBeVisible()
  await expect(page.locator('.streak')).toContainText('0')
  await page.getByRole('button', { name: 'Next problem' }).click()
  await page.locator('#ans').fill('3, 4')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText(/Correct/)).toBeVisible()
  await expect(page.locator('.streak')).toContainText('1')
})

test('snap buy: barcode → store recommendation → shared history', async ({ page }) => {
  await page.locator('#tab-buy').click()
  await page.setInputFiles('#scan', EAN_PNG)
  await expect(page.getByRole('heading', { name: 'Barcode found' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#bq')).toHaveValue('UPC 5901234123457')
  await page.locator('#bq').fill('Sony WH-1000XM5 headphones')
  await page.getByRole('button', { name: 'Find best price' }).click()
  await expect(page.locator('.rec')).toContainText('Best Buy')
  await page.locator('#tab-hist').click()
  await expect(page.locator('.type-tag', { hasText: 'Snap Buy' })).toHaveCount(1)
  await page.getByRole('tab', { name: 'Snap Buy' }).click()
  await page.locator('.hopen').click()
  await expect(page.locator('.rec')).toBeVisible()
})

test('themes: halloween pumpkins and the science lab', async ({ page }) => {
  await page.locator('#themebtn').click()
  await page.locator('.theme', { hasText: 'Halloween' }).click()
  await expect(page.locator('.pumpkin')).toHaveCount(11)
  await page.locator('.theme', { hasText: 'Science' }).click()
  await expect(page.locator('.pumpkin')).toHaveCount(0)
  await expect(page.locator('.element')).toHaveCount(13)
  await page.locator('#themebtn').click()
  await expect(page.locator('.logo')).toHaveText(/Hunter Scan/)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.snap'), '::after').animationName)).toBe('laser')
  await page.locator('#themebtn').click()
  await page.locator('.theme', { hasText: 'Ocean' }).click()
  await expect(page.locator('.element')).toHaveCount(0)
})

test('extras tab: scan a plant, save it, and keep track of watering', async ({ page }) => {
  await page.locator('#tab-extras').click()
  await page.getByText('Plant Scan').first().click()
  await page.setInputFiles('#plantpick', PAPER_PNG)

  await expect(page.getByRole('heading', { name: 'Monstera' })).toBeVisible()
  await expect(page.getByText('Likely', { exact: true })).toBeVisible() // medium confidence is labelled, not shown as certain
  await expect(page.getByText('Needs attention.')).toBeVisible() // an issue was listed, so "healthy" is corrected
  await expect(page.getByText('Let the top of the soil dry out.')).toBeVisible()
  await expect(page.getByText('Toxic to pets')).toBeVisible()

  await page.getByRole('button', { name: 'Save to My Plants' }).click()
  await expect(page.getByRole('button', { name: 'Saved to My Plants' })).toBeDisabled()
  await page.getByRole('button', { name: 'Scan another' }).click()
  const mine = page.getByTestId('my-plants')
  await expect(mine.getByText('Water in 7 days')).toBeVisible()

  await page.reload()
  await page.locator('#tab-extras').click()
  await expect(page.getByText('1 saved plant')).toBeVisible()
  await page.getByText('Plant Scan').first().click()
  await mine.getByText('Edit').click()
  await mine.getByLabel('Water every').fill('3')
  await expect(mine.getByText('Water in 3 days')).toBeVisible()
  await mine.getByRole('button', { name: 'Mark Monstera watered' }).click()
  await expect(mine.getByText('Water in 3 days')).toBeVisible()
  await mine.getByText('Edit').click()
  await mine.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('my-plants')).toHaveCount(0)
})

test('extras tab: a photo with no plant asks for a better one, and the other tabs still work', async ({ page }) => {
  await page.locator('#tab-extras').click()
  await page.getByText('Plant Scan').first().click()
  await page.getByLabel('Anything wrong with it? (optional)').fill('it is a rock')
  await page.setInputFiles('#plantpick', PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('closer photo')
  await expect(page.getByRole('heading', { name: 'Scan a plant' })).toBeVisible()
  await page.locator('#tab-solve').click()
  await expect(page.locator('.snap')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Scan a plant' })).toHaveCount(0)
})
