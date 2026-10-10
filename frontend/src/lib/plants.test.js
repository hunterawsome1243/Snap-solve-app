import { describe, expect, it } from 'vitest'
import { cleanPlant, clampEvery, dueCount, sortPlants, waterStatus } from './plants.js'
import { DAY } from './time.js'

const now = 1_000_000_000_000
const plant = (daysAgo, every, id = 'p') => ({ id, watered: now - daysAgo * DAY, every })

describe('plants', () => {
  it('says when to water', () => {
    expect(waterStatus(plant(2, 7), now)).toMatchObject({ due: false, days: 5, label: 'Water in 5 days' })
    expect(waterStatus(plant(6, 7), now)).toMatchObject({ due: false, label: 'Water tomorrow' })
    expect(waterStatus(plant(7, 7), now)).toMatchObject({ due: true, label: 'Water today' })
    expect(waterStatus(plant(9, 7), now)).toMatchObject({ due: true, label: 'Overdue by 2 days' })
    expect(waterStatus(plant(8, 7), now).label).toBe('Overdue by 1 day')
  })
  it('handles plants with no schedule', () => {
    expect(waterStatus({ watered: now, every: null }, now)).toMatchObject({ scheduled: false, due: false })
  })
  it('sorts the thirstiest first and counts what is due', () => {
    const list = [plant(1, 7, 'fine'), { id: 'none', watered: now, every: null }, plant(10, 7, 'late'), plant(7, 7, 'today')]
    expect(sortPlants(list, now).map((p) => p.id)).toEqual(['late', 'today', 'fine', 'none'])
    expect(dueCount(list, now)).toBe(2)
  })
  it('keeps the interval sensible', () => {
    expect(clampEvery(0)).toBe(1)
    expect(clampEvery('abc')).toBe(1)
    expect(clampEvery(500)).toBe(60)
    expect(clampEvery(6.6)).toBe(7)
  })

  describe('cleanPlant', () => {
    const good = {
      is_plant: true, name: 'Monstera', scientific: 'Monstera deliciosa', confidence: 'HIGH', kind: 'houseplant',
      alternatives: Array(5).fill({ name: 'Philodendron', scientific: 'Philodendron bipinnatifidum' }),
      health: { status: 'healthy', summary: 'Mostly fine.', issues: [{ name: 'Yellow leaf', signs: 'one leaf', cause: 'water', fix: 'dry out', severity: 'bogus' }] },
      care: { light: 'bright', water: 'weekly', water_every_days: 7, soil: 'airy', temperature: '18-27C', humidity: 'avg', feeding: 'monthly' },
      pets: { status: 'toxic', note: 'Toxic to cats and dogs.' }, fun_fact: 'Leaves split.', photo_tips: '',
    }
    it('keeps good answers and fixes odd values', () => {
      const r = cleanPlant(good)
      expect(r).toMatchObject({ is_plant: true, name: 'Monstera', confidence: 'high' })
      expect(r.alternatives).toHaveLength(3)
      expect(r.health.status).toBe('needs_attention') // an issue was listed, so it is not "healthy"
      expect(r.health.issues[0].severity).toBe('mild')
      expect(r.care.water_every_days).toBe(7)
      expect(r.pets.status).toBe('toxic')
    })
    it('asks for a better photo when there is no plant', () => {
      expect(cleanPlant({ is_plant: false, message: '' })).toMatchObject({ is_plant: false })
      expect(cleanPlant({ is_plant: false, message: '' }).message).toMatch(/closer photo/)
      expect(cleanPlant({ is_plant: true, name: '', scientific: '' }).is_plant).toBe(false)
      expect(cleanPlant(null).is_plant).toBe(false)
      expect(cleanPlant('nonsense').is_plant).toBe(false)
    })
    it('makes unexpected values safe', () => {
      const r = cleanPlant({ ...good, confidence: 'certain', pets: { status: 'edible!', note: 'x'.repeat(999) }, care: { ...good.care, water_every_days: 9999 } })
      expect(r.confidence).toBe('low')
      expect(r.pets.status).toBe('unknown')
      expect(r.pets.note).toHaveLength(300)
      expect(r.care.water_every_days).toBeNull()
      expect(cleanPlant({ ...good, care: { water_every_days: true } }).care.water_every_days).toBeNull()
    })
  })
})
