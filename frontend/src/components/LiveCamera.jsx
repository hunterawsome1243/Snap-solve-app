import { useEffect, useRef, useState } from 'react'
import { detectDocument, normalizeCorners, sharpness } from '../lib/scanner.js'
import { pixelsOf } from '../image.js'
import Icon from './Icon.jsx'
import { buzz } from '../lib/haptics.js'

const TICK_MS = 140
const STABLE_TICKS = 8 // about a second of holding still
const MOVE_LIMIT = 0.02 // corners may drift 2% of the frame between checks

const maxMove = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])))

// A viewfinder that outlines the page it finds and captures when the page is steady and in focus.
export default function LiveCamera({ onCapture, onCancel, onUnavailable }) {
  const video = useRef(null)
  const stream = useRef(null)
  const auto = useRef(true)
  const [ready, setReady] = useState(false)
  const [aspect, setAspect] = useState(4 / 3)
  const [quad, setQuad] = useState(null)
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState('Starting the camera…')
  const [torch, setTorch] = useState({ available: false, on: false })
  const [autoOn, setAutoOn] = useState(true)
  const shot = useRef(null)

  function capture() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const k = Math.min(1, 2600 / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth * k)
    c.height = Math.round(v.videoHeight * k)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    stop()
    buzz(18)
    onCapture(c)
  }
  shot.current = capture

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    let alive = true
    let timer
    let prev = null
    let still = 0
    let best = 1
    let smooth = null

    async function start() {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
      } catch (e) {
        if (alive) onUnavailable?.(e)
        return
      }
      if (!alive) return stop()
      const v = video.current
      v.srcObject = stream.current
      await v.play().catch(() => {})
      const track = stream.current.getVideoTracks()[0]
      if (track.getCapabilities?.().torch) setTorch({ available: true, on: false })
      setReady(true)
      setHint('Point at the page')
      tick()
    }

    function tick() {
      if (!alive) return
      const v = video.current
      if (v && v.videoWidth) {
        setAspect(v.videoWidth / v.videoHeight)
        const w = 320
        const h = Math.max(2, Math.round((w * v.videoHeight) / v.videoWidth))
        const img = pixelsOf(v, w, h)
        const det = detectDocument(img, { analysisSize: 240 })
        const sharp = sharpness(img)
        best = Math.max(sharp, best * 0.985)
        const focused = sharp >= best * 0.55
        if (det) {
          const q = normalizeCorners(det.corners, w, h)
          smooth = smooth ? smooth.map((p, i) => [p[0] * 0.5 + q[i][0] * 0.5, p[1] * 0.5 + q[i][1] * 0.5]) : q
          still = prev && maxMove(prev, q) < MOVE_LIMIT ? still + 1 : 0
          prev = q
          setQuad(smooth)
          if (!focused) { still = Math.max(0, still - 2); setHint('Too blurry. Hold steady') }
          else if (still < STABLE_TICKS) setHint(still > 2 ? 'Hold still…' : 'Hold steady')
          else setHint(auto.current ? 'Capturing…' : 'Tap the button')
          setProgress(Math.min(1, still / STABLE_TICKS))
          if (auto.current && still >= STABLE_TICKS && focused) return shot.current()
        } else {
          prev = null; smooth = null; still = 0
          setQuad(null); setProgress(0)
          setHint('Point at the page. A lighter page on a darker surface works best')
        }
      }
      timer = setTimeout(tick, TICK_MS)
    }

    start()
    return () => { alive = false; clearTimeout(timer); stop() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleTorch() {
    const next = !torch.on
    try {
      await stream.current?.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: next }] })
      setTorch({ available: true, on: next })
    } catch {
      setTorch({ available: false, on: false })
    }
  }

  const points = quad ? quad.map(([x, y]) => `${x},${y}`).join(' ') : ''
  return (
    <div className="card stack">
      <h2>Point at the page</h2>
      <p className="muted">I outline the page, flatten it, and take the photo when it is steady and sharp.</p>
      <div className="viewfinder" style={{ '--ar': aspect }} data-testid="viewfinder">
        <video ref={video} playsInline muted autoPlay aria-label="Camera preview" />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {quad && <polygon className="vf-quad" points={points} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className={`vf-hint ${quad ? 'ok' : ''}`} role="status" data-testid="vf-hint">{hint}</div>
        {progress > 0 && <div className="vf-bar" style={{ width: `${progress * 100}%` }} />}
      </div>
      <div className="vf-controls">
        <button className="icon-btn lg" onClick={() => { stop(); onCancel() }} aria-label="Cancel"><Icon name="close" /></button>
        <button className="shutter" onClick={capture} disabled={!ready} aria-label="Take photo" data-testid="shutter"><span /></button>
        {torch.available ? (
          <button className="icon-btn lg" onClick={toggleTorch} aria-pressed={torch.on} aria-label={torch.on ? 'Turn the light off' : 'Turn the light on'}><Icon name="torch" /></button>
        ) : <span />}
      </div>
      <label className="check">
        <input type="checkbox" checked={autoOn} onChange={(e) => { auto.current = e.target.checked; setAutoOn(e.target.checked) }} />
        Take the photo for me when the page is steady
      </label>
      <button className="link" onClick={() => { stop(); onUnavailable?.(null) }}>Use my camera app or a photo instead</button>
    </div>
  )
}
