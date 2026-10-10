import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'
import * as store from '../storage.js'
import MathView from './Math.jsx'
import Icon from './Icon.jsx'
import Confetti from './Confetti.jsx'
import Reveal from './Reveal.jsx'
import { buzz } from '../lib/haptics.js'

const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]
const TOPICS = [
  ['mixed', 'Mixed'], ['arithmetic', 'Arithmetic'], ['linear', 'Linear equations'], ['quadratic', 'Quadratics'],
  ['system', 'Systems'], ['exponents', 'Exponents'], ['radicals', 'Radicals'], ['logs', 'Logarithms'],
  ['derivative', 'Derivatives'], ['integral', 'Integrals'],
]
const FORMAT = {
  solve: 'e.g. x = 2 or x = 3',
  system: 'e.g. x = 1, y = 2',
  derivative: 'e.g. 3x^2',
  integral: 'e.g. x^2 + C',
}

export default function Practice({ seed, onSteps, onExit }) {
  const [difficulty, setDifficulty] = useState(() => store.getPref('practice.level', 'medium'))
  const [topic, setTopic] = useState(() => store.getPref('practice.topic', 'mixed'))
  const [stats, setStats] = useState(() => store.getPref('practice.stats', { streak: 0, best: 0, solved: 0 }))
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState(false)
  const [fb, setFb] = useState(null) // {correct, correct_latex, detail}
  const [done, setDone] = useState(false) // solved or revealed
  const [wrong, setWrong] = useState(false)
  const [error, setError] = useState('')
  const seedRef = useRef(seed)
  const [party, setParty] = useState(0)

  const save = (next) => { setStats(next); store.setPref('practice.stats', next) }

  async function next(level = difficulty, t = topic) {
    setLoading(true); setError(''); setFb(null); setDone(false); setWrong(false); setHint(false); setAnswer('')
    try {
      setItem(await api.practice({ difficulty: level, topic: t, latex: seedRef.current }))
      seedRef.current = null
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { next() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function check(e) {
    e?.preventDefault()
    if (!answer.trim() || !item) return
    setError('')
    try {
      const r = await api.practiceCheck(item.problem, answer)
      setFb(r)
      if (r.correct) {
        setDone(true)
        setParty((n) => n + 1)
        buzz([20, 40, 20])
        setTimeout(() => setParty(0), 1800)
        // no hint = the streak grows; with a hint the streak is kept but doesn't grow
        const streak = hint ? stats.streak : stats.streak + 1
        save({ streak, best: Math.max(stats.best, streak), solved: stats.solved + 1 })
      } else if (r.correct === false && !wrong) {
        setWrong(true)
        save({ ...stats, streak: 0 })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function reveal() {
    try {
      const r = await api.practiceCheck(item.problem, answer.trim() || 'x')
      setFb({ ...r, correct: false, revealed: true })
      setDone(true)
      if (!wrong) { setWrong(true); save({ ...stats, streak: 0 }) }
    } catch (err) {
      setError(err.message)
    }
  }

  const kind = item?.problem?.kind

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row spread">
          <h2>Practice</h2>
          <div className="streak" aria-label={`Streak ${stats.streak}, best ${stats.best}`}><Icon name="flame" className="flame" /><b>{stats.streak}</b> <span className="muted tiny">best {stats.best} · {stats.solved} solved</span></div>
        </div>
        <div className="chips" role="group" aria-label="Difficulty">
          {LEVELS.map(([id, name]) => (
            <button key={id} className={`chip ${difficulty === id ? 'on' : ''}`} aria-pressed={difficulty === id} onClick={() => { setDifficulty(id); store.setPref('practice.level', id); next(id, topic) }} disabled={loading}>{name}</button>
          ))}
        </div>
        <label className="label" htmlFor="topic">Topic</label>
        <select id="topic" className="text-input" value={topic} onChange={(e) => { setTopic(e.target.value); store.setPref('practice.topic', e.target.value); next(difficulty, e.target.value) }} disabled={loading}>
          {TOPICS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {error && <div className="banner warn" role="alert" key={error}>{error}</div>}

      {loading && <div className="card center"><div className="spinner" /><p className="muted">Writing a problem…</p></div>}

      {item && !loading && (
        <div className="card stack">
          <div className="label">Solve this</div>
          <div className="problem-line"><MathView latex={item.latex} display /></div>

          {hint && item.hint && <div className="banner info"><strong>Hint</strong><span>{item.hint}</span></div>}

          {!done && (
            <form className="stack" onSubmit={check}>
              <label className="label" htmlFor="ans">Your answer</label>
              <input id="ans" className="text-input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={FORMAT[kind] || 'Type your answer'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              {fb && fb.correct === false && !fb.revealed && <div className="banner warn" role="alert"><strong>Not quite.</strong><span>Try again, take a hint, or show the answer.</span></div>}
              {fb && fb.correct === null && <div className="banner info">I couldn't read that answer format. {fb.detail}</div>}
              <div className="row wrap">
                <button className="btn primary grow" type="submit" disabled={!answer.trim()}>Check answer</button>
                {!hint && item.hint && <button className="btn secondary" type="button" onClick={() => setHint(true)}>Show hint</button>}
              </div>
              <button className="link" type="button" onClick={reveal}>Show the answer</button>
            </form>
          )}

          {done && (
            <Reveal>
              {fb?.revealed ? (
                <div className="banner info"><strong>The answer</strong></div>
              ) : (
                <div className="banner ok"><Icon name="check" className="b-ico" />Correct!{hint ? ' (with a hint, so the streak stays put)' : stats.streak > 1 ? ` ${stats.streak} in a row.` : ''}</div>
              )}
              {fb?.correct_latex && <div className="answer"><MathView latex={fb.correct_latex} display /></div>}
              <div className="row wrap">
                <button className="btn primary grow" onClick={() => next()}>Next problem</button>
                <button className="btn secondary" onClick={() => onSteps(item.latex)}>See the steps</button>
              </div>
            </Reveal>
          )}
        </div>
      )}
      {party > 0 && <Confetti key={party} />}
      <button className="link" onClick={onExit}>Back</button>
    </div>
  )
}
