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

const HOLIDAY_THEMES = [
  ['newyear', "New Year's", 'fall'], ['lunar', 'Lunar New Year', 'fall'], ['valentine', "Valentine's Day", 'rise'], ['stpatrick', "St. Patrick's Day", 'fall'],
  ['easter', 'Easter', 'fall'], ['eid', 'Eid', 'rise'], ['july4', '4th of July', 'rise'], ['diwali', 'Diwali', 'rise'],
  ['thanksgiving', 'Thanksgiving', 'fall'], ['hanukkah', 'Hanukkah', 'fall'], ['christmas', 'Christmas', 'fall'],
]

test('the picker sorts themes into Everyday, Nature, Fun and Holidays', async ({ page }) => {
  await page.getByLabel('Choose theme').click()
  await expect(page.locator('.theme-group h3')).toHaveText(['Everyday', 'Nature', 'Fun', 'Holidays'])
  const names = (group) => page.locator(`.theme-group[aria-label="${group}"] .theme b`).allTextContents()
  expect(await names('Everyday')).toEqual(['Match device', 'Light', 'Dark'])
  expect(await names('Nature')).toEqual(['Ocean', 'Forest', 'Sunset'])
  expect(await names('Fun')).toEqual(['Science', 'Tropical'])
  // in the order the year brings them round, with Halloween in its place
  expect(await names('Holidays')).toEqual([
    "New Year's", 'Lunar New Year', "Valentine's Day", "St. Patrick's Day", 'Easter', 'Eid', '4th of July', 'Halloween', 'Diwali', 'Thanksgiving', 'Hanukkah', 'Christmas',
  ])
})

for (const [id, name, motion] of HOLIDAY_THEMES) {
  test(`holiday theme: ${name}`, async ({ page }) => {
    await pick(page, name)
    expect(await page.evaluate(() => document.documentElement.dataset.skin)).toBe(id)
    await expect(page.locator(`.hpart.${motion}`)).toHaveCount(12)
    // the theme really changes the colours, and the logo becomes the holiday's emoji
    const page_bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(page_bg).not.toBe('rgb(243, 246, 241)')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.logo-mark'), '::after').content)).not.toBe('none')
    // it moves, and is gone on the next theme
    const top = () => page.evaluate(() => document.querySelector('.hpart').getBoundingClientRect().top)
    const before = await top()
    await page.waitForTimeout(1200)
    const after = await top()
    if (motion === 'fall') expect(after).toBeGreaterThan(before)
    else expect(after).toBeLessThan(before)
    await pick(page, 'Ocean')
    await expect(page.locator('.hpart')).toHaveCount(0)
  })
}

test('holiday particles stop for people who ask for less motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await blockFonts(page)
  await page.goto('/')
  await pick(page, 'Christmas')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hparts')).display)).toBe('none')
  await ctx.close()
})
