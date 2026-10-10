import { describe, expect, it } from 'vitest'
import { CATEGORIES, HOLIDAYS, STATUS, THEMES, holidayCss, themesIn } from './themes.js'

// WCAG contrast ratio between two #rrggbb colours.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('themes', () => {
  it('has a category for every theme and no duplicate ids or names', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length)
    for (const t of THEMES) expect(CATEGORIES.map((c) => c.id)).toContain(t.category)
    for (const c of CATEGORIES) expect(themesIn(c.id).length).toBeGreaterThan(0)
  })
  it('sorts the picker into everyday, nature, fun and holidays', () => {
    expect(themesIn('everyday').map((t) => t.id)).toEqual(['auto', 'light', 'dark'])
    expect(themesIn('nature').map((t) => t.id)).toEqual(['ocean', 'forest', 'sunset'])
    expect(themesIn('fun').map((t) => t.id)).toEqual(['science', 'tropical'])
  })
  it('lists the holidays in the order the year brings them, with Halloween in its place', () => {
    expect(themesIn('holidays').map((t) => t.id)).toEqual([
      'newyear', 'lunar', 'valentine', 'stpatrick', 'easter', 'july4', 'halloween', 'thanksgiving', 'christmas',
    ])
  })
  it('gives every holiday a complete definition', () => {
    for (const h of HOLIDAYS) {
      expect(h.emoji.length, h.id).toBeGreaterThanOrEqual(4)
      expect(['fall', 'rise'], h.id).toContain(h.motion)
      expect(h.logo, h.id).toBeTruthy()
      expect(h.stripe.length, h.id).toBeGreaterThanOrEqual(3)
      for (const k of ['bg', 'card', 'text', 'muted', 'line', 'soft', 'brand', 'brand2', 'ink', 'cta', 'cta2', 'ctaInk']) expect(h[k], `${h.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('keeps every holiday theme readable (WCAG contrast)', () => {
    for (const h of HOLIDAYS) {
      const at = (what, a, b, min) => expect(contrast(a, b), `${h.id}: ${what}`).toBeGreaterThanOrEqual(min)
      at('text on page', h.text, h.bg, 7)
      at('text on cards', h.text, h.card, 7)
      at('muted text on page', h.muted, h.bg, 4.5)
      at('muted text on cards', h.muted, h.card, 4.5)
      at('accent text on cards', h.brand, h.card, 4.5)
      at('text on the accent colour', h.ink, h.brand, 4.5)
      at('text on buttons', h.ctaInk, h.cta, 4.5)
      at('text on button gradient end', h.ctaInk, h.cta2, 4.5)
      at('accent on soft chips', h.brand, h.soft, 4.5)
      const s = h.dark ? STATUS.dark : STATUS.light
      at('ok banner', s.ok, s.okBg, 4.5); at('warn banner', s.warn, s.warnBg, 4.5); at('info banner', s.info, s.infoBg, 4.5)
    }
  })
  it('generates CSS for every holiday, including reduced motion', () => {
    const css = holidayCss()
    for (const h of HOLIDAYS) expect(css).toContain(`:root[data-skin='${h.id}']`)
    expect(css).toContain('prefers-reduced-motion')
  })
})
