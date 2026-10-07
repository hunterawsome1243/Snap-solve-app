// Tests the single-file phone artifact (artifact/hunter-scan.html) with a faked Claude runtime:
// window.claude.use('sample') answers prompts, use('downloads') records saves. Libraries that the real page loads
// from a CDN are served from node_modules, so nothing here touches the network.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { blockFonts, EAN_PNG, PAPER_PNG } from './support/mocks.js'

const NM = path.resolve('node_modules')
const PAGE = fs.readFileSync(path.resolve('../artifact/hunter-scan.html'), 'utf8')
const HTML = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${PAGE}</body></html>`
const js = (file) => ({ contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') })

// What the fake Claude says. Runs inside the page before the app starts.
function fakeRuntime() {
  window.__saved = []
  window.__practiceCall = 0
  const sample = async () => ({ text: '' })
  sample.limits = async () => ({ images: { maxCount: 1, mediaTypes: ['image/jpeg'] } })
  sample.json = async (prompt) => {
    await new Promise((r) => setTimeout(r, 60))
    if (prompt.startsWith('You transcribe')) {
      return { readable: true, message: '', problems: [
        { kind: 'math', latex: '2x+S=11', text: '', uncertain: [{ text: 'S', alternatives: ['5', 's'] }] },
        { kind: 'math', latex: 'x^2-5x+6=0', text: '', uncertain: [] },
        { kind: 'word', latex: '', text: 'Sam has 3 more apples than Ann; together they have 15.' },
      ] }
    }
    if (prompt.startsWith('You turn a word')) return { variables: [{ name: 'x', meaning: "Ann's apples" }], equation_latex: 'x+(x+3)=15', question: 'How many apples does Ann have?', message: '' }
    if (prompt.startsWith('You write practice')) {
      window.__practiceCall++
      return window.__practiceCall === 1
        ? { latex: 'x^2-5x+6=0', hint: 'Try factoring.', problem: { kind: 'solve', equation: 'x^2-5*x+6=0', variable: 'x' }, answer: { values: ['2', '3'] }, answer_latex: 'x = 2,\\ 3' }
        : { latex: 'x^2-7x+12=0', hint: 'Factor.', problem: { kind: 'solve', equation: 'x^2-7*x+12=0', variable: 'x' }, answer: { values: ['3', '4'] }, answer_latex: 'x = 3,\\ 4' }
    }
    if (prompt.startsWith('You identify')) return { identifiable: true, name: 'X', query: 'Sony WH-1000XM5 headphones', message: '' }
    if (prompt.startsWith('You advise')) return { stores: [{ name: 'Best Buy', why: 'Wide range.' }] }
    const latex = prompt.split('Problem (LaTeX):\n')[1].split('\n')[0]
    if (/Word problem context/.test(prompt)) {
      return { answer_latex: 'x = 6', answer_text: 'Ann has 6 apples.', steps: [
        { latex: 'x+(x+3)=15', explain: 'Set up.', verify: { type: 'equation', expr: 'x+(x+3)=15' } },
        { latex: '2x=12', explain: 'Combine.', verify: { type: 'equation', expr: '2*x=12' } },
        { latex: 'x=6', explain: 'Divide.', verify: { type: 'equation', expr: 'x=6' } }], check: { steps: [], conclusion: 'ok' },
      problem: { kind: 'solve', equation: 'x+(x+3)=15', variable: 'x' }, answer: { values: ['6'] } }
    }
    if (latex.includes('x^2')) return { answer_latex: 'x = 2 \\text{ or } x = 3', steps: [{ latex: 'x^2-5x+6=0', explain: 'Start.' }, { latex: '(x-2)(x-3)=0', explain: 'Factor.', verify: { type: 'equation', expr: '(x-2)*(x-3)=0' } }], check: { steps: [], conclusion: '' }, problem: { kind: 'solve', equation: 'x^2-5*x+6=0', variable: 'x' }, answer: { values: ['2', '3'] } }
    return { answer_latex: 'x = 3', steps: [
      { latex, explain: 'Start.' },
      { latex: '2x = 6', explain: 'Subtract 5.', verify: { type: 'equation', expr: '2*x=6' } },
      { latex: '2x = 7', explain: 'Oops.', verify: { type: 'equation', expr: '2*x=7' } },
      { latex: 'x = 3', explain: 'Divide.', verify: { type: 'equation', expr: 'x=3' } }],
    check: { steps: [{ latex: '2(3)+5=11', explain: 'Works.' }], conclusion: 'ok' }, problem: { kind: 'solve', equation: '2*x+5=11', variable: 'x' }, answer: { values: ['3'] },
    graph: { series: [{ label: 'y = 2x + 5', expr: '2*x+5' }, { label: 'y = 11', expr: '11' }], points: [{ x: '3', series: 0, label: 'x = 3' }], xmin: -2, xmax: 8 } }
  }
  const downloads = { save: async (r) => { window.__saved.push({ filename: r.filename, size: r.data.size, type: r.data.type }); return { status: 'saved' } } }
  window.claude = { use: async (n) => (n === 'sample' ? sample : n === 'downloads' ? downloads : null) }
}

test.beforeEach(async ({ page }) => {
  await blockFonts(page)
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/mathjs/**', (r) => r.fulfill(js(`${NM}/mathjs/lib/browser/math.js`)))
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/**', (r) => r.fulfill(js(`${NM}/html2canvas/dist/html2canvas.min.js`)))
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', (r) => r.fulfill(js(`${NM}/jspdf/dist/jspdf.umd.min.js`)))
  await page.route('https://unpkg.com/@zxing/**', (r) => r.fulfill(js(`${NM}/@zxing/library/umd/index.min.js`)))
  await page.route('http://app.test/', (r) => r.fulfill({ contentType: 'text/html', body: HTML }))
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
  await page.getByRole('button', { name: 'Practice a similar one' }).click()
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
