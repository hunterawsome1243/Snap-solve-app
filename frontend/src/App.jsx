import { useEffect, useRef, useState } from 'react'
import { loadPhoto } from './image.js'
import * as api from './api.js'
import * as store from './storage.js'
import Cropper from './components/Cropper.jsx'
import Editor from './components/Editor.jsx'
import Result from './components/Result.jsx'
import History from './components/History.jsx'

const THEMES = [
  { id: 'auto', name: 'Match device', colors: ['#f4f5fb', '#4f46e5', '#0e1020'] },
  { id: 'light', name: 'Light', colors: ['#f4f5fb', '#4f46e5', '#171a2b'] },
  { id: 'dark', name: 'Dark', colors: ['#0e1020', '#8b83ff', '#eceefa'] },
  { id: 'halloween', name: 'Halloween', colors: ['#150c20', '#ff8a1f', '#f7ead9'] },
  { id: 'ocean', name: 'Ocean', colors: ['#eaf6f8', '#087f92', '#07313c'] },
  { id: 'forest', name: 'Forest', colors: ['#0e1913', '#6fcf8c', '#e5f0e7'] },
  { id: 'sunset', name: 'Sunset', colors: ['#fff3ee', '#d93f57', '#3a1620'] },
]
const SKINS = ['halloween', 'ocean', 'forest', 'sunset']

export default function App() {
  const [tab, setTab] = useState('solve') // solve | history
  const [screen, setScreen] = useState('home') // home | crop | reading | unreadable | edit | result
  const [photo, setPhoto] = useState(null)
  const [latex, setLatex] = useState('')
  const [note, setNote] = useState('')
  const [isPractice, setIsPractice] = useState(false)
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

  async function onFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return fail(new Error('Please choose an image file.'))
    try {
      setPhoto(await loadPhoto(file))
      setTab('solve')
      go('crop')
    } catch {
      fail(new Error("Couldn't open that image. Try a JPG or PNG."))
    }
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
      setLatex(r.latex)
      setNote(r.message)
      setIsPractice(false)
      go('edit')
    } catch (e) {
      go('crop')
      fail(e)
    }
  }

  async function runSolve(text = latex, simpleMode = simple) {
    setBusy(true)
    setError('')
    try {
      const r = await api.solve(text, simpleMode)
      setResult(r)
      setHistory(
        store.addHistory({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), ts: Date.now(), latex: text, result: r }),
      )
      setScreen('result')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function onPractice() {
    setBusy(true)
    setError('')
    try {
      const r = await api.practice(latex)
      setLatex(r.latex)
      setNote('')
      setIsPractice(true)
      setResult(null)
      setScreen('edit')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  function toggleSimple() {
    const next = !simple
    setSimple(next)
    store.setPref('simple', next)
    if (tab === 'solve' && screen === 'result') runSolve(latex, next)
  }

  function openHistory(item) {
    setLatex(item.latex)
    setResult(item.result)
    setIsPractice(false)
    setTab('solve')
    go('result')
  }

  const startNew = () => {
    setLatex('')
    setResult(null)
    setIsPractice(false)
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

  return (
    <div className="app">
      <header className="top">
        <button className="logo" onClick={() => { setTab('solve'); startNew() }}>
          <span className="logo-mark">∑</span> SnapSolve
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
            🎨
          </button>
        </div>
      </header>

      <main className="content">
        {themeOpen && (
          <div className="card stack">
            <h2>Theme</h2>
            <div className="themes">
              {THEMES.map((t) => (
                <button key={t.id} className="theme" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                  <span className="dots">
                    {t.colors.map((c) => <i key={c} style={{ background: c }} />)}
                  </span>
                  <b>{t.name}</b>
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="banner warn" role="alert">{error}</div>}

        {tab === 'history' && (
          <History
            items={history}
            onOpen={openHistory}
            onRemove={(id) => setHistory(store.removeHistory(id))}
            onClear={() => window.confirm('Delete all saved problems?') && setHistory(store.clearHistory())}
          />
        )}

        {tab === 'solve' && screen === 'home' && (
          <div
            className={`hero card ${dragOver ? 'drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <h1>Snap a problem.<br />Get the work.</h1>
            <p className="muted">Take a photo of any equation on paper and see it solved step by step.</p>
            <button className="snap-btn" onClick={() => camRef.current.click()}>
              <span className="snap-icon">📷</span>
              Snap Equation
            </button>
            <div className="row center-row">
              <button className="btn secondary" onClick={() => fileRef.current.click()}>Upload image</button>
              <button className="btn ghost" onClick={() => { setLatex(''); setNote(''); setIsPractice(false); go('edit') }}>
                Type it
              </button>
            </div>
            <p className="muted tiny drop-hint">…or drag & drop a picture here</p>
          </div>
        )}

        {tab === 'solve' && screen === 'crop' && photo && (
          <Cropper src={photo} onDone={onCropped} onCancel={() => go('home')} />
        )}

        {tab === 'solve' && screen === 'reading' && (
          <div className="card center">
            <div className="spinner" />
            <h2>Reading your handwriting…</h2>
            {photo && <img className="thumb" src={photo} alt="" />}
          </div>
        )}

        {tab === 'solve' && screen === 'unreadable' && (
          <div className="card stack center">
            <div className="big-emoji">🔍</div>
            <h2>I couldn't read that</h2>
            <p>{note}</p>
            <button className="btn primary" onClick={() => camRef.current.click()}>📷 Retake photo</button>
            <button className="btn ghost" onClick={() => { setLatex(''); go('edit') }}>Type it in instead</button>
          </div>
        )}

        {tab === 'solve' && screen === 'edit' && (
          <Editor
            latex={latex}
            onChange={setLatex}
            note={note}
            busy={busy}
            practice={isPractice}
            onBack={() => go(result ? 'result' : 'home')}
            onSolve={() => runSolve()}
          />
        )}

        {tab === 'solve' && screen === 'result' && result && (
          <>
            {busy && <div className="banner info">Re-writing the explanations…</div>}
            <Result
              problem={latex}
              result={result}
              busy={busy}
              onPractice={onPractice}
              onNew={startNew}
              onEdit={() => go('edit')}
            />
          </>
        )}
      </main>

      {picker(camRef, true)}
      {picker(fileRef, false)}

      <nav className="tabs">
        <button className={tab === 'solve' ? 'on' : ''} onClick={() => setTab('solve')}>
          <span>📷</span> Solve
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          <span>🕘</span> History
        </button>
      </nav>
    </div>
  )
}
