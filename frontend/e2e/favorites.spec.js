import { expect, test } from '@playwright/test'
import { blockFonts } from './support/mocks.js'

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await page.goto('/')
})

const slots = (page) => page.locator('.tabs button')
const names = async (page) => (await slots(page).allInnerTexts()).map((t) => t.trim())
const openExtras = (page) => page.locator('.tabs button', { hasText: 'Extras' }).click()
const star = (page, title) => page.getByRole('button', { name: new RegExp(`${title} (to|from) favorites`) })

test('the bottom bar starts with Solve and Snap Buy in the two favourite slots', async ({ page }) => {
  expect(await names(page)).toEqual(['Solve', 'Snap Buy', 'Extras', 'History'])
})

test('Extras lists every scanner, with the current favourites starred', async ({ page }) => {
  await openExtras(page)
  for (const t of ['Math Solver', 'Snap Buy', 'Plant Scan', 'Food Scan', 'Species Scan']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible()
  await expect(star(page, 'Math Solver')).toHaveAttribute('aria-pressed', 'true')
  await expect(star(page, 'Snap Buy')).toHaveAttribute('aria-pressed', 'true')
  await expect(star(page, 'Plant Scan')).toHaveAttribute('aria-pressed', 'false')
})

test('starring a third scanner replaces the oldest, and the slot opens that scanner', async ({ page }) => {
  await openExtras(page)
  await star(page, 'Plant Scan').click()
  await expect(page.getByRole('status')).toContainText('Plant Scan is pinned to the bottom bar. Math Solver was replaced.')
  expect(await names(page)).toEqual(['Snap Buy', 'Plant', 'Extras', 'History'])
  await expect(star(page, 'Math Solver')).toHaveAttribute('aria-pressed', 'false')

  await slots(page).filter({ hasText: 'Plant' }).click()
  await expect(page.getByRole('heading', { name: 'Scan a plant' })).toBeVisible()
  await expect(slots(page).filter({ hasText: 'Plant' })).toHaveClass(/on/)
  await expect(slots(page).filter({ hasText: 'Extras' })).not.toHaveClass(/on/)

  // the Extras button goes back to the list, and Solve is still reachable from it
  await openExtras(page)
  await expect(page.getByRole('heading', { name: 'Extras' })).toBeVisible()
  await page.getByRole('button', { name: /Math Solver/ }).first().click()
  await expect(page.locator('.snap-btn, .snap').first()).toBeVisible()
})

test('unpinning leaves an empty slot that takes you to Extras, and the choice is remembered', async ({ page }) => {
  await openExtras(page)
  await star(page, 'Snap Buy').click()
  await star(page, 'Math Solver').click()
  expect(await names(page)).toEqual(['Favorite', 'Favorite', 'Extras', 'History'])

  await star(page, 'Species Scan').click()
  expect(await names(page)).toEqual(['Species', 'Favorite', 'Extras', 'History'])

  await page.reload()
  expect(await names(page)).toEqual(['Species', 'Favorite', 'Extras', 'History'])
  await slots(page).filter({ hasText: 'Favorite' }).click()
  await expect(page.getByRole('heading', { name: 'Extras' })).toBeVisible()
})

test('Snap Buy opens from its card in Extras', async ({ page }) => {
  await openExtras(page)
  await page.getByRole('button', { name: /Snap Buy/ }).first().click()
  await expect(page.getByRole('button', { name: 'Scan barcode' }).or(page.getByText('Scan barcode')).first()).toBeVisible()
})
