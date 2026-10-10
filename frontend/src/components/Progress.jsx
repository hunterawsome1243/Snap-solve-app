import { useEffect, useState } from 'react'
import { lineAt, PROGRESS_MS } from '../lib/progress.js'

// One line of progress text that changes every PROGRESS_MS, so a wait says what is happening.
// The key swap replays the small fade; with reduced motion the text simply changes.
export default function Progress({ lines }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
    const t = setInterval(() => setI((n) => n + 1), PROGRESS_MS)
    return () => clearInterval(t)
  }, [lines])
  const line = lineAt(i, lines)
  if (!line) return null
  return <p className="muted"><span className="progress-text" key={i}>{line}</span></p>
}
