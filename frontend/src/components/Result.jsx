import Math from './Math.jsx'

function Verification({ v }) {
  if (v.status === 'mismatch') {
    return (
      <div className="banner warn" role="alert">
        <strong>Double-check this one.</strong>
        <span>
          The AI's answer and an independent math check disagree. {v.detail}.
        </span>
      </div>
    )
  }
  if (v.status === 'match') {
    return <div className="banner ok">✓ Verified independently with SymPy</div>
  }
  return <div className="banner info">Couldn't be verified automatically. {v.detail}</div>
}

function StepList({ steps }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="num">{i + 1}</span>
          <div className="step-body">
            <div className="step-math"><Math latex={s.latex} display /></div>
            {s.explain && <p className="explain">{s.explain}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function Result({ problem, result, busy, onPractice, onNew, onEdit }) {
  return (
    <div className="stack">
      <div className="card answer-card">
        <div className="label">Problem</div>
        <div className="problem-line"><Math latex={problem} display /></div>
        <div className="label">Answer</div>
        <div className="answer"><Math latex={result.answer_latex} display /></div>
        <Verification v={result.verification} />
      </div>

      <div className="card">
        <h2>Step by step</h2>
        <StepList steps={result.steps} />
      </div>

      {(result.check.steps.length > 0 || result.check.conclusion) && (
        <div className="card">
          <h2>Check</h2>
          <p className="muted">Plugging the answer back in:</p>
          <StepList steps={result.check.steps} />
          {result.check.conclusion && <p className="conclusion">{result.check.conclusion}</p>}
        </div>
      )}

      <div className="row wrap">
        <button className="btn secondary grow" onClick={onPractice} disabled={busy}>
          {busy ? 'Thinking…' : '✏️ Practice a similar one'}
        </button>
        <button className="btn ghost" onClick={onEdit}>Edit problem</button>
      </div>
      <button className="btn primary" onClick={onNew}>📷 Snap another</button>
    </div>
  )
}
