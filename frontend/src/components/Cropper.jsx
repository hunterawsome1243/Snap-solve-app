import { useRef, useState } from 'react'
import { cropImage } from '../image.js'

const MIN = 0.06
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Drag the box to move it, drag a corner to resize. Works with touch and mouse.
export default function Cropper({ src, onDone, onCancel, modes, mode, onMode }) {
  const imgRef = useRef(null)
  const wrapRef = useRef(null)
  const drag = useRef(null)
  const [crop, setCrop] = useState({ x: 0.05, y: 0.2, w: 0.9, h: 0.6 })

  const start = (mode) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, px: e.clientX, py: e.clientY, crop }
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const r = wrapRef.current.getBoundingClientRect()
    const dx = (e.clientX - d.px) / r.width
    const dy = (e.clientY - d.py) / r.height
    let { x, y, w, h } = d.crop
    if (d.mode === 'move') {
      x = clamp(x + dx, 0, 1 - w)
      y = clamp(y + dy, 0, 1 - h)
    } else {
      let x2 = x + w
      let y2 = y + h
      if (d.mode.includes('l')) x = clamp(x + dx, 0, x2 - MIN)
      if (d.mode.includes('r')) x2 = clamp(x2 + dx, x + MIN, 1)
      if (d.mode.includes('t')) y = clamp(y + dy, 0, y2 - MIN)
      if (d.mode.includes('b')) y2 = clamp(y2 + dy, y + MIN, 1)
      w = x2 - x
      h = y2 - y
    }
    setCrop({ x, y, w, h })
  }

  const end = () => (drag.current = null)

  return (
    <div className="card stack">
      <h2>Crop to the equation</h2>
      <p className="muted">Drag the box so only the problem is inside it.</p>
      {modes && (
        <div className="chips" role="group" aria-label="Photo version">
          {modes.map((m) => (
            <button key={m.id} className={`chip ${mode === m.id ? 'on' : ''}`} aria-pressed={mode === m.id} onClick={() => onMode(m.id)}>{m.label}</button>
          ))}
        </div>
      )}
      <div className="crop-stage">
        <div className="crop-wrap" ref={wrapRef}>
          <img ref={imgRef} src={src} alt="Your photo" draggable={false} />
          <div
            className="crop-box"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }}
            onPointerDown={start('move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            {['tl', 'tr', 'bl', 'br'].map((h) => (
              <span
                key={h}
                className={`handle ${h}`}
                onPointerDown={start(h)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="row">
        <button className="btn ghost" onClick={onCancel}>Retake</button>
        <button className="btn primary grow" onClick={() => onDone(cropImage(imgRef.current, crop))}>
          Read equation
        </button>
      </div>
      <button className="link" onClick={() => onDone(cropImage(imgRef.current, { x: 0, y: 0, w: 1, h: 1 }))}>
        Skip cropping
      </button>
    </div>
  )
}
