import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPhoto } from '../image.js'
import * as api from '../api.js'
import * as store from '../storage.js'
import { decodeBarcode } from '../lib/barcode.js'
import { ago, isStale } from '../lib/time.js'
import Cropper from './Cropper.jsx'
import Icon from './Icon.jsx'
import ScanLoader from './ScanLoader.jsx'
import BarcodeCamera from './BarcodeCamera.jsx'

const NO_FILTERS = { new_only: false, free_shipping: false, max_price: null, preferred_store: '' }
const isDefault = (f) => !f.new_only && !f.free_shipping && f.max_price == null && !f.preferred_store.trim()

function money(price, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price)
  } catch {
    return `${price.toFixed(2)} ${currency}`
  }
}

// The price we follow when tracking: the cheapest new item you could actually order.
export function trackPrice(offers) {
  const usable = offers.filter((o) => (o.condition === 'new' || o.condition === 'unknown') && o.in_stock !== 'no')
  const pool = usable.length ? usable : offers
  if (!pool.length) return null
  const o = pool.reduce((a, b) => (b.price < a.price ? b : a))
  return { price: o.price, currency: o.currency, retailer: o.retailer, url: o.url }
}

function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
  } catch {
    /* some mobile browsers throw; the in-app banner still shows */
  }
}

function Offer({ o, best }) {
  const meta = [
    o.in_stock === 'yes' ? 'in stock' : o.in_stock === 'no' ? 'out of stock' : null,
    o.condition !== 'unknown' ? o.condition : null,
    o.free_shipping === 'yes' ? 'free shipping' : null,
    o.note || null,
    o.seen ? `page seen ${o.seen}` : null,
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
      <a className="btn cta" href={r.url} target="_blank" rel="noopener noreferrer nofollow">
        <Icon name={offer ? 'bag' : 'search'} />{offer ? `Buy at ${r.retailer}` : `Search ${r.retailer}`}
      </a>
    </div>
  )
}

export default function BuyFlow({ initial, onHistory }) {
  const [view, setView] = useState('search') // search | tracked
  const [screen, setScreen] = useState('home') // home | crop | identifying | unreadable | confirm | searching | results
  const [photo, setPhoto] = useState(null)
  const [product, setProduct] = useState(null)
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState(null)
  const [raw, setRaw] = useState(null)
  const [ranked, setRanked] = useState(null)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [tracked, setTracked] = useState(store.loadTracked)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [liveBlocked, setLiveBlocked] = useState(false) // the live camera wasn't available, so Scan barcode takes a photo
  const liveOk = !liveBlocked && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
  const [auto, setAuto] = useState(() => store.getPref('buy.auto', false))
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const rankSeq = useRef(0)

  const fail = (e) => setError(e.message || 'Something went wrong.')
  const persistTracked = (items) => setTracked(store.saveTracked(items))

  // opened from History
  useEffect(() => {
    if (!initial) return
    setView('search')
    setQuery(initial.query)
    setRaw(initial.result)
    setFilters(NO_FILTERS)
    setRanked({ offers: initial.result.offers, hidden: 0, recommendation: initial.result.recommendation })
    setScreen('results')
  }, [initial])

  // re-rank when the filters change (no AI call, no cost)
  useEffect(() => {
    if (!raw) return
    if (isDefault(filters)) {
      setRanked({ offers: raw.offers, hidden: 0, recommendation: raw.recommendation })
      return
    }
    const seq = ++rankSeq.current
    const t = setTimeout(async () => {
      try {
        const r = await api.rankOffers({ query: raw.query, offers: raw.offers, likely_stores: raw.likely_stores || [], filters })
        if (seq === rankSeq.current) setRanked(r)
      } catch (e) {
        if (seq === rankSeq.current) fail(e)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [filters, raw])

  async function onFile(file, mode) {
    if (!file) return
    if (!file.type.startsWith('image/')) return fail(new Error('Please choose an image file.'))
    setError('')
    if (mode === 'barcode') {
      setScreen('scanning')
      const code = await decodeBarcode(file, { loadZXing: () => import('@zxing/library') }).catch(() => null)
      if (!code) {
        setScreen('home')
        return fail(new Error("Couldn't read a barcode. Fill the frame with it, hold steady in good light, or type the product name."))
      }
      setBarcode(code)
      setProduct(null)
      setPhoto(null)
      setQuery(`UPC ${code}`)
      return setScreen('confirm')
    }
    try {
      setBarcode(null)
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

  async function runSearch(q = query, keepFilters = false) {
    setScreen('searching')
    setError('')
    try {
      const r = await api.findPrices(q.trim())
      setRaw(r)
      if (!keepFilters) setFilters(NO_FILTERS)
      setRanked({ offers: r.offers, hidden: 0, recommendation: r.recommendation })
      onHistory?.({ type: 'buy', id: `b${Date.now().toString(36)}`, ts: r.checked_at * 1000, query: r.query, result: r })
      setScreen('results')
    } catch (e) {
      setScreen('confirm')
      fail(e)
    }
  }

  function track() {
    const tp = trackPrice(raw.offers)
    if (!tp) return setNotice('There is no price to track yet. Try again when offers show up.')
    const at = Date.now()
    persistTracked([{ id: `t${at.toString(36)}`, query: raw.query, createdAt: at, baseline: { ...tp, at }, last: { ...tp, at }, target: null, alert: null, result: raw }, ...tracked.filter((t) => t.query !== raw.query)])
    setNotice(`Tracking ${raw.query}. Re-check it from the Tracked tab.`)
  }

  async function recheck(item) {
    setBusyId(item.id)
    setError('')
    try {
      const r = await api.findPrices(item.query)
      const tp = trackPrice(r.offers)
      const at = Date.now()
      persistTracked(
        store.loadTracked().map((t) => {
          if (t.id !== item.id) return t
          if (!tp) return { ...t, result: r, checkedAt: at, note: 'No prices found this time.' }
          const dropped = tp.currency === t.last.currency && tp.price < t.last.price
          const hitTarget = t.target != null && tp.currency === t.last.currency && tp.price <= t.target
          const alert = dropped || hitTarget ? { from: t.last.price, to: tp.price, at, target: hitTarget } : t.alert
          if (dropped || hitTarget) notify(`Price drop: ${t.query}`, `${money(tp.price, tp.currency)} at ${tp.retailer} (was ${money(t.last.price, t.last.currency)})`)
          return { ...t, last: { ...tp, at }, result: r, checkedAt: at, note: '', alert }
        }),
      )
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  async function recheckAll(onlyStale = false) {
    for (const t of store.loadTracked()) {
      if (onlyStale && Date.now() - t.last.at < 12 * 3600 * 1000) continue
      // eslint-disable-next-line no-await-in-loop
      await recheck(t)
    }
  }
  useEffect(() => { if (auto && store.loadTracked().length) recheckAll(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setTarget = (id, v) => persistTracked(tracked.map((t) => (t.id === id ? { ...t, target: v === '' ? null : Number(v) } : t)))
  const dismiss = (id) => persistTracked(tracked.map((t) => (t.id === id ? { ...t, alert: null } : t)))
  const remove = (id) => persistTracked(tracked.filter((t) => t.id !== id))
  const openTracked = (t) => { setQuery(t.query); setRaw(t.result); setFilters(NO_FILTERS); setRanked({ offers: t.result.offers, hidden: 0, recommendation: t.result.recommendation }); setView('search'); setScreen('results') }
  const reset = () => { setScreen('home'); setError(''); setNotice(''); setProduct(null); setRaw(null); setBarcode(null) }
  const alerts = tracked.filter((t) => t.alert).length
  const stores = useMemo(() => [...new Set((raw?.offers || []).map((o) => o.retailer))], [raw])
  const isTracked = raw && tracked.some((t) => t.query === raw.query)

  const picker = (id, capture, mode) => (
    <input id={id} type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})} hidden
      onChange={(e) => { onFile(e.target.files[0], mode); e.target.value = '' }} />
  )

  return (
    <>
      {picker('buy-cam', true, 'photo')}
      {picker('buy-pick', false, 'photo')}
      {picker('buy-scan', true, 'barcode')}

      <div className="chips seg" role="tablist" aria-label="Snap Buy sections">
        <button role="tab" aria-selected={view === 'search'} className={`chip ${view === 'search' ? 'on' : ''}`} onClick={() => setView('search')}>Search</button>
        <button role="tab" aria-selected={view === 'tracked'} className={`chip ${view === 'tracked' ? 'on' : ''}`} onClick={() => setView('tracked')}>
          Tracked ({tracked.length}){alerts > 0 && <span className="dot" aria-label={`${alerts} price drops`} />}
        </button>
      </div>

      {error && <div className="banner warn" role="alert">{error}</div>}
      {notice && <div className="banner ok" role="status">{notice}</div>}

      {view === 'tracked' && (
        <div className="stack">
          {tracked.length === 0 && (
            <div className="card center stack">
              <div className="empty-ico"><Icon name="trend" /></div>
              <h2>Nothing tracked yet</h2>
              <p className="muted">Search for a product, then tap “Track this price”. Re-check it later to see if it dropped.</p>
            </div>
          )}
          {tracked.length > 0 && (
            <div className="card stack">
              <div className="row wrap">
                <button className="btn primary grow" disabled={!!busyId} onClick={() => recheckAll(false)}>{busyId ? 'Checking…' : 'Re-check all'}</button>
                {perm === 'default' && <button className="btn secondary" onClick={async () => setPerm(await Notification.requestPermission())}>Allow notifications</button>}
              </div>
              <label className="check"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); store.setPref('buy.auto', e.target.checked) }} /> Re-check old items when I open the app <span className="muted tiny">(each check uses a web search)</span></label>
              <p className="muted tiny">Alerts appear while the app is open. Checking in the background would need a server, so a price can change between visits without a ping.</p>
            </div>
          )}
          {tracked.map((t) => {
            const delta = t.last.price - t.baseline.price
            const stale = isStale(t.last.at)
            return (
              <div className="card stack" key={t.id}>
                <h2>{t.query}</h2>
                {t.alert && (
                  <div className="banner ok" role="status">
                    <strong>{t.alert.target ? 'Hit your target price!' : 'Price drop!'}</strong>
                    <span>{money(t.alert.from, t.last.currency)} → {money(t.alert.to, t.last.currency)} at {t.last.retailer}</span>
                    <button className="link left" onClick={() => dismiss(t.id)}>Dismiss</button>
                  </div>
                )}
                <div className="rec-top">
                  <div>
                    <div className="muted tiny">Best new price now · {t.last.retailer}</div>
                    <div className="offer-price big">{money(t.last.price, t.last.currency)}</div>
                  </div>
                  <div className={`delta ${delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}>
                    {delta === 0 ? 'No change' : `${delta < 0 ? '↓' : '↑'} ${money(Math.abs(delta), t.last.currency)}`}
                    <span className="muted tiny"> since {new Date(t.baseline.at).toLocaleDateString()}</span>
                  </div>
                </div>
                {t.note && <div className="banner info">{t.note}</div>}
                <div className={`tiny ${stale ? 'stale' : 'muted'}`}>{stale ? <Icon name="alert" className="inline" /> : null}Checked {ago(t.last.at)}{stale ? '. Prices may have changed.' : ''}</div>
                <div className="row">
                  <label className="muted tiny" htmlFor={`tg${t.id}`}>Alert me below</label>
                  <input id={`tg${t.id}`} className="text-input small" type="number" min="0" step="0.01" inputMode="decimal" placeholder={t.last.currency} value={t.target ?? ''} onChange={(e) => setTarget(t.id, e.target.value)} />
                </div>
                <div className="row wrap">
                  <button className="btn primary grow" disabled={!!busyId} onClick={() => recheck(t)}>{busyId === t.id ? 'Checking…' : 'Re-check'}</button>
                  <button className="btn secondary" onClick={() => openTracked(t)}>View offers</button>
                  <button className="btn ghost" onClick={() => remove(t.id)}>Remove</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'search' && (
        <>
          {screen === 'home' && (
            <div className="hero">
              <h1>Snap it.<br />Find the best price.</h1>
              <p className="muted lead">Photograph a product or scan its barcode. I find the store most likely to have it for the best deal.</p>
              <label className="snap-btn" htmlFor="buy-cam">
                <Icon name="bag" />
                Snap Buy
              </label>
              <div className="quick">
                {liveOk
                  ? <button className="tile" onClick={() => { setError(''); setScreen('live-barcode') }}><Icon name="barcode" />Scan barcode</button>
                  : <label className="tile" htmlFor="buy-scan"><Icon name="barcode" />Scan barcode</label>}
                <label className="tile" htmlFor="buy-pick"><Icon name="upload" />Upload</label>
                <button className="tile" onClick={() => { setProduct(null); setBarcode(null); setQuery(''); setScreen('confirm') }}><Icon name="text" />Type it</button>
              </div>
              <ul className="perks">
                <li><Icon name="check" />Picks one store for you</li>
                <li><Icon name="check" />Shows how old each price is</li>
                <li><Icon name="check" />Tracks price drops</li>
              </ul>
            </div>
          )}

          {screen === 'live-barcode' && (
            <BarcodeCamera
              onFound={(code) => { setBarcode(code); setProduct(null); setPhoto(null); setQuery(`UPC ${code}`); setScreen('confirm') }}
              onCancel={() => setScreen('home')}
              onUnavailable={() => { setLiveBlocked(true); setScreen('home'); setNotice('The live camera isn’t available, so “Scan barcode” will take a photo instead.') }}
              onPhoto={() => { setScreen('home'); document.getElementById('buy-scan')?.click() }}
            />
          )}

          {screen === 'crop' && photo && <Cropper src={photo} onDone={onCropped} onCancel={reset} />}

          {screen === 'identifying' && <ScanLoader photo={photo} title="Figuring out what this is…" sub="Looking for the brand and model." />}
          {screen === 'scanning' && <ScanLoader title="Reading the barcode…" />}
          {screen === 'searching' && (
            <div className="card center stack scan-card" role="status">
              <div className="spinner" />
              <h2>Comparing prices…</h2>
              <p className="muted">Searching stores. This can take up to a minute.</p>
            </div>
          )}

          {screen === 'unreadable' && product && (
            <div className="card stack center">
              <div className="empty-ico"><Icon name="search" /></div>
              <h2>I couldn't tell what that is</h2>
              <p>{product.message}</p>
              <label className="btn cta" htmlFor="buy-cam"><Icon name="camera" />Retake photo</label>
              <label className="btn secondary" htmlFor="buy-scan"><Icon name="barcode" />Scan the barcode instead</label>
              <button className="btn ghost" onClick={() => { setQuery(''); setScreen('confirm') }}>Type the product instead</button>
            </div>
          )}

          {screen === 'confirm' && (
            <div className="card stack">
              <h2>{barcode ? 'Barcode found' : 'Is this the right product?'}</h2>
              <p className="muted">{barcode ? `Barcode ${barcode}. If you know the product name, replace the search with it for a better match.` : 'Add the brand, model or size for a better match.'}</p>
              {product?.message && <div className="banner info">{product.message}</div>}
              {photo && product && <img className="thumb" src={photo} alt="Your photo" />}
              <label className="label" htmlFor="buy-query">Search for</label>
              <input id="buy-query" className="text-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Sony WH-1000XM5 headphones" />
              <div className="row">
                <button className="btn ghost" onClick={reset}>Back</button>
                <button className="btn primary grow" disabled={query.trim().length < 2} onClick={() => runSearch()}>Find best price</button>
              </div>
            </div>
          )}

          {screen === 'results' && raw && ranked && (
            <div className="stack">
              <div className="label">Results for {raw.query}</div>
              <div className={`tiny ${isStale(raw.checked_at * 1000) ? 'stale' : 'muted'}`}>Prices checked {ago(raw.checked_at * 1000)}</div>
              {isStale(raw.checked_at * 1000) && (
                <div className="banner warn" role="alert">
                  <strong>These prices are over a day old.</strong>
                  <span>Stock and prices change fast. Re-check before you buy.</span>
                  <button className="btn primary" onClick={() => runSearch(raw.query, true)}><Icon name="retake" />Re-check now</button>
                </div>
              )}

              {ranked.recommendation && <Recommendation r={ranked.recommendation} />}
              {raw.offers.length === 0 && <div className="banner info">No reliable prices found. {raw.summary}</div>}
              {raw.offers.length > 0 && ranked.offers.length === 0 && <div className="banner info">No offers match your filters. Loosen them to see more.</div>}
              {raw.offers.length > 0 && raw.summary && <p className="muted">{raw.summary}</p>}

              {ranked.offers.length > 0 && (
                <div className="card stack">
                  <h2>All offers, cheapest first</h2>
                  {ranked.offers.map((o) => <Offer key={o.url} o={o} best={o.recommended} />)}
                </div>
              )}

              {raw.offers.length > 0 && (
                <details className="card filters" open={!isDefault(filters)}>
                  <summary><Icon name="sliders" /><span>Filters</span>{!isDefault(filters) && <b className="pill">on</b>}</summary>
                  <div className="stack">
                  <div className="chips">
                    <button className={`chip ${filters.new_only ? 'on' : ''}`} aria-pressed={filters.new_only} onClick={() => setFilters({ ...filters, new_only: !filters.new_only })}>New only</button>
                    <button className={`chip ${filters.free_shipping ? 'on' : ''}`} aria-pressed={filters.free_shipping} onClick={() => setFilters({ ...filters, free_shipping: !filters.free_shipping })}>Free shipping</button>
                  </div>
                  <div className="row">
                    <label className="muted tiny" htmlFor="maxp">Max price</label>
                    <input id="maxp" className="text-input small" type="number" min="0" step="1" inputMode="decimal" value={filters.max_price ?? ''} onChange={(e) => setFilters({ ...filters, max_price: e.target.value === '' ? null : Number(e.target.value) })} />
                    <label className="muted tiny" htmlFor="pref">Prefer</label>
                    <input id="pref" className="text-input small" list="stores" placeholder="a store" value={filters.preferred_store} onChange={(e) => setFilters({ ...filters, preferred_store: e.target.value })} />
                    <datalist id="stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
                  </div>
                  {ranked.hidden > 0 && <p className="muted tiny">{ranked.hidden} offer{ranked.hidden === 1 ? '' : 's'} hidden by your filters.</p>}
                  </div>
                </details>
              )}

              <div className="card stack">
                <h2>Search more stores</h2>
                <p className="muted tiny">These open a store search, sorted by price where the store allows it.</p>
                <div className="chips">
                  {raw.compare.map((c) => <a key={c.url} className="chip" href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>)}
                </div>
              </div>

              <div className="row wrap">
                <button className="btn secondary grow" disabled={isTracked || !trackPrice(raw.offers)} onClick={track}><Icon name={isTracked ? 'check' : 'trend'} />{isTracked ? 'Tracking this price' : 'Track this price'}</button>
                <button className="btn ghost" onClick={() => runSearch(raw.query, true)}>Re-check</button>
              </div>
              <p className="muted tiny center-text">
                Prices came from a web search on {new Date(raw.checked_at * 1000).toLocaleString()} and can change.
                Check the price on the store&apos;s page before you buy.
              </p>
              <button className="btn cta" onClick={reset}><Icon name="bag" />Snap another</button>
            </div>
          )}
        </>
      )}
    </>
  )
}
