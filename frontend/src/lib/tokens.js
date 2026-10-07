// Splits a LaTeX string into tappable tokens and suggests what a misread symbol might really be.

const TOKEN = /\\[a-zA-Z]+|\\.|\d+(?:\.\d+)?|[A-Za-z]|\s+|[\s\S]/g

export function tokenize(latex) {
  const out = []
  for (const m of latex.matchAll(TOKEN)) {
    if (/^\s+$/.test(m[0])) continue
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}

// Handwriting look-alikes, most likely first.
const CONFUSABLE = {
  5: ['S', 's'], S: ['5', 's', '8'], s: ['5', 'S'],
  1: ['l', '7', 'I'], l: ['1', 'I'], I: ['1', 'l'], 7: ['1', 'T'],
  0: ['O', 'o', '6'], O: ['0'], o: ['0', 'a'],
  2: ['z', 'Z'], z: ['2'], Z: ['2'],
  9: ['g', 'q'], g: ['9', 'q'], q: ['9', 'g'],
  6: ['b', 'G', '0'], b: ['6', 'h'],
  8: ['B', '3', 'S'], B: ['8'], 3: ['8', 'B'],
  x: ['\\times', 'X', 'y'], X: ['x', '\\times'], '\\times': ['x', '+'],
  '+': ['t', '\\times', '-'], t: ['+'],
  '-': ['+', '=', '\\div'], '=': ['-', '\\neq'],
  u: ['v', 'n'], v: ['u'], n: ['u', 'h'],
  a: ['o', 'd'], y: ['g', 'x', '4'], 4: ['9', 'y', 'u'],
  '/': ['1', '\\div'], '\\div': ['/', '+', '-'],
}

export function suggestionsFor(token, uncertain = []) {
  const fromModel = uncertain.find((u) => u.text === token)?.alternatives || []
  const all = [...fromModel, ...(CONFUSABLE[token] || [])]
  return [...new Set(all)].filter((s) => s !== token).slice(0, 8)
}

// Which tokens did the model flag? Each flag marks the first not-yet-marked token with that text.
export function flaggedIndexes(tokens, uncertain = []) {
  const used = new Set()
  for (const u of uncertain) {
    const i = tokens.findIndex((t, idx) => t.text === u.text && !used.has(idx))
    if (i >= 0) used.add(i)
  }
  return used
}

export function replaceToken(latex, token, replacement) {
  // keep commands like \times from gluing onto the next letter
  const needsSpace = /^\\[a-zA-Z]+$/.test(replacement) && /^[A-Za-z]/.test(latex.slice(token.end))
  return latex.slice(0, token.start) + replacement + (needsSpace ? ' ' : '') + latex.slice(token.end)
}
