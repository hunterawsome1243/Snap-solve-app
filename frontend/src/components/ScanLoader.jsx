// "Hunter Scan" loading state: your photo inside a frame with a beam sweeping over it.
export default function ScanLoader({ photo, title, sub, onStop }) {
  return (
    <div className="card center stack scan-card" role="status" aria-live="polite">
      <div className="scan-loader">
        {photo && <img src={photo} alt="" />}
        <div className="scan-frame" />
        <div className="beam" />
      </div>
      <h2>{title}</h2>
      {sub && <p className="muted">{sub}</p>}
      {onStop && <button className="link" onClick={onStop}>Stop</button>}
    </div>
  )
}
