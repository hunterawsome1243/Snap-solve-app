// Science theme: periodic-table style tiles drift up the screen. Decorative; hidden for reduced-motion users (CSS).
const TILES = [['H', 1], ['He', 2], ['C', 6], ['N', 7], ['O', 8], ['Na', 11], ['Si', 14], ['Fe', 26], ['Cu', 29], ['Au', 79], ['π', ''], ['Σ', ''], ['U', 92]]
  .map(([sym, n], i) => ({
    sym, n,
    left: `${(i * 7.9 + 3) % 92}%`,
    dur: `${20 + ((i * 7) % 11)}s`,
    delay: `${-((i * 4.3) % 22)}s`,
  }))

export default function Elements() {
  return (
    <div className="elements" aria-hidden="true">
      {TILES.map((t, i) => (
        <span key={i} className="element" style={{ left: t.left, animationDuration: t.dur, animationDelay: t.delay }}>
          <small>{t.n}</small>
          <b>{t.sym}</b>
        </span>
      ))}
    </div>
  )
}
