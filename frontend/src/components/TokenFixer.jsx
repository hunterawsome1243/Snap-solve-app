import { useMemo, useState } from 'react'
import { flaggedIndexes, replaceToken, suggestionsFor, tokenize } from '../lib/tokens.js'

// Tap any symbol of the recognised equation to swap it. Symbols the model was unsure about are marked.
export default function TokenFixer({ latex, uncertain = [], onChange, onResolved }) {
  const tokens = useMemo(() => tokenize(latex), [latex])
  const flagged = useMemo(() => flaggedIndexes(tokens, uncertain), [tokens, uncertain])
  const [open, setOpen] = useState(null) // token index
  const [custom, setCustom] = useState('')

  if (!tokens.length) return null
  const tok = open != null ? tokens[open] : null
  const apply = (value) => {
    if (!tok || !value) return
    onChange(replaceToken(latex, tok, value))
    onResolved?.(tok.text)
    setOpen(null)
    setCustom('')
  }
  const alts = tok ? suggestionsFor(tok.text, uncertain) : []
  const firstFlag = [...flagged][0]

  return (
    <div className="fixer stack">
      <div className="label">
        {flagged.size > 0 ? `Not sure about ${flagged.size === 1 ? 'one symbol' : `${flagged.size} symbols`}: tap to check` : 'Tap a symbol to fix it'}
      </div>
      <div className="tokens" role="group" aria-label="Symbols in the equation">
        {tokens.map((t, i) => (
          <button
            key={`${t.start}-${i}`}
            type="button"
            className={`tok ${flagged.has(i) ? 'flag' : ''} ${open === i ? 'sel' : ''} ${/^[{}^_]$/.test(t.text) ? 'dim' : ''}`}
            aria-pressed={open === i}
            aria-label={`Symbol ${t.text}${flagged.has(i) ? ', not sure' : ''}`}
            onClick={() => { setOpen(open === i ? null : i); setCustom('') }}
          >
            {t.text}
          </button>
        ))}
      </div>
      {tok && (
        <div className="fix-panel">
          <div className="fix-title">
            {flagged.has(open) && alts.length ? (
              <>Is <code>{tok.text}</code> really {alts.slice(0, 2).map((a, i) => <span key={a}>{i > 0 && ' or '}<code>{a}</code></span>)}?</>
            ) : (
              <>Change <code>{tok.text}</code> to:</>
            )}
          </div>
          <div className="chips">
            {alts.map((a) => <button key={a} type="button" className="chip" onClick={() => apply(a)}>{a}</button>)}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); apply(custom.trim()) }}>
            <input className="text-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else" aria-label="Replacement" />
            <button className="btn secondary" type="submit" disabled={!custom.trim()}>Apply</button>
          </form>
        </div>
      )}
      {firstFlag != null && open == null && (
        <button type="button" className="link" onClick={() => setOpen(firstFlag)}>Check the first unsure symbol</button>
      )}
    </div>
  )
}
