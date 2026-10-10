// The small touches: results pop in, errors shake, saves confirm, waits say what they are doing, themes cross-fade,
// and everything you tap presses the same way. All of it is off for people who ask the OS for less motion.
import { expect, test } from '@playwright/test'
import { blockFonts, mockBuyApi, mockFoodApi, mockPlantApi, MONSTERA, PAPER_PNG } from './support/mocks.js'
import { PROGRESS } from '../src/lib/progress.js'

const anim = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).animationName, selector)
const fading = (page) => page.evaluate(() => document.documentElement.classList.contains('theme-fading'))

async function openTool(page, tool) {
  await page.goto('/')
  await page.locator('.tabs').getByText('Extras').click()
  await page.getByText(tool).first().click()
}

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
})

test('a result pops in: first card pops, the rest rise, the healthy check draws itself, and the page starts at the top', async ({ page }) => {
  await mockPlantApi(page, [], { ...MONSTERA, health: { status: 'healthy', summary: 'Looking good.', issues: [] } })
  await page.setViewportSize({ width: 390, height: 420 }) // short enough that the home screen scrolls
  await openTool(page, 'Plant Scan')
  await page.evaluate(() => window.scrollTo(0, 300))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  const reveal = page.locator('.content > .reveal')
  await expect(reveal).toBeVisible()
  expect(await anim(page, '.content > .reveal > :first-child')).toBe('pop')
  expect(await anim(page, '.content > .reveal > :nth-child(2)')).toBe('rise-up')
  expect(await anim(page, '.reveal .banner.ok > .b-ico path')).toBe('draw')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('an error shakes when it appears', async ({ page }) => {
  await page.route('**/api/plant/scan', (r) => r.fulfill({ status: 502, json: { detail: 'Anthropic API error: overloaded' } }))
  await openTool(page, 'Plant Scan')
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('overloaded')
  expect(await anim(page, '.banner.warn[role="alert"]')).toBe('shake')
})

test('a loading screen says what it is doing, and the line moves on every 1.6 s', async ({ page }) => {
  await page.clock.install()
  await page.route('**/api/plant/scan', () => new Promise(() => {})) // never answers: the loader stays up
  await openTool(page, 'Plant Scan')
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  const line = page.locator('.progress-text')
  await expect(line).toHaveText(PROGRESS.plant[0])
  await page.clock.runFor(1700)
  await expect(line).toHaveText(PROGRESS.plant[1])
  await page.clock.runFor(1600)
  await expect(line).toHaveText(PROGRESS.plant[2])
  await page.clock.runFor(1600)
  await expect(line).toHaveText(PROGRESS.plant[0]) // and round again
})

test('saving confirms with a pop: Plant, Food and Snap Buy', async ({ page }) => {
  await mockPlantApi(page)
  await mockFoodApi(page)
  await mockBuyApi(page)
  await openTool(page, 'Plant Scan')
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  await page.getByRole('button', { name: 'Save to My Plants' }).click()
  await expect(page.locator('.btn.done')).toHaveText(/Saved to My Plants/)

  await page.locator('.tabs').getByText('Extras').click()
  await page.getByText('Food Scan').first().click()
  await page.locator('#food-pick').setInputFiles(PAPER_PNG)
  await page.getByRole('button', { name: 'Add to today' }).click()
  await expect(page.locator('.btn.done')).toHaveText(/Added to today/)

  await page.locator('.tabs').getByText('Snap Buy').click()
  await page.getByRole('button', { name: 'Type it' }).click()
  await page.locator('#buy-query').fill('Sony WH-1000XM5 headphones')
  await page.getByRole('button', { name: 'Find best price' }).click()
  await expect(page.locator('.content > .reveal .rec')).toBeVisible()
  await page.getByRole('button', { name: 'Track this price' }).click()
  await expect(page.locator('.btn.done')).toHaveText(/Tracking this price/)
})

test('picking a theme cross-fades, briefly, then the class is gone', async ({ page }) => {
  await page.goto('/')
  expect(await fading(page)).toBe(false) // the first paint is not faded
  await page.getByLabel('Choose theme').click()
  await page.getByRole('button', { name: /^Nature,/ }).click()
  await page.locator('.theme', { hasText: 'Ocean' }).click()
  expect(await fading(page)).toBe(true)
  await expect.poll(fading.bind(null, page)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-skin'))).toBe('ocean')
})

test('one press token for everything you tap', async ({ page }) => {
  await page.goto('/')
  const press = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--press').trim())
  expect(press).toBe('.12s')
  const rules = await page.evaluate(() => {
    const out = []
    for (const sheet of document.styleSheets) {
      let list = []
      try { list = [...sheet.cssRules] } catch { continue }
      for (const r of list) if (r.selectorText && r.selectorText.includes(':active') && r.style.transitionDuration.includes('var(--press)')) out.push(r.selectorText)
    }
    return out.join(' ')
  })
  for (const s of ['.btn:active', '.chip:active', '.tile:active', '.tool-main:active', '.star:active', '.tabs button:active .ico']) expect(rules).toContain(s)
})

test.describe('with less motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, the check is drawn, and themes change without a fade', async ({ page }) => {
    await mockPlantApi(page, [], { ...MONSTERA, health: { status: 'healthy', summary: 'Looking good.', issues: [] } })
    await openTool(page, 'Plant Scan')
    await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
    await expect(page.locator('.content > .reveal')).toBeVisible()
    expect(await anim(page, '.content > .reveal > :first-child')).toBe('none')
    expect(await anim(page, '.reveal .banner.ok > .b-ico path')).toBe('none')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.reveal .banner.ok > .b-ico path')).strokeDashoffset)).toBe('0px')

    await page.getByLabel('Choose theme').click()
    await page.getByRole('button', { name: /^Nature,/ }).click()
    await page.locator('.theme', { hasText: 'Ocean' }).click()
    expect(await fading(page)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toBe('0s')
  })
})
