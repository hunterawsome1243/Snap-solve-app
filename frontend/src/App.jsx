import { useEffect, useRef, useState } from 'react'
import { cleanUp, loadPhotoCanvas } from './image.js'
import * as api from './api.js'
import * as store from './storage.js'
import Cropper from './components/Cropper.jsx'
import LiveCamera from './components/LiveCamera.jsx'
import Editor from './components/Editor.jsx'
import Result from './components/Result.jsx'
import History from './components/History.jsx'
import BuyFlow from './components/BuyFlow.jsx'
import Problems from './components/Problems.jsx'
import Practice from './components/Practice.jsx'
import Pumpkins from './components/Pumpkins.jsx'
import Elements from './components/Elements.jsx'
import Fruits from './components/Fruits.jsx'
import InstallHint from './components/InstallHint.jsx'
import Extras from './components/Extras.jsx'
import Icon from './components/Icon.jsx'
import ScanLoader from './components/ScanLoader.jsx'
import { buzz } from './lib/haptics.js'
import { CATEGORIES, HOLIDAYS, holidayById, themesIn } from './lib/themes.js'
import HolidayParticles from './components/HolidayParticles.jsx'

const SKINS = ['halloween', 'ocean', 'forest', 'sunset', 'science', 'tropical', ...HOLIDAYS.map((h) => h.id)]

const uid = (p = 'h') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// What the solver is told about a word problem, so it can answer in words with units.
const contextString = (c) =>
  c ? `${c.text}\nVariables: ${c.variables.map((v) => `${v.name} = ${v.meaning}`).join('; ') || 'n/a'}\nAsks: ${c.question || 'n/a'}` : null

export default function App() {
  const [tab, setTab] = useState('solve') // solve | buy | extras | history
  const [screen, setScreen] = useState('home') // home | crop | reading | unreadable | problems | formulating | edit | result | practice
  const [photo, setPhoto] = useState(null)
  const [shots, setShots] = useState(null) // { clean, original, found } while choosing a crop
  const [shotMode, setShotMode] = useState('clean')
  const [hint, setHint] = useState('')
  const [latex, setLatex] = useState('')
  const [note, setNote] = useState('')
  const [uncertain, setUncertain] = useState([])
  const [wordCtx, setWordCtx] = useState(null)
  const [problems, setProblems] = useState([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [practiceSeed, setPracticeSeed] = useState(null)
  const [buyInitial, setBuyInitial] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState(store.loadHistory)
  const [simple, setSimple] = useState(() => store.getPref('simple', false))
  const [theme, setTheme] = useState(() => store.getPref('theme', 'auto'))
  const [themeOpen, setThemeOpen] = useState(false)
  const camRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    const skin = SKINS.includes(theme)
    if (skin) root.setAttribute('data-skin', theme)
    else root.removeAttribute('data-skin')
    if (skin || theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    store.setPref('theme', theme)
  }, [theme])

  const go = (s) => {
    setError('')
    setScreen(s)
  }
  const fail = (e) => setError(e.message || 'Something went wrong.')

  // A captured or chosen photo: find the page, flatten it, even out the light, then let the user trim it.
  function takeShot(canvas) {
    let cleaned = null
    try {
      cleaned = cleanUp(canvas)
    } catch {
      cleaned = null // cleaning is a bonus; the original photo always works
    }
    const original = canvas.toDataURL('image/jpeg', 0.92)
    const clean = cleaned ? cleaned.canvas.toDataURL('image/jpeg', 0.92) : original
    buzz(18)
    setShots({ clean, original, found: !!cleaned?.found, cleaned: !!cleaned })
    setShotMode(cleaned ? 'clean' : 'original')
    setPhoto(cleaned ? clean : original)
    setTab('solve')
    go('crop')
  }

  async function onFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return fail(new Error('Please choose an image file.'))
    try {
      takeShot(await loadPhotoCanvas(file))
    } catch {
      fail(new Error("Couldn't open that image. Try a JPG or PNG."))
    }
  }

  // Live viewfinder needs a secure context (https or localhost). Otherwise use the phone's own camera app.
  const liveOk = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
  function startScan() {
    setHint('')
    if (liveOk()) return go('scan')
    setHint('Live scanning needs a secure connection (https). Using your camera app instead.')
    camRef.current.click()
  }
  function liveUnavailable(err) {
    // err is null when the user chose the camera app, otherwise the camera could not start (permission, no camera)
    if (err) setHint(err.name === 'NotAllowedError' ? 'Camera access was blocked. Using your camera app instead.' : 'Couldn’t start the camera. Using your camera app instead.')
    go('home')
    camRef.current.click()
  }

  async function startWord(text, idx = activeIdx) {
    setActiveIdx(idx)
    go('formulating')
    try {
      const r = await api.formulate(text)
      setWordCtx({ text, variables: r.variables, question: r.question })
      setLatex(r.equation_latex)
      setUncertain([])
      setNote(r.message)
      go('edit')
    } catch (e) {
      go('edit')
      setWordCtx(null)
      setLatex(text)
      fail(e)
    }
  }

  function openProblem(i, list = problems) {
    const p = list[i]
    setActiveIdx(i)
    setResult(null)
    if (p.kind === 'word') return startWord(p.text, i)
    setWordCtx(null)
    setLatex(p.latex)
    setUncertain(p.uncertain || [])
    setNote('')
    go('edit')
  }

  async function onCropped(dataUrl) {
    setPhoto(dataUrl)
    go('reading')
    try {
      const r = await api.readImage(dataUrl)
      if (!r.readable) {
        setNote(r.message)
        return go('unreadable')
      }
      const items = r.problems.map((p, i) => ({ id: uid('p') + i, ...p, status: 'idle', result: null, error: '' }))
      setProblems(items)
      if (items.length === 1) {
        openProblem(0, items)
        if (r.message) setNote(r.message)
      } else {
        setActiveIdx(-1)
        go('problems')
      }
    } catch (e) {
      go('crop')
      fail(e)
    }
  }

  const patchProblem = (i, patch) => setProblems((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)))

  async function runSolve(text = latex, simpleMode = simple, ctx = wordCtx) {
    setBusy(true)
    setError('')
    try {
      const r = await api.solve(text, simpleMode, contextString(ctx))
      setResult(r)
      setHistory(store.addHistory({ type: 'math', id: uid(), ts: Date.now(), latex: text, wordCtx: ctx, result: r }))
      if (activeIdx >= 0) patchProblem(activeIdx, { latex: text, status: 'done', result: r, error: '' })
      setScreen('result')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function solveAll() {
    setRunning(true)
    setError('')
    for (let i = 0; i < problems.length; i++) {
      const p = problems[i]
      if (p.kind !== 'math' || p.status === 'done') continue
      patchProblem(i, { status: 'solving', error: '' })
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await api.solve(p.latex, simple, null)
        patchProblem(i, { status: 'done', result: r })
        setHistory(store.addHistory({ type: 'math', id: uid(), ts: Date.now(), latex: p.latex, wordCtx: null, result: r }))
      } catch (e) {
        patchProblem(i, { status: 'error', error: e.message })
      }
    }
    setRunning(false)
  }

  function openPractice(seed = null) {
    setPracticeSeed(seed)
    setTab('solve')
    go('practice')
  }

  function stepsFor(text) {
    setActiveIdx(-1)
    setWordCtx(null)
    setUncertain([])
    setLatex(text)
    runSolve(text, simple, null)
  }

  function toggleSimple() {
    const next = !simple
    setSimple(next)
    store.setPref('simple', next)
    if (tab === 'solve' && screen === 'result') runSolve(latex, next)
  }

  function openHistory(item) {
    if (item.type === 'buy') {
      setBuyInitial({ key: Date.now(), query: item.query, result: item.result })
      return setTab('buy')
    }
    setLatex(item.latex)
    setResult(item.result)
    setWordCtx(item.wordCtx || null)
    setActiveIdx(-1)
    setTab('solve')
    go('result')
  }

  const startNew = () => {
    setShots(null)
    setLatex('')
    setResult(null)
    setWordCtx(null)
    setProblems([])
    setActiveIdx(-1)
    setUncertain([])
    go('home')
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    onFile(e.dataTransfer.files?.[0])
  }

  const picker = (ref, capture) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'environment' } : {})}
      hidden
      onChange={(e) => {
        onFile(e.target.files[0])
        e.target.value = ''
      }}
    />
  )

  const wordPanel = wordCtx && (
    <div className="word-card">
      <div className="label">Word problem</div>
      <p className="word-text">“{wordCtx.text}”</p>
      {wordCtx.variables.length > 0 && (
        <ul className="vars">
          {wordCtx.variables.map((v) => <li key={v.name}><code>{v.name}</code> = {v.meaning}</li>)}
        </ul>
      )}
      {wordCtx.question && <p className="muted">It asks: {wordCtx.question}</p>}
    </div>
  )

  return (
    <div className="app">
      {theme === 'halloween' && <Pumpkins />}
      {theme === 'science' && <Elements />}
      {theme === 'tropical' && <Fruits />}
      {holidayById(theme) && <HolidayParticles id={theme} />}
      <header className="top">
        <button className="logo" onClick={() => { setTab('solve'); startNew() }}>
          <span className="logo-mark"><Icon name="scan" /></span> Hunter Scan
        </button>
        <div className="top-actions">
          <label className="switch" title="Make explanations simpler">
            <input type="checkbox" checked={simple} onChange={toggleSimple} />
            <span className="track" />
            <span className="switch-label">ELI12</span>
          </label>
          <button
            className="icon-btn"
            aria-label="Choose theme"
            aria-expanded={themeOpen}
            onClick={() => setThemeOpen((o) => !o)}
          >
            <Icon name="palette" />
          </button>
        </div>
      </header>

      <main className="content">
        {themeOpen && (
          <div className="card stack theme-card">
            <h2>Theme</h2>
            {CATEGORIES.map((c) => (
              <section key={c.id} className="theme-group" aria-label={c.name}>
                <h3>{c.name}</h3>
                <div className="themes">
                  {themesIn(c.id).map((t) => (
                    <button key={t.id} className="theme" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                      <span className="dots">
                        {t.colors.map((col) => <i key={col} style={{ background: col }} />)}
                      </span>
                      <b>{t.name}</b>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {error && <div className="banner warn" role="alert">{error}</div>}
        {tab === 'solve' && screen === 'home' && <InstallHint />}

        {tab === 'buy' && <BuyFlow initial={buyInitial} onHistory={(e) => setHistory(store.addHistory(e))} />}

        {tab === 'extras' && <Extras />}

        {tab === 'history' && (
          <History
            items={history}
            onOpen={openHistory}
            onRemove={(id) => setHistory(store.removeHistory(id))}
            onClear={() => window.confirm('Delete all saved history?') && setHistory(store.clearHistory())}
          />
        )}

        {tab === 'solve' && screen === 'home' && (
          <div
            className={`hero ${dragOver ? 'drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <h1>Snap a problem.<br />Get the work.</h1>
            <p className="muted lead">Photograph any equation on paper. I flatten the page, read it, solve it step by step, and check every line.</p>
            <button className="snap-btn" onClick={startScan}>
              <Icon name="scan" />
              Snap Equation
            </button>
            {hint && <div className="banner info" role="status">{hint}</div>}
            <div className="quick">
              <button className="tile" onClick={() => fileRef.current.click()}><Icon name="upload" />Upload</button>
              <button className="tile" onClick={() => { setLatex(''); setNote(''); setUncertain([]); setWordCtx(null); setActiveIdx(-1); go('edit') }}><Icon name="text" />Type it</button>
              <button className="tile" onClick={() => openPractice(null)}><Icon name="target" />Practice</button>
            </div>
            <ul className="perks">
              <li><Icon name="check" />Fixes handwriting</li>
              <li><Icon name="check" />Checks every line</li>
              <li><Icon name="check" />Graphs and PDFs</li>
            </ul>
            <p className="muted tiny drop-hint">Or drag and drop a picture anywhere here</p>
          </div>
        )}

        {tab === 'solve' && screen === 'scan' && (
          <LiveCamera onCapture={takeShot} onCancel={() => go('home')} onUnavailable={liveUnavailable} />
        )}

        {tab === 'solve' && screen === 'crop' && photo && (
          <Cropper
            src={shots ? (shotMode === 'clean' ? shots.clean : shots.original) : photo}
            onDone={onCropped}
            onCancel={() => go('home')}
            modes={shots?.cleaned ? [{ id: 'clean', label: shots.found ? 'Flattened and cleaned' : 'Lighting cleaned' }, { id: 'original', label: 'Original' }] : null}
            mode={shotMode}
            onMode={setShotMode}
          />
        )}

        {tab === 'solve' && screen === 'reading' && (
          <ScanLoader photo={photo} title="Reading your handwriting…" sub="Finding every symbol." />
        )}

        {tab === 'solve' && screen === 'formulating' && (
          <div className="card center stack scan-card" role="status">
            <div className="spinner" />
            <h2>Turning the words into an equation…</h2>
          </div>
        )}

        {tab === 'solve' && screen === 'unreadable' && (
          <div className="card stack center">
            <div className="empty-ico"><Icon name="search" /></div>
            <h2>I couldn't read that</h2>
            <p>{note}</p>
            <button className="btn cta" onClick={startScan}><Icon name="camera" />Retake photo</button>
            <button className="btn ghost" onClick={() => { setLatex(''); go('edit') }}>Type it in instead</button>
          </div>
        )}

        {tab === 'solve' && screen === 'problems' && (
          <Problems
            items={problems}
            running={running}
            onSolve={openProblem}
            onSolveAll={solveAll}
            onView={(i) => { setActiveIdx(i); setLatex(problems[i].latex); setResult(problems[i].result); go('result') }}
            onBack={startNew}
          />
        )}

        {tab === 'solve' && screen === 'edit' && (
          <Editor
            latex={latex}
            onChange={setLatex}
            note={note}
            busy={busy}
            uncertain={uncertain}
            onResolved={(t) => setUncertain((u) => { const i = u.findIndex((x) => x.text === t); return i < 0 ? u : u.filter((_, k) => k !== i) })}
            title={wordCtx ? 'Does this equation match the story?' : undefined}
            subtitle={wordCtx ? 'I turned the words into an equation. Fix anything that is off, then solve.' : undefined}
            onWordProblem={(text) => startWord(text, -1)}
            onBack={() => go(problems.length > 1 ? 'problems' : result ? 'result' : 'home')}
            onSolve={() => runSolve()}
          >
            {wordPanel}
          </Editor>
        )}

        {tab === 'solve' && screen === 'result' && result && (
          <>
            {busy && <div className="banner info">Re-writing the explanations…</div>}
            <Result
              problem={latex}
              result={result}
              busy={busy}
              onPractice={() => openPractice(latex)}
              onNew={startNew}
              onEdit={() => go('edit')}
              onBackToProblems={problems.length > 1 && activeIdx >= 0 ? () => go('problems') : null}
            />
          </>
        )}

        {tab === 'solve' && screen === 'practice' && (
          <Practice seed={practiceSeed} onSteps={stepsFor} onExit={startNew} />
        )}
      </main>

      {picker(camRef, true)}
      {picker(fileRef, false)}

      <nav className="tabs">
        <button className={tab === 'solve' ? 'on' : ''} onClick={() => setTab('solve')}>
          <span className="ico"><Icon name="camera" /></span> Solve
        </button>
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>
          <span className="ico"><Icon name="bag" /></span> Snap Buy
        </button>
        <button className={tab === 'extras' ? 'on' : ''} onClick={() => setTab('extras')}>
          <span className="ico"><Icon name="grid" /></span> Extras
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          <span className="ico"><Icon name="history" /></span> History
        </button>
      </nav>
    </div>
  )
}
