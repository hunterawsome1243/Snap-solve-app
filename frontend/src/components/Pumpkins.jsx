// Halloween theme: pumpkins drift down the screen. Purely decorative, off for reduced-motion users (in CSS).
const PUMPKINS = Array.from({ length: 11 }, (_, i) => ({
  left: `${(i * 9.3 + 4) % 96}%`,
  size: `${18 + ((i * 7) % 5) * 5}px`,
  dur: `${13 + ((i * 5) % 8)}s`,
  delay: `${-((i * 3.7) % 14)}s`,
  sway: `${14 + ((i * 11) % 22)}px`,
}))

export default function Pumpkins() {
  return (
    <div className="pumpkins" aria-hidden="true">
      {PUMPKINS.map((p, i) => (
        <span key={i} className="pumpkin" style={{ left: p.left, fontSize: p.size, animationDuration: p.dur, animationDelay: p.delay, '--sway': p.sway }}>
          <i>🎃</i>
        </span>
      ))}
    </div>
  )
}
