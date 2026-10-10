import { holidayById } from '../lib/themes.js'

// Holiday themes: a handful of emoji fall down (or float up) the screen. Decorative; hidden for reduced-motion users (CSS).
export default function HolidayParticles({ id }) {
  const h = holidayById(id)
  if (!h) return null
  const items = Array.from({ length: 12 }, (_, i) => ({
    glyph: h.emoji[i % h.emoji.length],
    left: `${(i * 8.3 + 4) % 94}%`,
    size: `${20 + ((i * 7) % 5) * 5}px`,
    dur: `${14 + ((i * 5) % 9)}s`,
    delay: `${-((i * 3.7) % 16)}s`,
    sway: `${12 + ((i * 11) % 22)}px`,
  }))
  return (
    <div className="hparts" aria-hidden="true">
      {items.map((p, i) => (
        <span key={i} className={`hpart ${h.motion}`} style={{ left: p.left, fontSize: p.size, animationDuration: p.dur, animationDelay: p.delay, '--sway': p.sway }}>
          <i>{p.glyph}</i>
        </span>
      ))}
    </div>
  )
}
