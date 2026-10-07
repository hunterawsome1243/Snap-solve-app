import { describe, expect, it } from 'vitest'
import { cleanCode } from './barcode.js'

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
