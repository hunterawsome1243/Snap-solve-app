// Tropical theme: fruit drifts down the screen, swaying. Decorative; hidden for reduced-motion users (CSS).
const FRUIT = ['🍍', '🥭', '🍉', '🥥', '🍌', '🥝', '🍊', '🌺', '🍋', '🍓', '🌴']
const ITEMS = FRUIT.map((f, i) => ({
  f,
  left: `${(i * 9.1 + 5) % 94}%`,
  size: `${22 + ((i * 7) % 5) * 5}px`,
  dur: `${16 + ((i * 5) % 9)}s`,
  delay: `${-((i * 3.9) % 17)}s`,
  sway: `${14 + ((i * 11) % 22)}px`,
}))

export default function Fruits() {
  return (
    <div className="fruits" aria-hidden="true">
      {ITEMS.map((t, i) => (
        <span key={i} className="fruit" style={{ left: t.left, fontSize: t.size, animationDuration: t.dur, animationDelay: t.delay, '--sway': t.sway }}>
          <i>{t.f}</i>
        </span>
      ))}
    </div>
  )
}
