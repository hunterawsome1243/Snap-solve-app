import { useLayoutEffect } from 'react'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// A new screen starts at the top. Smooth unless the person asked the OS for less motion.
export function scrollTop() {
  try {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
  } catch {
    /* very old browsers */
  }
}

// Wraps a scan result: the first child pops in, the rest rise after it (see "motion polish" in styles.css).
// Nothing is hidden or delayed: it is opacity and transform only, so the content is there and readable at once.
export default function Reveal({ className = '', children, ...rest }) {
  useLayoutEffect(() => { scrollTop() }, [])
  return <div className={`stack reveal ${className}`.trim()} {...rest}>{children}</div>
}
