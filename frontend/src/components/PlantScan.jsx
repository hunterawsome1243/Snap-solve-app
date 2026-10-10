import { useEffect, useRef, useState } from 'react'
import { loadPhoto, thumbOf } from '../image.js'
import * as api from '../api.js'
import * as store from '../storage.js'
import { buzz } from '../lib/haptics.js'
import { clampEvery, CONFIDENCE, HEALTH, PETS, sortPlants, waterStatus } from '../lib/plants.js'
import Icon from './Icon.jsx'
import ScanLoader from './ScanLoader.jsx'
import Reveal, { scrollTop } from './Reveal.jsx'
import { PROGRESS } from '../lib/progress.js'

const uid = () => 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function Issue({ i }) {
  return (
    <li className={`issue sev-${i.severity}`}>
      <div className="issue-head"><b>{i.name}</b><span className="tag">{i.severity}</span></div>
      {i.signs && <p className="muted tiny">Seen: {i.signs}</p>}
      {i.cause && <p className="tiny">Likely cause: {i.cause}</p>}
      {i.fix && <p><b>What to do:</b> {i.fix}</p>}
    </li>
  )
}

function Result({ photo, r, saved, onSave, onAgain }) {
  const care = [['Light', r.care.light], ['Water', r.care.water], ['Soil', r.care.soil], ['Temperature', r.care.temperature], ['Humidity', r.care.humidity], ['Feeding', r.care.feeding]].filter(([, v]) => v)
  const bad = r.health.status === 'needs_attention'
  return (
    <Reveal>
      <div className="card stack plant-head">
        <div className="plant-id">
          {photo && <img className="plant-photo" src={photo} alt="Your plant" />}
          <div>
            <h2>{r.name}</h2>
            {r.scientific && <p className="muted"><i>{r.scientific}</i></p>}
            <div className="chips">
              <span className={`pill conf-${r.confidence}`}>{CONFIDENCE[r.confidence]}</span>
              {r.kind && <span className="pill soft">{r.kind}</span>}
            </div>
          </div>
        </div>
        {r.confidence !== 'high' && (
          <p className="muted tiny">This is a guess from one photo. A close-up of a leaf and a flower (if it has one) makes it much better.</p>
        )}
        {r.alternatives.length > 0 && (
          <div>
            <p className="label">Could also be</p>
            <div className="chips">{r.alternatives.map((a, i) => <span key={i} className="chip" title={a.scientific}>{a.name}</span>)}</div>
          </div>
        )}
      </div>

      <div className={`banner ${bad ? 'warn' : r.health.status === 'healthy' ? 'ok' : 'info'}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <span className="b-ico"><Icon name={bad ? 'alert' : 'check'} /></span>
        <div><b>{HEALTH[r.health.status]}.</b> {r.health.summary}</div>
      </div>
      {r.health.issues.length > 0 && (
        <div className="card stack">
          <h2>What I can see</h2>
          <ul className="issues">{r.health.issues.map((i, k) => <Issue key={k} i={i} />)}</ul>
        </div>
      )}
      {r.photo_tips && <p className="muted tiny">Next photo: {r.photo_tips}</p>}

      {care.length > 0 && (
        <div className="card stack">
          <h2>How to look after it</h2>
          <dl className="care">
            {care.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      )}

      <div className={`card stack pets pets-${r.pets.status}`}>
        <div className="row"><Icon name={r.pets.status === 'toxic' ? 'alert' : 'leaf'} /><b>{PETS[r.pets.status]}</b></div>
        {r.pets.note && <p>{r.pets.note}</p>}
        <p className="muted tiny">Check a trusted source or your vet before you rely on this. Never eat a plant, berry or mushroom because of a photo scan.</p>
      </div>

      {r.fun_fact && <p className="muted center-text">{r.fun_fact}</p>}

      <div className="row wrap">
        <button className={`btn secondary grow ${saved ? 'done' : ''}`} disabled={saved} onClick={onSave}>
          <Icon name={saved ? 'check' : 'leaf'} />{saved ? 'Saved to My Plants' : 'Save to My Plants'}
        </button>
        <button className="btn cta grow" onClick={onAgain}><Icon name="camera" />Scan another</button>
      </div>
    </Reveal>
  )
}

function MyPlants({ plants, setPlants, onOpen }) {
  const [now, setNow] = useState(Date.now())
  const [justWatered, setJustWatered] = useState(null) // which plant's button just confirmed, for the pop
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const update = (id, patch) => setPlants(store.savePlants(plants.map((p) => (p.id === id ? { ...p, ...patch } : p))))
  const remove = (id) => setPlants(store.savePlants(plants.filter((p) => p.id !== id)))
  const water = (id) => { buzz(15); const t = Date.now(); setNow(t); setJustWatered(id); update(id, { watered: t }) }
  if (!plants.length) return null
  return (
    <div className="card stack" data-testid="my-plants">
      <h2>My Plants</h2>
      <ul className="plant-list">
        {sortPlants(plants, now).map((p) => {
          const st = waterStatus(p, now)
          return (
            <li key={p.id} className="plant-row">
              {p.photo ? <img src={p.photo} alt="" /> : <span className="plant-ph"><Icon name="leaf" /></span>}
              <div className="plant-info">
                <b>{p.name}</b>
                <span className={`due ${st.due ? 'now' : ''}`}>{st.label}</span>
                <details className="plant-edit">
                  <summary>Edit</summary>
                  <div className="row wrap">
                    <label className="muted tiny" htmlFor={`ev${p.id}`}>Water every</label>
                    <input id={`ev${p.id}`} className="text-input small" type="number" min="1" max="60" inputMode="numeric" value={p.every ?? ''} placeholder="days"
                      onChange={(e) => update(p.id, { every: e.target.value === '' ? null : clampEvery(e.target.value) })} />
                    <span className="muted tiny">days</span>
                    <button className="btn ghost" onClick={() => remove(p.id)}>Remove</button>
                  </div>
                </details>
              </div>
              <button className={`btn secondary water ${justWatered === p.id ? 'done' : ''}`} onClick={() => water(p.id)} onAnimationEnd={() => setJustWatered(null)} aria-label={`Mark ${p.name} watered`}><Icon name="drop" />Watered</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function PlantScan({ onBack }) {
  const [screen, setScreen] = useState('home') // home | reading | result
  const [photo, setPhoto] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [plants, setPlants] = useState(store.loadPlants)
  const [savedId, setSavedId] = useState(null)
  const abort = useRef(0)
  useEffect(() => { scrollTop() }, [screen])

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
      const r = await api.scanPlant(dataUrl, note)
      if (run !== abort.current) return
      if (!r.is_plant) {
        setError(r.message)
        setScreen('home')
        return
      }
      setResult(r)
      setSavedId(null)
      setScreen('result')
    } catch (err) {
      if (run !== abort.current) return
      setError(err.message || 'Something went wrong. Please try again.')
      setScreen('home')
    }
  }

  async function save() {
    const every = result.care.water_every_days
    const plant = {
      id: uid(), name: result.name, scientific: result.scientific, photo: await thumbOf(photo),
      every, watered: Date.now(), saved: Date.now(), pets: result.pets.status,
    }
    setPlants(store.savePlants([plant, ...plants]))
    setSavedId(plant.id)
    buzz(18)
  }

  const again = () => { setScreen('home'); setPhoto(null); setResult(null); setNote(''); setError('') }
  const input = (id, capture) => (
    <input id={id} type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})} hidden onChange={pick} />
  )

  return (
    <>
      {screen === 'home' && (
        <button className="link back" onClick={onBack}><Icon name="back" />Extras</button>
      )}
      {error && <div className="banner warn" role="alert" key={error}>{error}</div>}

      {screen === 'home' && (
        <>
          <div className="hero">
            <h1>Scan a plant</h1>
            <p className="muted lead">Snap a leaf or the whole plant. I'll tell you what it is, how it looks, and how to care for it.</p>
            <label className="snap-btn" htmlFor="plant-cam"><Icon name="leaf" />Snap Plant</label>
            <div className="quick two">
              <label className="tile" htmlFor="plant-pick"><Icon name="upload" />Upload</label>
              <label className="tile" htmlFor="plant-cam"><Icon name="camera" />Camera</label>
            </div>
            <input className="text-input" aria-label="Anything wrong with it? (optional)" placeholder="Anything wrong? e.g. yellow leaves" maxLength={200}
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <MyPlants plants={plants} setPlants={setPlants} />
        </>
      )}
      {screen === 'reading' && <ScanLoader photo={photo} title="Looking at your plant…" lines={PROGRESS.plant} onStop={() => { abort.current++; setScreen('home') }} />}
      {screen === 'result' && result && <Result photo={photo} r={result} saved={!!savedId} onSave={save} onAgain={again} />}
      {input('plant-cam', true)}
      {input('plant-pick', false)}
    </>
  )
}
