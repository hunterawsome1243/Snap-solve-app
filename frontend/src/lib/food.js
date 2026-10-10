// Food scan helpers: cleaning the model's answer (the same rules as clean_food in backend/main.py) and the daily log.
// The phone artifact has no server, so it uses cleanFood directly; the React app gets the same result from the server.

export const CONFIDENCE = { high: 'Pretty sure', medium: 'Rough estimate', low: 'Best guess' }
export const ALLERGENS = ['milk', 'eggs', 'fish', 'shellfish', 'tree nuts', 'peanuts', 'wheat', 'soy', 'sesame']
export const MACROS = [['calories', 6000], ['protein_g', 500], ['carbs_g', 800], ['fat_g', 500], ['fiber_g', 200], ['sugar_g', 500], ['sodium_mg', 20000]]

const foodText = (v, n = 300) => String(v ?? '').trim().slice(0, n)
const foodEnum = (v, allowed, fallback) => {
  const k = String(v ?? '').trim().toLowerCase().replace(/ /g, '_')
  return allowed.includes(k) ? k : fallback
}
const foodNum = (v, top) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= top ? Math.round(v * 10) / 10 : null)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

export function cleanFood(data) {
  const d = isObj(data) ? data : {}
  const t = isObj(d.totals) ? d.totals : {}
  const totals = Object.fromEntries(MACROS.map(([k, top]) => [k, foodNum(t[k], top)]))
  if (!d.is_food || totals.calories === null) {
    return { is_food: false, message: foodText(d.message, 400) || "I couldn't see food or a nutrition label clearly. Try a closer photo in good light." }
  }
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 8)
    .filter((i) => isObj(i) && foodText(i.name))
    .map((i) => ({ name: foodText(i.name, 80), portion: foodText(i.portion, 60), calories: foodNum(i.calories, 6000) }))
  const seen = new Set((Array.isArray(d.allergens) ? d.allergens : []).filter((a) => typeof a === 'string').map((a) => a.trim().toLowerCase()))
  return {
    is_food: true,
    message: foodText(d.message, 400),
    name: foodText(d.name, 100) || 'Meal',
    confidence: foodEnum(d.confidence, ['high', 'medium', 'low'], 'low'),
    source: foodEnum(d.source, ['label', 'estimate'], 'estimate'),
    serving: foodText(d.serving, 80),
    items,
    totals,
    allergens: ALLERGENS.filter((a) => seen.has(a)),
    notes: foodText(d.notes),
    photo_tips: foodText(d.photo_tips),
  }
}

// ---- the daily log ----
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()
export const mealsOn = (meals, now = Date.now()) => meals.filter((m) => sameDay(m.at, now))

export function dayTotals(meals) {
  const sum = (k) => Math.round(meals.reduce((n, m) => n + (m[k] || 0), 0))
  return { calories: sum('calories'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') }
}

export const fmtVal = (n, unit = '') => (n === null || n === undefined ? '–' : `${Math.round(n)}${unit}`)
