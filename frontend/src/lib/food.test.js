import { describe, expect, it } from 'vitest'
import { cleanFood, dayTotals, mealsOn } from './food.js'
import { cleanSpecies } from './species.js'

const FOOD = {
  is_food: true, name: 'Cheese pizza slice', confidence: 'MEDIUM', source: 'estimate', serving: '1 slice',
  items: Array.from({ length: 12 }, () => ({ name: 'Pizza', portion: '1 slice', calories: 285 })),
  totals: { calories: 285, protein_g: 12, carbs_g: 36, fat_g: 10, fiber_g: 2, sugar_g: 'lots', sodium_mg: -5 },
  allergens: ['Milk', 'wheat', 'kryptonite', 7],
}

describe('cleanFood', () => {
  it('keeps good numbers, drops junk, and uses a fixed allergen list', () => {
    const r = cleanFood(FOOD)
    expect(r).toMatchObject({ is_food: true, confidence: 'medium', source: 'estimate' })
    expect(r.items).toHaveLength(8)
    expect(r.totals.calories).toBe(285)
    expect(r.totals.sugar_g).toBeNull()
    expect(r.totals.sodium_mg).toBeNull()
    expect(r.allergens).toEqual(['milk', 'wheat'])
  })
  it('asks for a better photo when there is no food or no calories', () => {
    for (const d of [{ is_food: false }, { is_food: true, name: 'x', totals: {} }, null]) {
      const r = cleanFood(d)
      expect(r.is_food).toBe(false)
      expect(r.message).toMatch(/photo/)
    }
  })
})

describe('daily log', () => {
  const now = new Date(2026, 5, 10, 15).getTime()
  const meals = [
    { id: 1, calories: 300, protein_g: 10, carbs_g: 40, fat_g: 8, at: new Date(2026, 5, 10, 8).getTime() },
    { id: 2, calories: 450.4, protein_g: null, carbs_g: 50, fat_g: 20, at: new Date(2026, 5, 10, 13).getTime() },
    { id: 3, calories: 999, at: new Date(2026, 5, 9, 20).getTime() },
  ]
  it('only counts today and treats missing numbers as zero', () => {
    expect(mealsOn(meals, now).map((m) => m.id)).toEqual([1, 2])
    expect(dayTotals(mealsOn(meals, now))).toEqual({ calories: 750, protein_g: 10, carbs_g: 90, fat_g: 28 })
  })
})

describe('cleanSpecies', () => {
  it('cleans values and never calls a fungus harmless', () => {
    const r = cleanSpecies({ found: true, name: 'Fly agaric', group: 'Fungus', confidence: 'high', danger: { level: 'harmless' }, alternatives: Array(5).fill({ name: 'x' }) })
    expect(r).toMatchObject({ found: true, group: 'fungus', confidence: 'high' })
    expect(r.danger.level).toBe('unknown')
    expect(r.alternatives).toHaveLength(3)
  })
  it('falls back on bad values and asks for a better photo when nothing was found', () => {
    expect(cleanSpecies({ found: true, name: 'Thing', group: 'dragon', danger: { level: 'scary' } })).toMatchObject({ group: 'other', confidence: 'low', danger: { level: 'unknown' } })
    expect(cleanSpecies({ found: false })).toMatchObject({ found: false, message: expect.stringMatching(/photo/) })
  })
})
