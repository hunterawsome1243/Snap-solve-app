import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { blockFonts, mockMathApi, PAPER_PNG } from './support/mocks.js'

let calls
test.beforeEach(async ({ page }) => {
  calls = []
  await blockFonts(page)
  await mockMathApi(page, calls)
  await page.goto('/')
})

// photo -> crop -> read (the live camera is covered in scanner.spec.js)
async function snapAndRead(page) {
  await page.setInputFiles('input[capture]', PAPER_PNG)
  await page.locator('.crop-box').waitFor()
  await page.getByRole('button', { name: 'Read equation' }).click()
}

async function editFirstAndSolve(page) {
  await snapAndRead(page)
  await page.getByRole('heading', { name: '3 problems found' }).waitFor()
  await page.getByRole('button', { name: 'Edit & solve' }).first().click()
  await page.locator('.tokens').waitFor()
  await page.locator('.tok.flag').click()
  await page.locator('.fix-panel .chip', { hasText: '5' }).click()
  await page.locator('.btn.primary', { hasText: 'Solve' }).click()
  await page.locator('.answer').first().waitFor()
}

test('lists every problem found in one photo', async ({ page }) => {
  await snapAndRead(page)
  await expect(page.getByRole('heading', { name: '3 problems found' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Solve all \(2\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Turn into equation' })).toBeVisible()
})

test('tap-to-fix: the unsure symbol is flagged and replaced from the suggestions', async ({ page }) => {
  await snapAndRead(page)
  await page.getByRole('button', { name: 'Edit & solve' }).first().click()
  await expect(page.locator('.tok.flag')).toHaveCount(1)
  await page.locator('.tok.flag').click()
  await expect(page.locator('.fix-title')).toContainText('5')
  await page.locator('.fix-panel .chip', { hasText: '5' }).click()
  await expect(page.locator('#latex')).toHaveValue('2x+5=11')
  await expect(page.locator('.tok.flag')).toHaveCount(0)
})

test('shows a graph with the solution marked, and a flag on the line a calculator disagrees with', async ({ page }) => {
  await editFirstAndSolve(page)
  await expect(page.locator('svg.graph')).toBeVisible()
  await expect(page.locator('svg.graph path')).toHaveCount(2)
  await expect(page.locator('svg.graph circle')).toHaveCount(1)
  await expect(page.locator('.chk.ok')).toHaveCount(2)
  await expect(page.locator('.chk.bad')).toHaveCount(1)
  await expect(page.locator('.banner.warn')).toContainText('line 3')
  expect(calls.find((c) => c[0] === 'solve')[1]).toBe('2x+5=11')
})

test('saves the solution as an image and as a PDF', async ({ page }) => {
  await editFirstAndSolve(page)
  const png = page.waitForEvent('download')
  await page.getByRole('button', { name: /Save as image/ }).click()
  const pngFile = fs.readFileSync(await (await png).path())
  expect(pngFile.subarray(1, 4).toString()).toBe('PNG')
  expect(pngFile.length).toBeGreaterThan(5_000)

  const pdf = page.waitForEvent('download')
  await page.getByRole('button', { name: /Save as PDF/ }).click()
  const pdfFile = fs.readFileSync(await (await pdf).path())
  expect(pdfFile.subarray(0, 4).toString()).toBe('%PDF')
  expect(pdfFile.length).toBeGreaterThan(5_000)
})

test('solves all problems at once', async ({ page }) => {
  await snapAndRead(page)
  await page.getByRole('button', { name: /Solve all/ }).click()
  await expect(page.locator('.status.done')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'All solved' })).toBeDisabled()
})

test('word problem: shows the equation next to the story, then answers in words', async ({ page }) => {
  await snapAndRead(page)
  await page.getByRole('button', { name: 'Turn into equation' }).click()
  await expect(page.getByRole('heading', { name: 'Does this equation match the story?' })).toBeVisible()
  await expect(page.locator('#latex')).toHaveValue('x+(x+3)=15')
  await page.locator('.btn.primary', { hasText: 'Solve' }).click()
  await expect(page.locator('.answer-text')).toHaveText('Ann has 6 apples.')
  expect(calls.find((c) => c[0] === 'solve')[2]).toContain("x = Ann's apples")
})

test('practice: hint on demand, wrong answer resets the streak, a clean solve grows it', async ({ page }) => {
  await editFirstAndSolve(page)
  await page.getByRole('button', { name: /Practice similar/ }).click()
  await page.locator('#ans').waitFor()
  expect(calls.find((c) => c[0] === 'practice')).toEqual(['practice', 'medium', 'mixed', '2x+5=11'])
  await expect(page.getByText('Try factoring.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show hint' }).click()
  await expect(page.getByText('Try factoring.')).toBeVisible()

  await page.locator('#ans').fill('5')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText('Not quite')).toBeVisible()
  await page.locator('#ans').fill('x = 2 or x = 3')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText(/Correct/)).toBeVisible()
  await expect(page.locator('.streak b')).toHaveText('0')

  await page.getByRole('button', { name: 'Hard' }).click()
  await page.locator('#ans').waitFor()
  expect(calls.some((c) => c[0] === 'practice' && c[1] === 'hard')).toBe(true)
  await page.locator('#ans').fill('2, 3')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByText(/Correct/)).toBeVisible()
  await expect(page.locator('.streak b')).toHaveText('1')
})
