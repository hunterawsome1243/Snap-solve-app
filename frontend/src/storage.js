import { cleanFavs } from './lib/favorites.js'
const KEY = 'snapsolve.history.v1'
const MAX = 50

export function loadHistory() {
  try {
    return (JSON.parse(localStorage.getItem(KEY)) || []).map((i) => ({ type: 'math', ...i }))
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

// ---- tracked products (Snap Buy). Kept on this device only.
const TRACK_KEY = 'snapsolve.tracked.v1'

export function loadTracked() {
  try {
    return JSON.parse(localStorage.getItem(TRACK_KEY)) || []
  } catch {
    return []
  }
}

export function saveTracked(items) {
  try {
    localStorage.setItem(TRACK_KEY, JSON.stringify(items))
  } catch {
    /* storage full or blocked */
  }
  return items
}


// ---- saved plants (My Plants) ----
const PLANTS = 'snapsolve.plants.v1'
const MAX_PLANTS = 40

export function loadPlants() {
  try {
    const v = JSON.parse(localStorage.getItem(PLANTS))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function savePlants(plants) {
  try {
    localStorage.setItem(PLANTS, JSON.stringify(plants.slice(0, MAX_PLANTS)))
  } catch {
    /* storage full: the plant stays on screen but is not remembered */
  }
  return plants
}

// ---- favourite scanners (the two slots in the bottom bar) ----
const FAVS = 'snapsolve.favs.v1'

export function loadFavs() {
  try {
    return cleanFavs(JSON.parse(localStorage.getItem(FAVS)))
  } catch {
    return cleanFavs(null)
  }
}

export function saveFavs(favs) {
  try {
    localStorage.setItem(FAVS, JSON.stringify(favs))
  } catch {
    /* storage full: the choice holds until the page closes */
  }
  return favs
}

// ---- the food log (meals you saved from Food Scan) ----
const MEALS = 'snapsolve.meals.v1'
const MAX_MEALS = 200

export function loadMeals() {
  try {
    const v = JSON.parse(localStorage.getItem(MEALS))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveMeals(meals) {
  try {
    localStorage.setItem(MEALS, JSON.stringify(meals.slice(0, MAX_MEALS)))
  } catch {
    /* storage full: the meal stays on screen but is not remembered */
  }
  return meals
}
