import { useState } from 'react'
import { loadPhoto } from '../image.js'
import * as api from '../api.js'
import Cropper from './Cropper.jsx'

function money(price, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price)
  } catch {
    return `${price.toFixed(2)} ${currency}`
  }
}

function Offer({ o, best }) {
  const meta = [
    o.in_stock === 'yes' ? 'in stock' : o.in_stock === 'no' ? 'out of stock' : null,
    o.condition !== 'unknown' ? o.condition : null,
    o.note || null,
  ].filter(Boolean)
  return (
    <a className={`offer ${best ? 'best' : ''}`} href={o.url} target="_blank" rel="noopener noreferrer nofollow">
      <div className="offer-main">
        <div className="offer-name">
          {o.retailer}
          {o.recommended && <span className="tag">Recommended</span>}
        </div>
        <div className="muted tiny">{meta.join(' · ')}</div>
      </div>
      <div className="offer-price">{money(o.price, o.currency)}</div>
    </a>
  )
}

function Recommendation({ r }) {
  const offer = r.kind === 'offer'
  return (
    <div className="card stack rec">
      <span className="tag">{offer ? 'Best deal' : 'Most likely to have it'}</span>
      <div className="label">Recommended store</div>
      <div className="rec-top">
        <h2>{r.retailer}</h2>
        {offer && <div className="offer-price">{money(r.price, r.currency)}</div>}
      </div>
      <p>{r.reason}</p>
      <a className="btn primary" href={r.url} target="_blank" rel="noopener noreferrer nofollow">
        {offer ? `Buy at ${r.retailer}` : `Search ${r.retailer}`}
      </a>
    </div>
  )
}

export default function BuyFlow() {
  const [screen, setScreen] = useState('home') // home | crop | identifying | unreadable | confirm | searching | results
  const [photo, setPhoto] = useState(null)
  const [product, setProduct] = useState(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const fail = (e) => setError(e.message || 'Something went wrong.')

  async function onFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return fail(new Error('Please choose an image file.'))
    try {
      setError('')
      setPhoto(await loadPhoto(file))
      setScreen('crop')
    } catch {
      fail(new Error("Couldn't open that image. Try a JPG or PNG."))
    }
  }

  async function onCropped(dataUrl) {
    setPhoto(dataUrl)
    setScreen('identifying')
    setError('')
    try {
      const p = await api.identifyProduct(dataUrl)
      setProduct(p)
      if (!p.identifiable) return setScreen('unreadable')
      setQuery(p.query)
      setScreen('confirm')
    } catch (e) {
      setScreen('crop')
      fail(e)
    }
  }

  async function search() {
    setScreen('searching')
    setError('')
    try {
      const r = await api.findPrices(query.trim())
      setResult({ ...r, offers: [...r.offers].sort((a, b) => a.price - b.price) })
      setScreen('results')
    } catch (e) {
      setScreen('confirm')
      fail(e)
    }
  }

  const reset = () => {
    setScreen('home')
    setError('')
    setProduct(null)
    setResult(null)
  }

  const picker = (id, capture) => (
    <input
      id={id}
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
    <>
      {picker('buy-cam', true)}
      {picker('buy-pick', false)}
      {error && <div className="banner warn" role="alert">{error}</div>}

      {screen === 'home' && (
        <div className="hero card">
          <h1>Snap it.<br />Find the best price.</h1>
          <p className="muted">Take a photo of any product and get links to the cheapest places to buy it.</p>
          <label className="snap-btn" htmlFor="buy-cam">
            <span className="snap-icon">🛍️</span>
            Snap Buy
          </label>
          <div className="row center-row">
            <label className="btn secondary" htmlFor="buy-pick">Upload image</label>
            <button className="btn ghost" onClick={() => { setProduct(null); setQuery(''); setScreen('confirm') }}>Type it</button>
          </div>
        </div>
      )}

      {screen === 'crop' && photo && <Cropper src={photo} onDone={onCropped} onCancel={reset} />}

      {(screen === 'identifying' || screen === 'searching') && (
        <div className="card center">
          <div className="spinner" />
          <h2>{screen === 'identifying' ? 'Figuring out what this is…' : 'Comparing prices…'}</h2>
          <p className="muted">{screen === 'searching' ? 'Searching stores. This can take up to a minute.' : ''}</p>
          {photo && <img className="thumb" src={photo} alt="" />}
        </div>
      )}

      {screen === 'unreadable' && product && (
        <div className="card stack center">
          <div className="big-emoji">🔍</div>
          <h2>I couldn't tell what that is</h2>
          <p>{product.message}</p>
          <label className="btn primary" htmlFor="buy-cam">📷 Retake photo</label>
          <button className="btn ghost" onClick={() => { setQuery(''); setScreen('confirm') }}>Type the product instead</button>
        </div>
      )}

      {screen === 'confirm' && (
        <div className="card stack">
          <h2>Is this the right product?</h2>
          <p className="muted">Add the brand, model or size for a better match.</p>
          {product?.message && <div className="banner info">{product.message}</div>}
          {photo && product && <img className="thumb" src={photo} alt="Your photo" />}
          <label className="label" htmlFor="buy-query">Search for</label>
          <input id="buy-query" className="text-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Sony WH-1000XM5 headphones" />
          <div className="row">
            <button className="btn ghost" onClick={reset}>Back</button>
            <button className="btn primary grow" disabled={query.trim().length < 2} onClick={search}>Find best price</button>
          </div>
        </div>
      )}

      {screen === 'results' && result && (
        <div className="stack">
          <div className="label">Results for {result.query}</div>
          {result.recommendation && <Recommendation r={result.recommendation} />}
          {result.offers.length === 0 && (
            <div className="banner info">No reliable prices found. {result.summary}</div>
          )}
          {result.offers.length > 0 && result.summary && <p className="muted">{result.summary}</p>}

          {result.offers.length > 0 && (
            <div className="card stack">
              <h2>All offers, cheapest first</h2>
              {result.offers.map((o) => <Offer key={o.url} o={o} best={o.recommended} />)}
            </div>
          )}

          <div className="card stack">
            <h2>Search more stores</h2>
            <p className="muted tiny">These open a store search, sorted by price where the store allows it.</p>
            <div className="chips">
              {result.compare.map((c) => (
                <a key={c.url} className="chip" href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
              ))}
            </div>
          </div>

          <p className="muted tiny center-text">
            Prices came from a web search on {new Date(result.checked_at * 1000).toLocaleString()} and can change.
            Check the price on the store&apos;s page before you buy.
          </p>
          <button className="btn primary" onClick={reset}>🛍️ Snap another</button>
        </div>
      )}
    </>
  )
}
