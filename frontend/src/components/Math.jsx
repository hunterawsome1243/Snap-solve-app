import { useMemo } from 'react'
import katex from 'katex'

export default function Math({ latex, display = false, className = '' }) {
  const html = useMemo(
    () => katex.renderToString(latex || '', { throwOnError: false, displayMode: display, strict: 'ignore' }),
    [latex, display],
  )
  return <span className={`math ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
