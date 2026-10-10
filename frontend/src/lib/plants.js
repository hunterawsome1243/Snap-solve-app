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

// ---- cleaning what the model says (the same rules as clean_plant in backend/main.py) ----
// The phone artifact has no server, so it uses this directly; the React app gets the same result from the server.
const plantText = (v, n = 300) => String(v ?? '').trim().slice(0, n)
const plantEnum = (v, allowed, fallback) => {
  const k = String(v ?? '').trim().toLowerCase().replace(/ /g, '_')
  return allowed.includes(k) ? k : fallback
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

export function cleanPlant(data) {
  const d = isObj(data) ? data : {}
  const ok = !!d.is_plant && !!(plantText(d.name) || plantText(d.scientific))
  if (!ok) {
    return { is_plant: false, message: plantText(d.message, 400) || "I couldn't see a plant clearly. Try a closer photo of the leaves, in good light." }
  }
  const health = isObj(d.health) ? d.health : {}
  const care = isObj(d.care) ? d.care : {}
  const pets = isObj(d.pets) ? d.pets : {}
  const issues = (Array.isArray(health.issues) ? health.issues : []).slice(0, 5)
    .filter((i) => isObj(i) && plantText(i.name))
    .map((i) => ({
      name: plantText(i.name, 80), signs: plantText(i.signs), cause: plantText(i.cause), fix: plantText(i.fix),
      severity: plantEnum(i.severity, ['mild', 'moderate', 'serious'], 'mild'),
    }))
  const alternatives = (Array.isArray(d.alternatives) ? d.alternatives : []).slice(0, 3)
    .filter((a) => isObj(a) && (plantText(a.name) || plantText(a.scientific)))
    .map((a) => ({ name: plantText(a.name, 80), scientific: plantText(a.scientific, 80) }))
  const days = care.water_every_days
  const every = typeof days === 'number' && Number.isFinite(days) && days >= 1 && days <= 60 ? Math.trunc(days) : null
  let status = plantEnum(health.status, ['healthy', 'needs_attention', 'unclear'], 'unclear')
  if (issues.length && status === 'healthy') status = 'needs_attention'
  return {
    is_plant: true,
    message: plantText(d.message, 400),
    name: plantText(d.name, 100) || plantText(d.scientific, 100),
    scientific: plantText(d.scientific, 100),
    confidence: plantEnum(d.confidence, ['high', 'medium', 'low'], 'low'),
    kind: plantText(d.kind, 60),
    alternatives,
    health: { status, summary: plantText(health.summary), issues },
    care: {
      light: plantText(care.light), water: plantText(care.water), soil: plantText(care.soil),
      temperature: plantText(care.temperature), humidity: plantText(care.humidity), feeding: plantText(care.feeding),
      water_every_days: every,
    },
    pets: { status: plantEnum(pets.status, ['toxic', 'mostly_safe', 'unknown'], 'unknown'), note: plantText(pets.note) },
    fun_fact: plantText(d.fun_fact),
    photo_tips: plantText(d.photo_tips),
  }
}
