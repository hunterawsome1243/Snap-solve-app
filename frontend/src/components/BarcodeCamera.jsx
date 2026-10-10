import { useEffect, useRef, useState } from 'react'
import { decodeFrame, makeReader } from '../lib/barcode.js'
import { buzz } from '../lib/haptics.js'
import Icon from './Icon.jsx'

const TICK_MS = 140

// Scan a barcode live: the camera focuses on its own while you hold it up, so there is no photo to blur.
// Each tick looks at the middle of the picture (where you aim), now and then the whole picture or turned sideways.
export default function BarcodeCamera({ onFound, onCancel, onUnavailable, onPhoto }) {
  const video = useRef(null)
  const stream = useRef(null)
  const [aspect, setAspect] = useState(4 / 3)
  const [hint, setHint] = useState('Starting the camera…')
  const [torch, setTorch] = useState({ available: false, on: false })

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    let alive = true
    let timer
    const startedAt = Date.now()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let zx, reader
    let last = null, n = 0

    // draw part of the video frame (fractions), optionally turned a quarter, into the working canvas
    function frame(v, [fx, fy, fw, fh], side, quarter) {
      const sx = fx * v.videoWidth, sy = fy * v.videoHeight, sw = fw * v.videoWidth, sh = fh * v.videoHeight
      const k = Math.min(1, side / Math.max(sw, sh))
      const w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k))
      canvas.width = quarter ? h : w
      canvas.height = quarter ? w : h
      ctx.save()
      if (quarter) { ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(v, sx, sy, sw, sh, -w / 2, -h / 2, w, h) }
      else ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h)
      ctx.restore()
      return canvas
    }

    async function tick() {
      if (!alive) return
      const v = video.current
      if (v && v.videoWidth && zx) {
        setAspect(v.videoWidth / v.videoHeight)
        const view = [[[0.08, 0.28, 0.84, 0.44], false], [[0, 0, 1, 1], false], [[0.28, 0.08, 0.44, 0.84], true], [[0.15, 0.2, 0.7, 0.6], false]][n++ % 4]
        const code = await decodeFrame(frame(v, view[0], 1100, view[1]), zx, reader).catch(() => null)
        if (!alive) return
        if (code) {
          // two reads in a row that agree: a barcode's own check digit already makes a wrong read rare
          if (code === last?.code && Date.now() - last.at < 2000) { stop(); buzz(25); return onFound(code) }
          last = { code, at: Date.now() }
          setHint('Got it. Hold steady…')
        } else if (Date.now() - startedAt > 12000) setHint('Try more light, and move back a little so it can focus.')
      }
      timer = setTimeout(tick, TICK_MS)
    }

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
      const caps = track.getCapabilities?.() || {}
      if (caps.torch) setTorch({ available: true, on: false })
      if (caps.focusMode?.includes?.('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
      setHint('Point at the barcode and hold steady')
      zx = await import('@zxing/library')
      reader = makeReader(zx)
      tick()
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

  return (
    <div className="card stack">
      <h2>Scan the barcode</h2>
      <p className="muted">Hold the barcode inside the box. It reads on its own.</p>
      <div className="viewfinder" style={{ '--ar': aspect }} data-testid="barcode-viewfinder">
        <video ref={video} playsInline muted autoPlay aria-label="Camera preview" />
        <div className="bc-aim" aria-hidden="true" />
        <div className="vf-hint" role="status" data-testid="bc-hint">{hint}</div>
      </div>
      <div className="vf-controls">
        <button className="icon-btn lg" onClick={() => { stop(); onCancel() }} aria-label="Cancel"><Icon name="close" /></button>
        {torch.available ? (
          <button className="icon-btn lg" onClick={toggleTorch} aria-pressed={torch.on} aria-label={torch.on ? 'Turn the light off' : 'Turn the light on'}><Icon name="torch" /></button>
        ) : <span />}
      </div>
      <button className="link" onClick={() => { stop(); onPhoto() }}>Take a photo of it instead</button>
    </div>
  )
}
