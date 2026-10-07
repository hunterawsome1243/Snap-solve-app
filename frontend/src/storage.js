const KEY = 'snapsolve.history.v1'
const MAX = 50

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* storage full or blocked: history is a nicety, not critical */
  }
}

export function addHistory(entry) {
  const items = [entry, ...loadHistory().filter((i) => i.id !== entry.id)].slice(0, MAX)
  save(items)
  return items
}

export function removeHistory(id) {
  const items = loadHistory().filter((i) => i.id !== id)
  save(items)
  return items
}

export function clearHistory() {
  save([])
  return []
}

export function getPref(name, fallback) {
  try {
    const v = localStorage.getItem('snapsolve.' + name)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

export function setPref(name, value) {
  try {
    localStorage.setItem('snapsolve.' + name, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
