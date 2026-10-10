import { describe, expect, it } from 'vitest'
import { lineAt, PROGRESS, PROGRESS_MS } from './progress.js'

describe('progress lines', () => {
  it('every scanner has at least two short lines that trail off', () => {
    for (const [key, list] of Object.entries(PROGRESS)) {
      expect(list.length, key).toBeGreaterThanOrEqual(2)
      for (const line of list) {
        expect(line.trim().length, key).toBeGreaterThan(0)
        expect(line.endsWith('…'), `${key}: ${line}`).toBe(true)
        expect(line.length, `${key}: ${line}`).toBeLessThan(45)
      }
    }
  })
  it('lineAt loops and copes with nothing', () => {
    const L = PROGRESS.food
    expect(lineAt(0, L)).toBe(L[0])
    expect(lineAt(L.length, L)).toBe(L[0])
    expect(lineAt(L.length + 1, L)).toBe(L[1])
    expect(lineAt(3, [])).toBe('')
    expect(lineAt(3, undefined)).toBe('')
  })
  it('ticks are slow enough to read', () => {
    expect(PROGRESS_MS).toBeGreaterThanOrEqual(1200)
  })
})
