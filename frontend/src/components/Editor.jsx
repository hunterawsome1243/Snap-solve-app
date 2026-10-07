import { useRef } from 'react'
import Math from './Math.jsx'
import TokenFixer from './TokenFixer.jsx'

const SNIPPETS = [
  ['×', '\\times '],
  ['÷', '\\div '],
  ['xⁿ', '^{}', -1],
  ['a/b', '\\frac{}{}', -3],
  ['√', '\\sqrt{}', -1],
  ['π', '\\pi '],
]

export default function Editor({ latex, onChange, onSolve, onBack, note, busy, title, subtitle, uncertain, onResolved, onWordProblem, children }) {
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

  // a sentence typed in instead of an equation: offer to turn it into one
  const looksLikeWords = /[A-Za-z]{3,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(latex) && !/\\[a-z]+/.test(latex)

  return (
    <div className="card stack">
      <h2>{title || 'Is this right?'}</h2>
      <p className="muted">{subtitle || 'Tap any symbol I misread (5 vs S, x vs ×), or edit the text, before solving.'}</p>
      {children}
      {note && <div className="banner info">{note}</div>}
      <div className="eq-preview">
        {latex.trim() ? <Math latex={latex} display /> : <span className="muted">Type an equation below</span>}
      </div>
      <TokenFixer latex={latex} uncertain={uncertain} onChange={onChange} onResolved={onResolved} />
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
      <div className="chips snippets">
        {SNIPPETS.map((s) => (
          <button key={s[0]} className="chip" type="button" onClick={() => insert(s)}>{s[0]}</button>
        ))}
      </div>
      {looksLikeWords && onWordProblem && (
        <div className="banner info">
          This looks like a word problem.{' '}
          <button className="link" type="button" onClick={() => onWordProblem(latex)}>Turn it into an equation</button>
        </div>
      )}
      <div className="row">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary grow" disabled={!latex.trim() || busy} onClick={onSolve}>
          {busy ? 'Solving…' : 'Solve'}
        </button>
      </div>
    </div>
  )
}
