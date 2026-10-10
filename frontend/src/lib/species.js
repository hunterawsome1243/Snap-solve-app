// Species scan helpers: labels and cleaning the model's answer (the same rules as clean_species in backend/main.py).
// The phone artifact has no server, so it uses cleanSpecies directly.

export const CONFIDENCE = { high: 'Pretty sure', medium: 'Likely', low: 'Best guess' }
export const GROUPS = {
  mammal: 'Mammal', bird: 'Bird', reptile: 'Reptile', amphibian: 'Amphibian', fish: 'Fish', insect: 'Insect',
  spider: 'Spider', other_invertebrate: 'Invertebrate', fungus: 'Fungus', other: 'Wildlife',
}
export const DANGER = {
  harmless: 'Generally harmless',
  use_caution: 'Use caution',
  dangerous: 'Dangerous. Keep your distance',
  unknown: 'Danger unknown. Keep your distance',
}

const spText = (v, n = 300) => String(v ?? '').trim().slice(0, n)
const spEnum = (v, allowed, fallback) => {
  const k = String(v ?? '').trim().toLowerCase().replace(/ /g, '_')
  return allowed.includes(k) ? k : fallback
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

export function cleanSpecies(data) {
  const d = isObj(data) ? data : {}
  if (!d.found || !(spText(d.name) || spText(d.scientific))) {
    return { found: false, message: spText(d.message, 400) || "I couldn't see an animal clearly. Try a closer photo in good light." }
  }
  const danger = isObj(d.danger) ? d.danger : {}
  const alternatives = (Array.isArray(d.alternatives) ? d.alternatives : []).slice(0, 3)
    .filter((a) => isObj(a) && (spText(a.name) || spText(a.scientific)))
    .map((a) => ({ name: spText(a.name, 80), scientific: spText(a.scientific, 80) }))
  const group = spEnum(d.group, Object.keys(GROUPS), 'other')
  let level = spEnum(danger.level, ['harmless', 'use_caution', 'dangerous', 'unknown'], 'unknown')
  if (group === 'fungus' && level === 'harmless') level = 'unknown' // a photo can never show a fungus is safe
  return {
    found: true,
    message: spText(d.message, 400),
    name: spText(d.name, 100) || spText(d.scientific, 100),
    scientific: spText(d.scientific, 100),
    group,
    confidence: spEnum(d.confidence, ['high', 'medium', 'low'], 'low'),
    alternatives,
    about: spText(d.about), habitat: spText(d.habitat), diet: spText(d.diet), size: spText(d.size, 100),
    danger: { level, note: spText(danger.note) },
    conservation: spText(d.conservation, 60),
    fun_fact: spText(d.fun_fact),
    photo_tips: spText(d.photo_tips),
  }
}
