import { expect, test } from '@playwright/test'
import { blockFonts } from './support/mocks.js'

// which category each theme lives in (the picker shows categories first, then a wider view of one)
const CATEGORY_OF = {
  'Match device': 'Everyday', Light: 'Everyday', Dark: 'Everyday', Ocean: 'Nature', Forest: 'Nature', Sunset: 'Nature',
  Science: 'Fun', Tropical: 'Fun', Halloween: 'Holidays',
}
async function pick(page, name) {
  await page.getByLabel('Choose theme').click()
  await page.getByRole('button', { name: new RegExp(`^${CATEGORY_OF[name] || 'Holidays'},`) }).click()
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
  ['easter', 'Easter', 'fall'], ['july4', '4th of July', 'rise'], ['thanksgiving', 'Thanksgiving', 'fall'], ['christmas', 'Christmas', 'fall'],
]

test('the picker shows four categories, and a category opens a wider view of its themes', async ({ page }) => {
  await page.getByLabel('Choose theme').click()
  // compact: only the categories, no individual themes yet
  await expect(page.locator('.cat-card b')).toHaveText(['Everyday', 'Nature', 'Fun', 'Holidays'])
  await expect(page.locator('.theme')).toHaveCount(0)
  const open = (cat) => page.getByRole('button', { name: new RegExp(`^${cat},`) }).click()
  const names = () => page.locator('.themes.wide .theme b').allTextContents()
  await open('Everyday'); expect(await names()).toEqual(['Match device', 'Light', 'Dark'])
  await page.getByRole('button', { name: 'Themes' }).click()
  await open('Nature'); expect(await names()).toEqual(['Ocean', 'Forest', 'Sunset'])
  await page.getByRole('button', { name: 'Themes' }).click()
  await open('Fun'); expect(await names()).toEqual(['Science', 'Tropical'])
  await page.getByRole('button', { name: 'Themes' }).click()
  // in the order the year brings them round, with Halloween in its place (and no Eid, Diwali or Hanukkah)
  await open('Holidays')
  expect(await names()).toEqual(["New Year's", 'Lunar New Year', "Valentine's Day", "St. Patrick's Day", 'Easter', '4th of July', 'Halloween', 'Thanksgiving', 'Christmas'])
  // the wider view really is wider: its tiles are bigger than the small swatches were
  expect((await page.locator('.themes.wide .theme').first().boundingBox()).width).toBeGreaterThan(130)
})

test('the category you are using says so, and the picker starts at the categories each time', async ({ page }) => {
  await pick(page, 'Christmas')
  await page.getByLabel('Choose theme').click()
  await expect(page.getByRole('button', { name: /^Holidays,/ })).toContainText('Using Christmas')
  await expect(page.getByRole('button', { name: /^Nature,/ })).toContainText('3 themes')
  await page.getByRole('button', { name: /^Nature,/ }).click()
  await page.getByLabel('Choose theme').click() // close
  await page.getByLabel('Choose theme').click() // open again: back at the categories
  await expect(page.locator('.cat-card')).toHaveCount(4)
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

// "In season": the badge follows today's date. The clock is set, so these do not depend on when they run.
async function openPickerOn(page, date) {
  await page.clock.setFixedTime(new Date(date))
  await page.goto('/')
  await page.getByLabel('Choose theme').click()
}

test('in season: the Holidays card and the matching theme carry a badge', async ({ page }) => {
  await openPickerOn(page, '2026-12-10T12:00:00')
  await expect(page.locator('.season-badge')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Holidays,/ }).locator('.season-badge')).toHaveText('In season')
  await expect(page.getByRole('button', { name: /^Nature,/ }).locator('.season-badge')).toHaveCount(0)
  await page.getByRole('button', { name: /^Holidays,/ }).click()
  await expect(page.locator('.theme .season-badge')).toHaveCount(1)
  await expect(page.locator('.theme', { hasText: 'Christmas' }).locator('.season-badge')).toHaveText('In season')
  await expect(page.locator('.theme', { hasText: 'Easter' }).locator('.season-badge')).toHaveCount(0)
  // the badge doesn't change the theme's name
  expect(await page.locator('.themes.wide .theme b').allTextContents()).toContain('Christmas')
})

test('in season: it moves with the calendar, including holidays that move', async ({ page }) => {
  await openPickerOn(page, '2026-03-30T12:00:00') // Easter 2026 is April 5
  await page.getByRole('button', { name: /^Holidays,/ }).click()
  await expect(page.locator('.theme', { hasText: 'Easter' }).locator('.season-badge')).toHaveCount(1)
  await expect(page.locator('.theme .season-badge')).toHaveCount(1)
})

test('in season: nothing is marked when no holiday is near', async ({ page }) => {
  await openPickerOn(page, '2026-08-20T12:00:00')
  await expect(page.locator('.season-badge')).toHaveCount(0)
})
