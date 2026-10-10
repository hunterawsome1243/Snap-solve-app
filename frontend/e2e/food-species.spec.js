import { expect, test } from '@playwright/test'
import { blockFonts, mockFoodApi, mockSpeciesApi, PAPER_PNG } from './support/mocks.js'

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
})

async function open(page, tool) {
  await page.goto('/')
  await page.locator('.tabs').getByText('Extras').click()
  await page.getByText(tool).first().click()
}

test('extras lists all three tools', async ({ page }) => {
  await page.goto('/')
  await page.locator('.tabs').getByText('Extras').click()
  for (const t of ['Plant Scan', 'Food Scan', 'Species Scan']) await expect(page.getByText(t).first()).toBeVisible()
})

test('food scan: estimate, allergens, and a daily log that is remembered', async ({ page }) => {
  const calls = []
  await mockFoodApi(page, calls)
  await open(page, 'Food Scan')
  await page.getByLabel('Anything to know? (optional)').fill('one slice')
  await page.locator('#food-pick').setInputFiles(PAPER_PNG)

  await expect(page.getByRole('heading', { name: 'Cheese pizza slice' })).toBeVisible()
  expect(calls[0]).toEqual(['food', 'one slice'])
  await expect(page.getByText('Rough estimate')).toBeVisible() // medium confidence is labelled, not shown as certain
  await expect(page.locator('.kcal')).toContainText('285')
  await expect(page.getByText('Protein')).toBeVisible()
  await expect(page.locator('.chip.allergen')).toHaveText(['milk', 'wheat'])
  await expect(page.getByText('not medical advice')).toBeVisible()

  await page.getByRole('button', { name: 'Add to today' }).click()
  await expect(page.getByRole('button', { name: 'Added to today' })).toBeDisabled()
  await page.getByRole('button', { name: 'Scan another' }).click()
  const log = page.getByTestId('food-log')
  await expect(log).toContainText('285 cal')

  await page.reload()
  await page.locator('.tabs').getByText('Extras').click()
  await expect(page.getByText('285 cal today')).toBeVisible()
  await page.getByText('Food Scan').first().click()
  await page.getByTestId('food-log').getByRole('button', { name: 'Remove Cheese pizza slice' }).click()
  await expect(page.getByTestId('food-log')).toHaveCount(0)
})

test('food scan: a photo with no food asks for a better one', async ({ page }) => {
  await mockFoodApi(page, [], { is_food: false, message: 'I could not see any food. Try a closer photo.' })
  await open(page, 'Food Scan')
  await page.locator('#food-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('closer photo')
  await expect(page.getByRole('heading', { name: 'Scan your food' })).toBeVisible()
})

test('species scan: name, danger and look-alikes', async ({ page }) => {
  const calls = []
  await mockSpeciesApi(page, calls)
  await open(page, 'Species Scan')
  await page.getByLabel('Where was it? (optional)').fill('my garden')
  await page.locator('#species-pick').setInputFiles(PAPER_PNG)

  await expect(page.getByRole('heading', { name: 'Monarch butterfly' })).toBeVisible()
  expect(calls[0]).toEqual(['species', 'my garden'])
  await expect(page.getByText('Likely', { exact: true })).toBeVisible()
  await expect(page.getByText('Insect', { exact: true })).toBeVisible()
  await expect(page.getByText('Generally harmless.')).toBeVisible()
  await expect(page.getByText('Could also be')).toBeVisible()
  await expect(page.getByText('Endangered')).toBeVisible()
  await page.getByRole('button', { name: 'Scan another' }).click()
  await expect(page.getByRole('heading', { name: 'Identify a species' })).toBeVisible()
})

test('species scan: a fungus always carries the never-eat warning, and a dangerous animal says so', async ({ page }) => {
  await mockSpeciesApi(page, [], { ...(await import('./support/mocks.js')).MONARCH, name: 'Fly agaric', group: 'fungus', danger: { level: 'unknown', note: 'Cannot be judged from a photo.' } })
  await open(page, 'Species Scan')
  await page.locator('#species-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByText('Never eat or taste a mushroom')).toBeVisible()
  await expect(page.getByText('Danger unknown. Keep your distance.')).toBeVisible()
})

test('species scan: nothing found asks for a better photo; server errors are shown', async ({ page }) => {
  await mockSpeciesApi(page, [], { found: false, message: 'I could not see an animal. Try a closer photo.' })
  await open(page, 'Species Scan')
  await page.locator('#species-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('closer photo')

  await page.unroute('**/api/species/scan')
  await page.route('**/api/species/scan', (r) => r.fulfill({ status: 502, json: { detail: 'Anthropic API error: overloaded' } }))
  await page.locator('#species-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('overloaded')
})
