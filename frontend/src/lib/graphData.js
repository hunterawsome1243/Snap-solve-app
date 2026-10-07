// Turns the model's graph description into numbers to draw. Everything is re-evaluated here with math.js,
// so a point is plotted where the curve really is, not where the model said it was.
import { parse } from 'mathjs'

const SAFE = /^[A-Za-z0-9_+\-*/^().,\s]*$/
const COLORS = ['var(--brand)', 'var(--ok)', 'var(--warn)']

function compile(expr) {
  const src = String(expr ?? '').trim()
  if (!src || !SAFE.test(src)) throw new Error('bad expression')
  const node = parse(src).compile()
  return (x) => {
    try {
      const v = node.evaluate({ x })
      const n = typeof v === 'number' ? v : v && typeof v.re === 'number' && Math.abs(v.im) < 1e-9 ? v.re : NaN
      return Number.isFinite(n) ? n : NaN
    } catch {
      return NaN
    }
  }
}

function constant(expr) {
  const v = compile(expr)(0)
  if (Number.isNaN(v)) throw new Error('not a number')
  return v
}

function niceStep(span, target = 5) {
  const raw = span / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow
}

export function buildGraph(graph, width = 360, height = 260) {
  if (!graph?.series?.length) return null
  const fns = graph.series.map((s) => compile(s.expr))
  const pts = (graph.points || []).map((p) => {
    const x = constant(p.x)
    return { x, y: fns[p.series ?? 0](x), label: p.label, series: p.series ?? 0 }
  }).filter((p) => Number.isFinite(p.y))
  const shade = graph.shade ? { from: constant(graph.shade.from), to: constant(graph.shade.to), series: graph.shade.series ?? 0 } : null

  let xmin = Number.isFinite(graph.xmin) ? graph.xmin : -10
  let xmax = Number.isFinite(graph.xmax) ? graph.xmax : 10
  const include = [...pts.map((p) => p.x), ...(shade ? [shade.from, shade.to] : [])]
  for (const x of include) {
    const pad = (xmax - xmin) * 0.08
    if (x < xmin + pad) xmin = x - pad
    if (x > xmax - pad) xmax = x + pad
  }

  const N = 480
  const xs = Array.from({ length: N + 1 }, (_, i) => xmin + ((xmax - xmin) * i) / N)
  const ys = fns.map((f) => xs.map(f))

  // y-range from the middle of the data so one asymptote can't flatten the picture
  const finite = ys.flat().filter((v) => Number.isFinite(v) && Math.abs(v) < 1e6).sort((a, b) => a - b)
  if (!finite.length) return null
  const lo = finite[Math.floor(finite.length * 0.04)]
  const hi = finite[Math.ceil(finite.length * 0.96) - 1]
  let ymin = Math.min(lo, 0, ...pts.map((p) => p.y))
  let ymax = Math.max(hi, 0, ...pts.map((p) => p.y))
  if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1 }
  const padY = (ymax - ymin) * 0.12
  ymin -= padY
  ymax += padY

  const L = 38, R = 12, T = 12, B = 26
  const sx = (x) => L + ((x - xmin) / (xmax - xmin)) * (width - L - R)
  const sy = (y) => height - B - ((y - ymin) / (ymax - ymin)) * (height - T - B)

  const paths = ys.map((col) => {
    let d = ''
    let pen = false
    let prev = null
    col.forEach((y, i) => {
      if (!Number.isFinite(y) || y > ymax + (ymax - ymin) * 2 || y < ymin - (ymax - ymin) * 2) { pen = false; prev = null; return }
      if (prev != null && Math.abs(y - prev) > (ymax - ymin) * 0.9) pen = false // jump across an asymptote
      d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(y).toFixed(1)}`
      pen = true
      prev = y
    })
    return d
  })

  let area = null
  if (shade) {
    const f = fns[shade.series]
    const a = Math.min(shade.from, shade.to)
    const b = Math.max(shade.from, shade.to)
    const M = 160
    const top = []
    for (let i = 0; i <= M; i++) {
      const x = a + ((b - a) * i) / M
      const y = f(x)
      if (Number.isFinite(y)) top.push(`${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`)
    }
    if (top.length > 1) area = `M${sx(a).toFixed(1)} ${sy(0).toFixed(1)}L${top.join('L')}L${sx(b).toFixed(1)} ${sy(0).toFixed(1)}Z`
  }

  const ticks = (min, max) => {
    const step = niceStep(max - min)
    const out = []
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(6)))
    return out
  }

  return {
    width, height, L, R, T, B,
    xTicks: ticks(xmin, xmax).map((v) => ({ v, p: sx(v) })),
    yTicks: ticks(ymin, ymax).map((v) => ({ v, p: sy(v) })),
    axisX: sy(Math.min(Math.max(0, ymin), ymax)),
    axisY: sx(Math.min(Math.max(0, xmin), xmax)),
    series: graph.series.map((s, i) => ({ label: s.label, color: COLORS[i % COLORS.length], d: paths[i] })),
    points: pts.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y), color: COLORS[p.series % COLORS.length] })),
    area,
  }
}
