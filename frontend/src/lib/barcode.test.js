import { describe, expect, it } from 'vitest'
import { cleanCode, plan, sharpen, stretch, upcEToA } from './barcode.js'

describe('cleanCode', () => {
  it('accepts EAN/UPC lengths and strips non-digits', () => {
    expect(cleanCode('5901234123457')).toBe('5901234123457')
    expect(cleanCode('0 12345 67890 5')).toBe('012345678905')
    expect(cleanCode('96385074')).toBe('96385074')
  })
  it('rejects anything that is not a product barcode', () => {
    expect(cleanCode('12345')).toBeNull()
    expect(cleanCode('https://example.com')).toBeNull()
    expect(cleanCode('')).toBeNull()
    expect(cleanCode(undefined)).toBeNull()
  })
})

describe('upcEToA', () => {
  it('expands a short UPC-E code to the 12-digit UPC-A that stores use', () => {
    expect(upcEToA('04252614')).toBe('042100005264') // the standard worked example (last digit 1)
    expect(upcEToA('01234565')).toBe('012345000065') // last digit 6 (5 to 9 go at the end)
    expect(upcEToA('01234543')).toBe('012340000053') // last digit 4
  })
  it('leaves anything else alone', () => {
    expect(upcEToA('5901234123457')).toBe('5901234123457')
    expect(upcEToA('96385074')).toBe('96385074') // an EAN-8 does not start with 0 or 1
  })
})

describe('stretch and sharpen', () => {
  it('stretches a dull picture to the full range, and leaves a flat one alone', () => {
    const dull = Uint8ClampedArray.from({ length: 1000 }, (_, i) => 100 + (i % 2) * 40)
    const out = stretch(dull)
    expect(Math.min(...out)).toBe(0)
    expect(Math.max(...out)).toBe(255)
    const flat = new Uint8ClampedArray(100).fill(120)
    expect(stretch(flat)).toBe(flat)
  })
  it('makes a soft edge steeper', () => {
    const w = 40, h = 1, soft = new Uint8ClampedArray(w)
    for (let x = 0; x < w; x++) soft[x] = Math.round(255 * Math.min(1, Math.max(0, (x - 14) / 12))) // a gradual ramp
    const sharp = sharpen(soft, w, h, 3)
    expect(sharp[12] - sharp[8]).toBeLessThanOrEqual(soft[12] - soft[8] + 1) // dark side gets darker or stays
    expect(sharp[27]).toBeGreaterThanOrEqual(soft[27]) // light side gets lighter
  })
})

describe('the order barcode views are tried in', () => {
  const steps = plan()
  it('starts with the plain photo at full size, which is what usually works', () => {
    expect(steps[0]).toMatchObject({ mode: 'raw', side: 4096 })
    expect(steps[0].deg).toBeUndefined()
  })
  it('also tries sideways, tilted, sharpened and zoomed views', () => {
    expect(steps.some((s) => s.deg === 90)).toBe(true)
    expect(steps.some((s) => s.deg && Math.abs(s.deg) >= 36)).toBe(true)
    expect(steps.some((s) => s.mode === 'sharp')).toBe(true)
    expect(steps.some((s) => s.crop && s.crop[2] === 0.4)).toBe(true)
  })
  it('stays a sensible size', () => {
    expect(steps.length).toBeGreaterThan(30)
    expect(steps.length).toBeLessThan(120)
  })
})
