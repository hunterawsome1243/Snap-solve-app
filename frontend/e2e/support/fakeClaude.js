// Shared by the artifact browser tests and the screenshot script: the page, the fake Claude, and local copies of the CDN libraries.
import fs from 'node:fs'
import path from 'node:path'

const NM = path.resolve('node_modules')
const PAGE = fs.readFileSync(path.resolve('../artifact/hunter-scan.html'), 'utf8')
export const HTML = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${PAGE}</body></html>`
const js = (file) => ({ contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') })

export async function routeArtifact(page) {
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/mathjs/**', (r) => r.fulfill(js(`${NM}/mathjs/lib/browser/math.js`)))
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/**', (r) => r.fulfill(js(`${NM}/html2canvas/dist/html2canvas.min.js`)))
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', (r) => r.fulfill(js(`${NM}/jspdf/dist/jspdf.umd.min.js`)))
  await page.route('https://unpkg.com/@zxing/**', (r) => r.fulfill(js(`${NM}/@zxing/library/umd/index.min.js`)))
  await page.route('http://app.test/', (r) => r.fulfill({ contentType: 'text/html', body: HTML }))
}

// What the fake Claude says. Runs inside the page before the app starts.
export function fakeRuntime() {
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

