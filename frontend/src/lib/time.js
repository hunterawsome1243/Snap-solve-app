export const DAY = 24 * 60 * 60 * 1000

export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < DAY / 1000) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export const isStale = (ts, now = Date.now()) => now - ts > DAY
