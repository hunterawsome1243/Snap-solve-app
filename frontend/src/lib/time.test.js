import { describe, expect, it } from 'vitest'
import { ago, DAY, isStale } from './time.js'

describe('time', () => {
  const now = 1_000_000_000_000
  it('formats ages', () => {
    expect(ago(now - 5_000, now)).toBe('just now')
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(ago(now - 3 * 3600_000, now)).toBe('3 h ago')
    expect(ago(now - 2 * DAY, now)).toBe('2 days ago')
    expect(ago(now - DAY, now)).toBe('1 day ago')
  })
  it('flags results older than a day', () => {
    expect(isStale(now - DAY + 1000, now)).toBe(false)
    expect(isStale(now - DAY - 1000, now)).toBe(true)
  })
})
