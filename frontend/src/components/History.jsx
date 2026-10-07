import Math from './Math.jsx'

export default function History({ items, onOpen, onRemove, onClear }) {
  if (!items.length) {
    return (
      <div className="card center">
        <div className="big-emoji">🗂️</div>
        <h2>No problems yet</h2>
        <p className="muted">Solved problems are saved here, on this device only.</p>
      </div>
    )
  }
  return (
    <div className="stack">
      {items.map((it) => (
        <div className="card history-item" key={it.id}>
          <button className="history-open" onClick={() => onOpen(it)}>
            <div className="problem-line small"><Math latex={it.latex} /></div>
            <div className="history-answer">= <Math latex={it.result.answer_latex} /></div>
            <div className="muted tiny">{new Date(it.ts).toLocaleString()}</div>
          </button>
          <button className="icon-btn" aria-label="Delete" onClick={() => onRemove(it.id)}>✕</button>
        </div>
      ))}
      <button className="link danger" onClick={onClear}>Clear history</button>
    </div>
  )
}
