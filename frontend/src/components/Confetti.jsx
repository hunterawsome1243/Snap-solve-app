// A short burst when a practice answer is right. Decorative; hidden for reduced-motion users in CSS.
const COLORS = ['var(--cta)', 'var(--brand)', 'var(--cta-2)', 'var(--brand-2)', '#ffd166']
const PIECES = Array.from({ length: 26 }, (_, i) => ({
  left: `${6 + ((i * 37) % 88)}%`,
  dx: `${((i * 53) % 90) - 45}px`,
  delay: `${(i % 7) * 0.04}s`,
  dur: `${0.9 + ((i * 13) % 6) / 10}s`,
  color: COLORS[i % COLORS.length],
  rot: `${(i * 67) % 360}deg`,
}))

export default function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {PIECES.map((p, i) => (
        <i key={i} style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.dur, '--dx': p.dx, '--rot': p.rot }} />
      ))}
    </div>
  )
}
