import { useState } from 'react'
import Math from './Math.jsx'
import { ago, isStale } from '../lib/time.js'
import Icon from './Icon.jsx'

const FILTERS = [['all', 'All'], ['math', 'Math'], ['buy', 'Snap Buy']]

function money(price, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price)
  } catch {
    return `${price.toFixed(2)} ${currency}`
  }
}

export default function History({ items, onOpen, onRemove, onClear }) {
  const [filter, setFilter] = useState('all')
  const shown = items.filter((i) => filter === 'all' || i.type === filter)

  if (!items.length) {
    return (
      <div className="card center">
        <div className="empty-ico"><Icon name="history" /></div>
        <h2>Nothing here yet</h2>
        <p className="muted">Solved problems and product searches are saved here, on this device only.</p>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="chips seg" role="tablist" aria-label="History filter">
        {FILTERS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{name}</button>
        ))}
      </div>
      {shown.length === 0 && <div className="card center muted">No {filter === 'buy' ? 'product searches' : 'math problems'} yet.</div>}
      {shown.map((it) => {
        const rec = it.type === 'buy' ? it.result.recommendation : null
        return (
          <div className="card history-item" key={it.id}>
            <button className="history-open" onClick={() => onOpen(it)}>
              <span className="type-tag">{it.type === 'buy' ? 'Snap Buy' : 'Math'}</span>
              {it.type === 'buy' ? (
                <>
                  <div className="history-title">{it.query}</div>
                  <div className="history-answer">
                    {rec?.kind === 'offer' ? `${money(rec.price, rec.currency)} at ${rec.retailer}` : rec ? `Try ${rec.retailer}` : 'No prices found'}
                  </div>
                  <div className={`tiny ${isStale(it.ts) ? 'stale' : 'muted'}`}>{isStale(it.ts) ? <Icon name="alert" className="inline" /> : null}Prices checked {ago(it.ts)}{isStale(it.ts) ? ', may be out of date' : ''}</div>
                </>
              ) : (
                <>
                  <div className="problem-line small"><Math latex={it.latex} /></div>
                  <div className="history-answer">= <Math latex={it.result.answer_latex} /></div>
                  <div className="muted tiny">{new Date(it.ts).toLocaleString()}</div>
                </>
              )}
            </button>
            <button className="icon-btn" aria-label="Delete" onClick={() => onRemove(it.id)}><Icon name="close" /></button>
          </div>
        )
      })}
      <button className="link danger" onClick={onClear}>Clear history</button>
    </div>
  )
}
