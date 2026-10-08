import { DAY } from './time.js'

// When does a saved plant next need water? `plant.watered` is the time it was last watered
// (or saved), `plant.every` the days between waterings (null = no schedule).
export function waterStatus(plant, now = Date.now()) {
  if (!plant.every) return { scheduled: false, due: false, days: null, label: 'No watering schedule' }
  const dueAt = plant.watered + plant.every * DAY
  const days = Math.ceil((dueAt - now) / DAY)
  if (days < 0) return { scheduled: true, due: true, days, label: `Overdue by ${-days} day${days === -1 ? '' : 's'}` }
  if (days === 0) return { scheduled: true, due: true, days, label: 'Water today' }
  return { scheduled: true, due: false, days, label: days === 1 ? 'Water tomorrow' : `Water in ${days} days` }
}

// Most overdue first, then soonest, then plants with no schedule.
export function sortPlants(plants, now = Date.now()) {
  const key = (p) => {
    const s = waterStatus(p, now)
    return s.scheduled ? s.days : Infinity
  }
  return [...plants].sort((a, b) => key(a) - key(b))
}

export const dueCount = (plants, now = Date.now()) => plants.filter((p) => waterStatus(p, now).due).length

export const clampEvery = (n) => Math.min(60, Math.max(1, Math.round(Number(n) || 1)))

// Plain-language labels for the scan result.
export const CONFIDENCE = {
  high: 'Pretty sure',
  medium: 'Likely',
  low: 'Best guess',
}
export const HEALTH = {
  healthy: 'Looks healthy',
  needs_attention: 'Needs attention',
  unclear: "Can't tell yet",
}
export const PETS = {
  toxic: 'Toxic to pets',
  mostly_safe: 'Mostly pet-safe',
  unknown: 'Pet safety unknown',
}
