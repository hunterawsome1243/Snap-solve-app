import { expect, test } from '@playwright/test'
import { blockFonts, mockPlantApi, PAPER_PNG } from './support/mocks.js'

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
})

async function openPlants(page) {
  await page.goto('/')
  await page.locator('.tabs').getByText('Extras').click()
  await page.getByText('Plant Scan').first().click()
}

test('extras tab: scan a plant, read the result, save it, and keep track of watering', async ({ page }) => {
  const calls = []
  await mockPlantApi(page, calls)
  await openPlants(page)
  await page.getByLabel('Anything wrong with it? (optional)').fill('yellow leaves')
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)

  await expect(page.getByRole('heading', { name: 'Monstera' })).toBeVisible()
  expect(calls[0]).toEqual(['plant', 'yellow leaves'])
  await expect(page.getByText('Likely', { exact: true })).toBeVisible() // medium confidence is labelled, not shown as certain
  await expect(page.getByText('Needs attention.')).toBeVisible()
  await expect(page.getByText('Yellow leaf')).toBeVisible()
  await expect(page.getByText('Let the top of the soil dry out.')).toBeVisible()
  await expect(page.getByText('Toxic to pets')).toBeVisible()
  await expect(page.getByText('Could also be')).toBeVisible()

  await page.getByRole('button', { name: 'Save to My Plants' }).click()
  await expect(page.getByRole('button', { name: 'Saved to My Plants' })).toBeDisabled()
  await page.getByRole('button', { name: 'Scan another' }).click()

  const mine = page.getByTestId('my-plants')
  await expect(mine.getByText('Monstera')).toBeVisible()
  await expect(mine.getByText('Water in 7 days')).toBeVisible()

  // it is remembered after a reload, and can be edited and removed
  await page.reload()
  await page.locator('.tabs').getByText('Extras').click()
  await expect(page.getByText('1 saved plant')).toBeVisible()
  await page.getByText('Plant Scan').first().click()
  await mine.getByText('Edit').click()
  await mine.getByLabel('Water every').fill('3')
  await expect(mine.getByText('Water in 3 days')).toBeVisible()
  await mine.getByRole('button', { name: 'Mark Monstera watered' }).click()
  await expect(mine.getByText('Water in 3 days')).toBeVisible() // a fresh watering restarts the count
  await mine.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('my-plants')).toHaveCount(0)
})

test('a photo with no plant in it asks for a better one instead of guessing', async ({ page }) => {
  await mockPlantApi(page, [], { is_plant: false, message: 'I could not see a plant. Try a closer photo.' })
  await openPlants(page)
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('closer photo')
  await expect(page.getByRole('heading', { name: 'Scan a plant' })).toBeVisible()
})

test('a server error is shown, not swallowed', async ({ page }) => {
  await page.route('**/api/plant/scan', (r) => r.fulfill({ status: 502, json: { detail: 'Anthropic API error: overloaded' } }))
  await openPlants(page)
  await page.locator('#plant-pick').setInputFiles(PAPER_PNG)
  await expect(page.getByRole('alert')).toContainText('overloaded')
})
