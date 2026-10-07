import { expect, test } from '@playwright/test'
import { blockFonts } from './support/mocks.js'

async function pick(page, name) {
  await page.getByLabel('Choose theme').click()
  await page.locator('.theme', { hasText: name }).click()
  await page.getByLabel('Choose theme').click()
}

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await page.goto('/')
})

test('the app is called Hunter Scan', async ({ page }) => {
  await expect(page).toHaveTitle('Hunter Scan')
  await expect(page.locator('.logo')).toHaveText(/Hunter Scan/)
})

test('halloween: pumpkins fall, and are gone on another theme', async ({ page }) => {
  await pick(page, 'Halloween')
  await expect(page.locator('.pumpkin')).toHaveCount(11)
  const top = () => page.evaluate(() => document.querySelector('.pumpkin').getBoundingClientRect().top)
  const before = await top()
  await page.waitForTimeout(1200)
  expect(await top()).toBeGreaterThan(before)
  await pick(page, 'Ocean')
  await expect(page.locator('.pumpkin')).toHaveCount(0)
})

test('science: element tiles rise, the camera button has a laser, the logo is an atom', async ({ page }) => {
  await pick(page, 'Science')
  expect(await page.evaluate(() => document.documentElement.dataset.skin)).toBe('science')
  await expect(page.locator('.element')).toHaveCount(13)
  const top = () => page.evaluate(() => document.querySelector('.element').getBoundingClientRect().top)
  const before = await top()
  await page.waitForTimeout(1500)
  expect(await top()).toBeLessThan(before)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.snap-btn'), '::after').animationName)).toBe('laser')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.logo-mark'), '::after').content)).toContain('⚛')
})

test('tropical: fruit drifts down, the logo is a pineapple, and it goes away on another theme', async ({ page }) => {
  await pick(page, 'Tropical')
  expect(await page.evaluate(() => document.documentElement.dataset.skin)).toBe('tropical')
  await expect(page.locator('.fruit')).toHaveCount(11)
  const top = () => page.evaluate(() => document.querySelector('.fruit').getBoundingClientRect().top)
  const before = await top()
  await page.waitForTimeout(1200)
  expect(await top()).toBeGreaterThan(before)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.logo-mark'), '::after').content)).toContain('🍍')
  await pick(page, 'Ocean')
  await expect(page.locator('.fruit')).toHaveCount(0)
})

test('motion is switched off for people who ask for less of it', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await blockFonts(page)
  await page.goto('/')
  await pick(page, 'Halloween')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pumpkins')).display)).toBe('none')
  await pick(page, 'Science')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.elements')).display)).toBe('none')
  await ctx.close()
})

test('the chosen theme is remembered', async ({ page }) => {
  await pick(page, 'Forest')
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.skin)).toBe('forest')
})
