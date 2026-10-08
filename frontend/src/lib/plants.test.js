import { describe, expect, it } from 'vitest'
import { clampEvery, dueCount, sortPlants, waterStatus } from './plants.js'
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
})
