import React from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App.jsx'
import { holidayCss } from './lib/themes.js'

// the holiday themes are described in lib/themes.js; their CSS is made from that description
const holidayStyle = document.createElement('style')
holidayStyle.id = 'holiday-css'
holidayStyle.textContent = holidayCss()
document.head.append(holidayStyle)

createRoot(document.getElementById('root')).render(<App />)

// installable + works offline once opened (production builds only, so the dev server is never cached)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
