import { useMemo } from 'react'
import { buildGraph } from '../lib/graphData.js'

export default function Graph({ graph }) {
  const g = useMemo(() => {
    try {
      return buildGraph(graph)
    } catch {
      return null
    }
  }, [graph])
  if (!g) return null

  const fmt = (v) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : String(v))
  const summary = `Graph of ${g.series.map((s) => s.label).filter(Boolean).join(' and ')}${g.points.length ? `, with ${g.points.map((p) => p.label || `(${fmt(Number(p.x.toFixed(3)))}, ${fmt(Number(p.y.toFixed(3)))})`).join(', ')} marked` : ''}`

  return (
    <div className="card stack">
      <h2>Graph</h2>
      <svg className="graph" viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={summary}>
        {g.xTicks.map((t) => <line key={`gx${t.v}`} x1={t.p} x2={t.p} y1={g.T} y2={g.height - g.B} className="g-grid" />)}
        {g.yTicks.map((t) => <line key={`gy${t.v}`} y1={t.p} y2={t.p} x1={g.L} x2={g.width - g.R} className="g-grid" />)}
        <line x1={g.L} x2={g.width - g.R} y1={g.axisX} y2={g.axisX} className="g-axis" />
        <line y1={g.T} y2={g.height - g.B} x1={g.axisY} x2={g.axisY} className="g-axis" />
        {g.xTicks.map((t) => <text key={`tx${t.v}`} x={t.p} y={g.height - g.B + 14} className="g-tick" textAnchor="middle">{fmt(t.v)}</text>)}
        {g.yTicks.map((t) => <text key={`ty${t.v}`} x={g.L - 5} y={t.p + 3} className="g-tick" textAnchor="end">{fmt(t.v)}</text>)}
        {g.area && <path d={g.area} className="g-area" />}
        {g.series.map((s, i) => <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />)}
        {g.points.map((p, i) => (
          <g key={i}>
            <circle cx={p.px} cy={p.py} r="5" fill={p.color} stroke="var(--card)" strokeWidth="2" />
            <text x={Math.min(Math.max(p.px, g.L + 20), g.width - g.R - 20)} y={p.py - 10} className="g-label" textAnchor="middle">
              {p.label || `(${fmt(Number(p.x.toFixed(2)))}, ${fmt(Number(p.y.toFixed(2)))})`}
            </text>
          </g>
        ))}
      </svg>
      <div className="legend">
        {g.series.map((s, i) => s.label && <span key={i}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  )
}
