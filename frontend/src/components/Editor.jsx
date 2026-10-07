import { useRef } from 'react'
import Math from './Math.jsx'

const SNIPPETS = [
  ['×', '\\times '],
  ['÷', '\\div '],
  ['xⁿ', '^{}', -1],
  ['a/b', '\\frac{}{}', -3],
  ['√', '\\sqrt{}', -1],
  ['π', '\\pi '],
]

export default function Editor({ latex, onChange, onSolve, onBack, note, busy, practice }) {
  const ta = useRef(null)

  const insert = ([, text, back = 0]) => {
    const el = ta.current
    const s = el.selectionStart
    const e = el.selectionEnd
    onChange(latex.slice(0, s) + text + latex.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      const pos = s + text.length + back
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="card stack">
      <h2>{practice ? 'Practice problem' : 'Is this right?'}</h2>
      <p className="muted">
        {practice
          ? 'Try it on paper first, then press Solve to see the answer and the work.'
          : 'Fix anything I misread (5 vs S, x vs ×) before solving.'}
      </p>
      {note && <div className="banner info">{note}</div>}
      <div className="eq-preview">
        {latex.trim() ? <Math latex={latex} display /> : <span className="muted">Type an equation below</span>}
      </div>
      <label className="label" htmlFor="latex">Edit (LaTeX)</label>
      <textarea
        id="latex"
        ref={ta}
        value={latex}
        rows={3}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="chips">
        {SNIPPETS.map((s) => (
          <button key={s[0]} className="chip" type="button" onClick={() => insert(s)}>{s[0]}</button>
        ))}
      </div>
      <div className="row">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary grow" disabled={!latex.trim() || busy} onClick={onSolve}>
          {busy ? 'Solving…' : 'Solve'}
        </button>
      </div>
    </div>
  )
}
