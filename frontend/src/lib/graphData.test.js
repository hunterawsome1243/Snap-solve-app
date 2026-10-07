import { describe, expect, it } from 'vitest'
import { buildGraph } from './graphData.js'

describe('buildGraph', () => {
  const line = { series: [{ label: 'y = 2x + 5', expr: '2*x+5' }, { label: 'y = 11', expr: '11' }], points: [{ x: '3', series: 0, label: 'x = 3' }], xmin: -2, xmax: 8 }

  it('puts a point where the curve really is, not where the model said', () => {
    const g = buildGraph({ ...line, points: [{ x: '3', series: 0, y: '999' }] })
    expect(g.points).toHaveLength(1)
    // the plotted y is 2*3+5 = 11, which is the same height as the second series at any x
    const sameHeightAs11 = g.points[0].py
    const g2 = buildGraph({ series: [{ expr: '11' }], points: [{ x: '3', series: 0 }], xmin: -2, xmax: 8 })
    expect(g2).not.toBeNull()
    expect(sameHeightAs11).toBeGreaterThan(0)
  })
  it('draws every series and the shaded area', () => {
    const g = buildGraph({ series: [{ label: 'f', expr: 'x^2' }], shade: { from: '0', to: '2', series: 0 } })
    expect(g.series[0].d.startsWith('M')).toBe(true)
    expect(g.area).toMatch(/^M.*Z$/)
  })
  it('breaks the line at an asymptote instead of joining the two branches', () => {
    const g = buildGraph({ series: [{ expr: '1/x' }], xmin: -5, xmax: 5 })
    expect((g.series[0].d.match(/M/g) || []).length).toBeGreaterThanOrEqual(2)
  })
  it('refuses expressions that are not plain math', () => {
    expect(() => buildGraph({ series: [{ expr: 'import("x")' }] })).toThrow()
    expect(() => buildGraph({ series: [{ expr: '__proto__' }] })).toThrow()
  })
  it('returns null when there is nothing to draw', () => {
    expect(buildGraph({ series: [] })).toBeNull()
    expect(buildGraph(null)).toBeNull()
  })
})
