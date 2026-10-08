// Fake backend for the browser tests: every /api call is answered here, so no API key or network is needed.
import path from 'node:path'

export const TMP = path.resolve('e2e/.tmp')
export const PAPER_PNG = path.join(TMP, 'paper.png')
export const EAN_PNG = path.join(TMP, 'ean.png')

export const blockFonts = (page) => page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }))

const solved = (latex, extra = {}) => ({
  answer_latex: 'x = 3',
  answer_text: '',
  steps: [
    { latex, explain: 'Start.', check: 'unchecked' },
    { latex: '2x = 6', explain: 'Subtract 5.', check: 'ok' },
    { latex: '2x = 7', explain: 'Oops.', check: 'bad' },
    { latex: 'x = 3', explain: 'Divide by 2.', check: 'ok' },
  ],
  steps_summary: { checked: 3, bad: [2] },
  check: { steps: [{ latex: '2(3)+5=11', explain: 'Works.' }], conclusion: 'Both sides are 11.' },
  verification: { status: 'match', detail: '' },
  kind: 'solve',
  graph: { series: [{ label: 'y = 2x + 5', expr: '2*x+5' }, { label: 'y = 11', expr: '11' }], points: [{ x: '3', series: 0, label: 'x = 3' }], shade: null, xmin: -2, xmax: 8 },
  ...extra,
})

/** Math endpoints. `calls` collects what the page sent. */
export async function mockMathApi(page, calls = []) {
  await page.route('**/api/read', (r) => r.fulfill({ json: {
    readable: true, latex: '2x+S=11', uncertain: [{ text: 'S', alternatives: ['5', 's'] }], message: '',
    problems: [
      { kind: 'math', latex: '2x+S=11', text: '', uncertain: [{ text: 'S', alternatives: ['5', 's'] }] },
      { kind: 'math', latex: 'x^2-5x+6=0', text: '', uncertain: [] },
      { kind: 'word', latex: '', text: 'Sam has 3 more apples than Ann; together they have 15.', uncertain: [] },
    ],
  } }))
  await page.route('**/api/solve', (r) => {
    const b = JSON.parse(r.request().postData())
    calls.push(['solve', b.latex, b.context])
    r.fulfill({ json: solved(b.latex, b.context ? { answer_text: 'Ann has 6 apples.' } : {}) })
  })
  await page.route('**/api/formulate', (r) => r.fulfill({ json: {
    variables: [{ name: 'x', meaning: "Ann's apples" }], equation_latex: 'x+(x+3)=15', question: 'How many apples does Ann have?', message: '',
  } }))
  await page.route('**/api/practice/check', (r) => {
    const b = JSON.parse(r.request().postData())
    r.fulfill({ json: { correct: /2/.test(b.answer) && /3/.test(b.answer), detail: '', correct_latex: 'x = 2,\\ 3' } })
  })
  await page.route('**/api/practice', (r) => {
    const b = JSON.parse(r.request().postData())
    calls.push(['practice', b.difficulty, b.topic, b.latex])
    r.fulfill({ json: { latex: 'x^2-5x+6=0', hint: 'Try factoring.', problem: { kind: 'solve', equation: 'x^2-5*x+6=0', variable: 'x' }, difficulty: b.difficulty, topic: b.topic } })
  })
}

const offer = (retailer, price, over = {}) => ({
  retailer, price, currency: 'USD', url: `https://${retailer}/x`, condition: 'new', in_stock: 'yes',
  free_shipping: 'unknown', note: '', seen: '', recommended: false, ...over,
})

/** Snap Buy endpoints with a price you can change between re-checks. */
export async function mockBuyApi(page, state = { price: 278, checkedAt: Math.floor(Date.now() / 1000) }, calls = []) {
  const raw = (q) => {
    const offers = [
      offer('bestbuy.com', state.price, { free_shipping: 'yes', recommended: true, seen: '2 days ago' }),
      offer('amazon.com', 299.99),
      offer('ebay.com', 210, { condition: 'refurbished' }),
      offer('target.com', 305, { free_shipping: 'no' }),
    ].sort((a, b) => a.price - b.price)
    return {
      query: q, offers, likely_stores: [], summary: '', compare: [{ name: 'Google Shopping', url: 'https://g/x' }], checked_at: state.checkedAt,
      recommendation: { kind: 'offer', retailer: 'bestbuy.com', price: state.price, currency: 'USD', url: 'https://bestbuy.com/x', in_stock: 'yes', reason: 'Best deal you can actually get.' },
    }
  }
  await page.route('**/api/buy/prices', (r) => {
    const b = JSON.parse(r.request().postData())
    calls.push(['prices', b.query])
    r.fulfill({ json: raw(b.query) })
  })
  await page.route('**/api/buy/rank', (r) => {
    const b = JSON.parse(r.request().postData())
    calls.push(['rank', b.filters])
    const f = b.filters
    const offers = b.offers.filter((o) => (!f.new_only || o.condition === 'new') && (!f.free_shipping || o.free_shipping === 'yes') && (f.max_price == null || o.price <= f.max_price))
    const rec = offers.length ? { kind: 'offer', retailer: offers.find((o) => o.condition === 'new')?.retailer || offers[0].retailer, price: offers[0].price, currency: 'USD', url: offers[0].url, in_stock: 'yes', reason: 'ranked' } : null
    r.fulfill({ json: { offers: offers.map((o) => ({ ...o, recommended: !!rec && o.url === rec.url })), hidden: b.offers.length - offers.length, recommendation: rec } })
  })
  await page.route('**/api/buy/identify', (r) => r.fulfill({ json: { identifiable: true, name: 'X', brand: '', model: '', category: '', query: 'Sony WH-1000XM5 headphones', message: '' } }))
}

export const MONSTERA = {
  is_plant: true, message: '', name: 'Monstera', scientific: 'Monstera deliciosa', confidence: 'medium', kind: 'houseplant',
  alternatives: [{ name: 'Philodendron', scientific: 'Philodendron bipinnatifidum' }],
  health: { status: 'needs_attention', summary: 'One lower leaf is yellowing.', issues: [
    { name: 'Yellow leaf', signs: 'one lower leaf', cause: 'too much water', fix: 'Let the top of the soil dry out.', severity: 'mild' }] },
  care: { light: 'Bright, indirect', water: 'When the top 5 cm is dry', water_every_days: 7, soil: 'Airy mix', temperature: '18-27 C', humidity: 'Average', feeding: 'Monthly in summer' },
  pets: { status: 'toxic', note: 'Toxic to cats and dogs.' }, fun_fact: 'The holes in the leaves are called fenestrations.', photo_tips: '',
}

/** Plant Scan endpoint. `reply` can be changed per test; `calls` collects what the page sent. */
export async function mockPlantApi(page, calls = [], reply = MONSTERA) {
  await page.route('**/api/plant/scan', (r) => {
    const b = JSON.parse(r.request().postData())
    calls.push(['plant', b.note])
    r.fulfill({ json: reply })
  })
}
