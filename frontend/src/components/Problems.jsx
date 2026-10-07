import Math from './Math.jsx'

const label = { idle: 'Not solved yet', solving: 'Solving…', done: 'Solved', error: 'Couldn’t solve' }

export default function Problems({ items, running, onSolve, onSolveAll, onView, onBack }) {
  const todo = items.filter((p) => p.kind === 'math' && p.status !== 'done').length
  return (
    <div className="stack">
      <div className="card stack">
        <h2>{items.length} problems found</h2>
        <p className="muted">Solve them one at a time, or all at once. Tap Edit to fix anything I misread.</p>
        <div className="row wrap">
          <button className="btn primary grow" disabled={running || todo === 0} onClick={onSolveAll}>
            {running ? 'Solving…' : todo === 0 ? 'All solved' : `Solve all (${todo})`}
          </button>
          <button className="btn ghost" onClick={onBack}>New photo</button>
        </div>
      </div>
      {items.map((p, i) => (
        <div className="card stack" key={p.id}>
          <div className="row">
            <span className="num">{i + 1}</span>
            <span className={`status ${p.status}`}>{label[p.status]}</span>
          </div>
          {p.kind === 'math' ? <div className="problem-line"><Math latex={p.latex} display /></div> : <p className="word-text">“{p.text}”</p>}
          {p.status === 'done' && (
            <div className="answer small"><Math latex={p.result.answer_latex} /></div>
          )}
          {p.error && <div className="banner warn">{p.error}</div>}
          <div className="row wrap">
            {p.status === 'done' && <button className="btn secondary grow" onClick={() => onView(i)}>View steps</button>}
            <button className={`btn ${p.status === 'done' ? 'ghost' : 'primary'} grow`} disabled={running} onClick={() => onSolve(i)}>
              {p.kind === 'word' ? 'Turn into equation' : p.status === 'done' ? 'Edit' : 'Edit & solve'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
