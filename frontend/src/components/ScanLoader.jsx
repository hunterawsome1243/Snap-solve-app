import Progress from './Progress.jsx'

// "Hunter Scan" loading state: your photo inside a frame with a beam sweeping over it.
// Give it `lines` and the text under the title changes every couple of seconds, saying what is happening.
export default function ScanLoader({ photo, title, sub, lines, onStop }) {
  return (
    <div className="card center stack scan-card" role="status" aria-live="polite">
      <div className="scan-loader">
        {photo && <img src={photo} alt="" />}
        <div className="scan-frame" />
        <div className="beam" />
      </div>
      <h2>{title}</h2>
      {lines ? <Progress lines={lines} /> : sub && <p className="muted">{sub}</p>}
      {onStop && <button className="link" onClick={onStop}>Stop</button>}
    </div>
  )
}
