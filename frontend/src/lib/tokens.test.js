import { describe, expect, it } from 'vitest'
import { flaggedIndexes, replaceToken, suggestionsFor, tokenize } from './tokens.js'

describe('tokens', () => {
  it('tokenizes commands, numbers and single symbols', () => {
    expect(tokenize('2x+\\frac{10}{3}=11').map((t) => t.text)).toEqual(['2', 'x', '+', '\\frac', '{', '10', '}', '{', '3', '}', '=', '11'])
  })
  it('suggests the model alternatives first, then look-alikes, never the symbol itself', () => {
    expect(suggestionsFor('S', [{ text: 'S', alternatives: ['5', 's'] }]).slice(0, 2)).toEqual(['5', 's'])
    expect(suggestionsFor('5')).toContain('S')
    expect(suggestionsFor('x')).toContain('\\times')
    expect(suggestionsFor('S', [{ text: 'S', alternatives: ['S', '5'] }])).not.toContain('S')
  })
  it('flags the first unmarked token for each uncertain entry', () => {
    const t = tokenize('S+S=10')
    expect([...flaggedIndexes(t, [{ text: 'S' }, { text: 'S' }])]).toEqual([0, 2])
    expect([...flaggedIndexes(t, [{ text: 'S' }])]).toEqual([0])
  })
  it('replaces a token and keeps commands from gluing onto letters', () => {
    const t = tokenize('2x+3=11')
    expect(replaceToken('2x+3=11', t[1], '\\times')).toBe('2\\times+3=11')
    expect(replaceToken('2xy', t[1], '\\times')).toBe('2\\times y')
    expect(replaceToken('2S=10', tokenize('2S=10')[1], '5')).toBe('25=10')
  })
})
