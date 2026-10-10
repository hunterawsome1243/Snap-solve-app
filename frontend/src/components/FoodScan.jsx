import { useEffect, useRef, useState } from 'react'
import { loadPhoto, thumbOf } from '../image.js'
import * as api from '../api.js'
import * as store from '../storage.js'
import { buzz } from '../lib/haptics.js'
import { CONFIDENCE, dayTotals, fmtVal, mealsOn } from '../lib/food.js'
import Icon from './Icon.jsx'
import ScanLoader from './ScanLoader.jsx'
import Reveal, { scrollTop } from './Reveal.jsx'
import { PROGRESS } from '../lib/progress.js'

const uid = () => 'ml' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Result({ photo, r, saved, onSave, onAgain }) {
  const t = r.totals
  const more = [['Fiber', t.fiber_g, ' g'], ['Sugar', t.sugar_g, ' g'], ['Sodium', t.sodium_mg, ' mg']].filter(([, v]) => v !== null)
  return (
    <Reveal>
      <div className="card stack plant-head">
        <div className="plant-id">
          {photo && <img className="plant-photo" src={photo} alt="Your food" />}
          <div>
            <h2>{r.name}</h2>
            {r.serving && <p className="muted">{r.serving}</p>}
            <div className="chips">
              <span className={`pill conf-${r.confidence}`}>{CONFIDENCE[r.confidence]}</span>
              <span className="pill soft">{r.source === 'label' ? 'Read from the label' : 'Estimated from the photo'}</span>
            </div>
          </div>
        </div>
        <div className="kcal"><b>{fmtVal(t.calories)}</b><span>calories</span></div>
        <dl className="macros">
          <div><dt>Protein</dt><dd>{fmtVal(t.protein_g, ' g')}</dd></div>
          <div><dt>Carbs</dt><dd>{fmtVal(t.carbs_g, ' g')}</dd></div>
          <div><dt>Fat</dt><dd>{fmtVal(t.fat_g, ' g')}</dd></div>
        </dl>
        {more.length > 0 && <p className="muted tiny">{more.map(([k, v, u]) => `${k} ${fmtVal(v, u)}`).join(' · ')}</p>}
      </div>

      {r.items.length > 1 && (
        <div className="card stack">
          <h2>What I can see</h2>
          <ul className="food-items">
            {r.items.map((i, k) => (
              <li key={k}><span><b>{i.name}</b>{i.portion && <span className="muted"> · {i.portion}</span>}</span><span>{i.calories === null ? '' : `${fmtVal(i.calories)} cal`}</span></li>
            ))}
          </ul>
        </div>
      )}

      {r.allergens.length > 0 && (
        <div className="card stack">
          <p className="label">May contain</p>
          <div className="chips">{r.allergens.map((a) => <span key={a} className="chip allergen">{a}</span>)}</div>
          <p className="muted tiny">A photo can't show everything in a food. If you have an allergy, check the packaging.</p>
        </div>
      )}
      {r.notes && <p className="muted">{r.notes}</p>}
      {r.confidence !== 'high' && r.photo_tips && <p className="muted tiny">Next photo: {r.photo_tips}</p>}
      <p className="muted tiny center-text">Numbers from a photo are estimates, not medical advice.</p>

      <div className="row wrap">
        <button className={`btn secondary grow ${saved ? 'done' : ''}`} disabled={saved} onClick={onSave}>
          <Icon name={saved ? 'check' : 'food'} />{saved ? 'Added to today' : 'Add to today'}
        </button>
        <button className="btn cta grow" onClick={onAgain}><Icon name="camera" />Scan another</button>
      </div>
    </Reveal>
  )
}

function Today({ meals, setMeals }) {
  const today = mealsOn(meals)
  if (!today.length) return null
  const sum = dayTotals(today)
  const remove = (id) => setMeals(store.saveMeals(meals.filter((m) => m.id !== id)))
  return (
    <div className="card stack" data-testid="food-log">
      <div className="row between"><h2>Today</h2><b>{sum.calories} cal</b></div>
      <p className="muted tiny">Protein {sum.protein_g} g · Carbs {sum.carbs_g} g · Fat {sum.fat_g} g</p>
      <ul className="plant-list">
        {today.map((m) => (
          <li key={m.id} className="plant-row">
            {m.photo ? <img src={m.photo} alt="" /> : <span className="plant-ph"><Icon name="food" /></span>}
            <div className="plant-info"><b>{m.name}</b><span className="due">{m.calories} cal · {timeOf(m.at)}</span></div>
            <button className="btn ghost" onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`}><Icon name="close" /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function FoodScan({ onBack }) {
  const [screen, setScreen] = useState('home') // home | reading | result
  const [photo, setPhoto] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [meals, setMeals] = useState(store.loadMeals)
  const [saved, setSaved] = useState(false)
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
      const r = await api.scanFood(dataUrl, note)
      if (run !== abort.current) return
      if (!r.is_food) {
        setError(r.message)
        setScreen('home')
        return
      }
      setResult(r)
      setSaved(false)
      setScreen('result')
    } catch (err) {
      if (run !== abort.current) return
      setError(err.message || 'Something went wrong. Please try again.')
      setScreen('home')
    }
  }

  async function save() {
    const t = result.totals
    const meal = { id: uid(), name: result.name, calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, photo: await thumbOf(photo), at: Date.now() }
    setMeals(store.saveMeals([meal, ...meals]))
    setSaved(true)
    buzz(18)
  }

  const again = () => { setScreen('home'); setPhoto(null); setResult(null); setNote(''); setError('') }
  const input = (id, capture) => (
    <input id={id} type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})} hidden onChange={pick} />
  )

  return (
    <>
      {screen === 'home' && <button className="link back" onClick={onBack}><Icon name="back" />Extras</button>}
      {error && <div className="banner warn" role="alert" key={error}>{error}</div>}

      {screen === 'home' && (
        <>
          <div className="hero">
            <h1>Scan your food</h1>
            <p className="muted lead">Snap a meal, a snack or a nutrition label. I'll estimate the calories and nutrients and flag common allergens.</p>
            <label className="snap-btn" htmlFor="food-cam"><Icon name="food" />Snap Food</label>
            <div className="quick two">
              <label className="tile" htmlFor="food-pick"><Icon name="upload" />Upload</label>
              <label className="tile" htmlFor="food-cam"><Icon name="camera" />Camera</label>
            </div>
            <input className="text-input" aria-label="Anything to know? (optional)" placeholder="Anything to know? e.g. about half the plate" maxLength={200}
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Today meals={meals} setMeals={setMeals} />
        </>
      )}
      {screen === 'reading' && <ScanLoader photo={photo} title="Looking at your food…" lines={PROGRESS.food} onStop={() => { abort.current++; setScreen('home') }} />}
      {screen === 'result' && result && <Result photo={photo} r={result} saved={saved} onSave={save} onAgain={again} />}
      {input('food-cam', true)}
      {input('food-pick', false)}
    </>
  )
}
