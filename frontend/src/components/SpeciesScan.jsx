import { useRef, useState } from 'react'
import { loadPhoto } from '../image.js'
import * as api from '../api.js'
import { CONFIDENCE, DANGER, GROUPS } from '../lib/species.js'
import Icon from './Icon.jsx'
import ScanLoader from './ScanLoader.jsx'

function Result({ photo, r, onAgain }) {
  const facts = [['Habitat', r.habitat], ['Diet', r.diet], ['Size', r.size], ['Conservation', r.conservation]].filter(([, v]) => v)
  const bad = r.danger.level === 'dangerous' || r.danger.level === 'use_caution'
  return (
    <div className="stack">
      <div className="card stack plant-head">
        <div className="plant-id">
          {photo && <img className="plant-photo" src={photo} alt="Your photo" />}
          <div>
            <h2>{r.name}</h2>
            {r.scientific && <p className="muted"><i>{r.scientific}</i></p>}
            <div className="chips">
              <span className={`pill conf-${r.confidence}`}>{CONFIDENCE[r.confidence]}</span>
              <span className="pill soft">{GROUPS[r.group]}</span>
            </div>
          </div>
        </div>
        {r.confidence !== 'high' && <p className="muted tiny">This is a guess from one photo. A sharper, closer shot that shows markings or the whole body makes it much better.</p>}
        {r.alternatives.length > 0 && (
          <div>
            <p className="label">Could also be</p>
            <div className="chips">{r.alternatives.map((a, i) => <span key={i} className="chip" title={a.scientific}>{a.name}</span>)}</div>
          </div>
        )}
      </div>

      <div className={`banner ${bad ? 'warn' : r.danger.level === 'harmless' ? 'ok' : 'info'}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <span className="b-ico"><Icon name={bad ? 'alert' : 'check'} /></span>
        <div><b>{DANGER[r.danger.level]}.</b> {r.danger.note}</div>
      </div>
      {r.group === 'fungus' && (
        <div className="banner warn" role="note">Never eat or taste a mushroom or fungus because of a photo scan. Many deadly ones look like safe ones.</div>
      )}

      {r.about && <p>{r.about}</p>}
      {facts.length > 0 && (
        <div className="card stack">
          <dl className="care">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      )}
      {r.fun_fact && <p className="muted center-text">{r.fun_fact}</p>}
      {r.confidence === 'low' && r.photo_tips && <p className="muted tiny">Next photo: {r.photo_tips}</p>}
      <p className="muted tiny center-text">Keep your distance from wild animals, and never handle one because of an app.</p>
      <button className="btn cta" onClick={onAgain}><Icon name="camera" />Scan another</button>
    </div>
  )
}

export default function SpeciesScan({ onBack }) {
  const [screen, setScreen] = useState('home') // home | reading | result
  const [photo, setPhoto] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const abort = useRef(0)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    const run = ++abort.current
    try {
      const dataUrl = await loadPhoto(file, 1600)
      setPhoto(dataUrl)
      setScreen('reading')
      const r = await api.scanSpecies(dataUrl, note)
      if (run !== abort.current) return
      if (!r.found) {
        setError(r.message)
        setScreen('home')
        return
      }
      setResult(r)
      setScreen('result')
    } catch (err) {
      if (run !== abort.current) return
      setError(err.message || 'Something went wrong. Please try again.')
      setScreen('home')
    }
  }

  const again = () => { setScreen('home'); setPhoto(null); setResult(null); setNote(''); setError('') }
  const input = (id, capture) => (
    <input id={id} type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})} hidden onChange={pick} />
  )

  return (
    <>
      {screen === 'home' && <button className="link back" onClick={onBack}><Icon name="back" />Extras</button>}
      {error && <div className="banner warn" role="alert">{error}</div>}

      {screen === 'home' && (
        <div className="hero">
          <h1>Identify a species</h1>
          <p className="muted lead">Snap an animal, bird, insect, fish or fungus. I'll tell you what it is and whether to keep your distance.</p>
          <label className="snap-btn" htmlFor="species-cam"><Icon name="paw" />Snap Species</label>
          <div className="quick two">
            <label className="tile" htmlFor="species-pick"><Icon name="upload" />Upload</label>
            <label className="tile" htmlFor="species-cam"><Icon name="camera" />Camera</label>
          </div>
          <input className="text-input" aria-label="Where was it? (optional)" placeholder="Where was it? e.g. my garden in Texas" maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {screen === 'reading' && <ScanLoader photo={photo} title="Looking closely…" sub="Checking markings, shape and size." onStop={() => { abort.current++; setScreen('home') }} />}
      {screen === 'result' && result && <Result photo={photo} r={result} onAgain={again} />}
      {input('species-cam', true)}
      {input('species-pick', false)}
    </>
  )
}
