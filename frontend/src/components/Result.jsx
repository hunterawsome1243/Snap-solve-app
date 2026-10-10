import { lazy, Suspense, useRef, useState } from 'react'
import Math from './Math.jsx'
import SolutionSheet from './SolutionSheet.jsx'
import Icon from './Icon.jsx'
import Reveal from './Reveal.jsx'
import { saveImage, savePdf } from '../lib/exportSolution.js'

const Graph = lazy(() => import('./Graph.jsx'))

function Verification({ v }) {
  if (v.status === 'mismatch') {
    return (
      <div className="banner warn" role="alert">
        <Icon name="alert" className="b-ico" />
        <strong>Double-check this one.</strong>
        <span>The AI's answer and an independent math check disagree. {v.detail}.</span>
      </div>
    )
  }
  if (v.status === 'match') return <div className="banner ok"><Icon name="check" className="b-ico" />Verified independently with SymPy</div>
  return <div className="banner info">Couldn't be verified automatically. {v.detail}</div>
}

function StepList({ steps }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i} className={s.check === 'bad' ? 'step-bad' : ''}>
          <span className="num">{i + 1}</span>
          <div className="step-body">
            <div className="step-math"><Math latex={s.latex} display /></div>
            {s.explain && <p className="explain">{s.explain}</p>}
            {s.check === 'ok' && <span className="chk ok" title="A calculator checked this line"><Icon name="check" />checked</span>}
            {s.check === 'bad' && <span className="chk bad"><Icon name="alert" />A calculator disagrees with this line</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function Result({ problem, result, busy, onPractice, onNew, onEdit, onBackToProblems }) {
  const sheet = useRef(null)
  const [exporting, setExporting] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const bad = result.steps_summary?.bad || []
  const checked = result.steps_summary?.checked ?? result.steps.filter((s) => s.check && s.check !== 'unchecked').length

  async function exportAs(kind) {
    setExporting(kind)
    setExportMsg('')
    try {
      const out = await (kind === 'png' ? saveImage : savePdf)(sheet.current, kind === 'png' ? 'hunter-scan.png' : 'hunter-scan.pdf')
      if (out === 'downloaded') setExportMsg(`Saved ${kind.toUpperCase()}. Check your downloads.`)
    } catch {
      setExportMsg("Couldn't create the file. Try again, or take a screenshot.")
    } finally {
      setExporting('')
    }
  }

  return (
    <>
      {onBackToProblems && <button className="link left" onClick={onBackToProblems}><Icon name="back" />All problems</button>}
    <Reveal>
      <div className="card answer-card">
        <div className="label">Problem</div>
        <div className="problem-line"><Math latex={problem} display /></div>
        <div className="label">Answer</div>
        <div className="answer"><Math latex={result.answer_latex} display /></div>
        {result.answer_text && <p className="answer-text">{result.answer_text}</p>}
        <Verification v={result.verification} />
        {bad.length > 0 && (
          <div className="banner warn" role="alert">
            <strong>Check {bad.length === 1 ? `line ${bad[0] + 1}` : `lines ${bad.map((i) => i + 1).join(', ')}`} of the work.</strong>
            <span>A calculator tested each line and disagrees with {bad.length === 1 ? 'it' : 'them'}. The final answer may still be right, but that part of the explanation might not be.</span>
          </div>
        )}
      </div>

      {result.graph && (
        <Suspense fallback={<div className="card center muted">Drawing graph…</div>}>
          <Graph graph={result.graph} />
        </Suspense>
      )}

      <div className="card">
        <h2>Step by step</h2>
        {checked > 0 && <p className="muted tiny">{checked} of {result.steps.length} lines checked by a calculator.</p>}
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

      <div className="card stack">
        <h2>Save or share</h2>
        <div className="row wrap">
          <button className="btn secondary grow" onClick={() => exportAs('pdf')} disabled={!!exporting}><Icon name="pdf" />{exporting === 'pdf' ? 'Making PDF…' : 'Save as PDF'}</button>
          <button className="btn secondary grow" onClick={() => exportAs('png')} disabled={!!exporting}><Icon name="image" />{exporting === 'png' ? 'Making image…' : 'Save as image'}</button>
        </div>
        {exportMsg && <p className="muted tiny" role="status">{exportMsg}</p>}
      </div>

      <div className="row wrap">
        <button className="btn secondary grow" onClick={onPractice} disabled={busy}><Icon name="target" />Practice similar</button>
        <button className="btn ghost" onClick={onEdit}>Edit problem</button>
      </div>
      <button className="btn cta" onClick={onNew}><Icon name="camera" />Snap another</button>

      <SolutionSheet ref={sheet} problem={problem} result={result} />
    </Reveal>
    </>
  )
}
