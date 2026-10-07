import { useState } from 'react'
import Icon from './Icon.jsx'

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const seen = () => { try { return localStorage.getItem('hs-install-hint') === '1' } catch { return false } }

// Safari on iPhone has no install button, so say where it is. Shown once, until dismissed.
export default function InstallHint() {
  const [hidden, setHidden] = useState(() => seen() || standalone() || !isIOS())
  if (hidden) return null
  const dismiss = () => { try { localStorage.setItem('hs-install-hint', '1') } catch {} setHidden(true) }
  return (
    <div className="banner info" role="note" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <span className="b-ico"><Icon name="sparkle" /></span>
      <div style={{ flex: 1 }}>
        <b>Put Hunter Scan on your Home Screen.</b> In Safari tap <b>Share</b>, then <b>Add to Home Screen</b>.
      </div>
      <button className="icon-btn" onClick={dismiss} aria-label="Dismiss"><Icon name="close" /></button>
    </div>
  )
}
