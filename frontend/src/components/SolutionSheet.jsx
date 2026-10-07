import { forwardRef } from 'react'
import Math from './Math.jsx'

const Lines = ({ steps }) => (
  <ol className="sheet-steps">
    {steps.map((s, i) => (
      <li key={i}>
        <span className="sheet-num">{i + 1}</span>
        <div>
          <Math latex={s.latex} display />
          {s.explain && <p>{s.explain}</p>}
          {s.check === 'bad' && <p className="sheet-bad">⚠ A calculator disagrees with this line</p>}
        </div>
      </li>
    ))}
  </ol>
)

// Plain markup (no shadows, no gradients) so it exports cleanly. Lives off-screen.
const SolutionSheet = forwardRef(function SolutionSheet({ problem, result }, ref) {
  const v = result.verification
  return (
    <div className="sheet-wrap" aria-hidden="true">
      <div className="sheet" ref={ref}>
        <div className="sheet-brand">Hunter Scan</div>
        <div className="sheet-label">Problem</div>
        <Math latex={problem} display />
        <div className="sheet-label">Answer</div>
        <div className="sheet-answer"><Math latex={result.answer_latex} display /></div>
        {result.answer_text && <p className="sheet-text">{result.answer_text}</p>}
        <p className="sheet-verify">
          {v.status === 'match' ? '✓ Verified independently by a calculator' : v.status === 'mismatch' ? '⚠ Double-check this one: the calculator disagreed' : 'Not independently verified'}
        </p>
        <div className="sheet-label">Step by step</div>
        <Lines steps={result.steps} />
        {result.check.steps.length > 0 && (
          <>
            <div className="sheet-label">Check</div>
            <Lines steps={result.check.steps} />
            {result.check.conclusion && <p className="sheet-text">{result.check.conclusion}</p>}
          </>
        )}
        <p className="sheet-foot">Made with Hunter Scan · {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  )
})

export default SolutionSheet
