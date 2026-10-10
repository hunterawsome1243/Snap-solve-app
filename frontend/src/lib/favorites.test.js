import { describe, expect, it } from 'vitest'
import { cleanFavs, DEFAULT_FAVS, toggleFav } from './favorites.js'

describe('cleanFavs', () => {
  it('falls back to Solve and Snap Buy when nothing valid was stored', () => {
    expect(cleanFavs(null)).toEqual(['solve', 'buy'])
    expect(cleanFavs('plants')).toEqual(DEFAULT_FAVS)
  })
  it('keeps real scanners only, once each, at most two; an empty list stays empty', () => {
    expect(cleanFavs(['plants', 'nope', 'plants', 'food', 'species'])).toEqual(['plants', 'food'])
    expect(cleanFavs([])).toEqual([])
  })
  it('does not hand out the shared default array to be mutated', () => {
    cleanFavs(null).push('x')
    expect(DEFAULT_FAVS).toEqual(['solve', 'buy'])
  })
})

describe('toggleFav', () => {
  it('pins into a free slot, and unpins on a second tap', () => {
    expect(toggleFav(['solve'], 'food')).toEqual({ favs: ['solve', 'food'], dropped: null })
    expect(toggleFav(['solve', 'food'], 'solve')).toEqual({ favs: ['food'], dropped: null })
    expect(toggleFav([], 'plants')).toEqual({ favs: ['plants'], dropped: null })
  })
  it('when both slots are taken the oldest pin is replaced', () => {
    expect(toggleFav(['solve', 'buy'], 'species')).toEqual({ favs: ['buy', 'species'], dropped: 'solve' })
  })
  it('ignores unknown ids', () => {
    expect(toggleFav(['solve'], 'bogus')).toEqual({ favs: ['solve'], dropped: null })
  })
})
