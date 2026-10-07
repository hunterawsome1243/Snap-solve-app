import { describe, expect, it } from 'vitest'
import { detectDocument, flattenIllumination, luminance, makeImage, scanDocument, sharpness, warpPerspective } from './scanner.js'

// ---- tiny synthetic photo helpers (no canvas needed) ----
function inPoly(x, y, q) {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function fillPoly(img, q, color) {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1])
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(img.height, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(img.width, Math.ceil(Math.max(...xs))); x++) {
      if (inPoly(x + 0.5, y + 0.5, q)) setPx(img, x, y, color)
    }
  }
}
const setPx = (img, x, y, c) => { const i = (y * img.width + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2] }
const getL = (img, x, y) => luminance(img)[y * img.width + x]
function rect(img, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, c) }

// a skewed sheet on a dark desk, with a few lines of "writing"
const PAPER = [[110, 70], [520, 40], [560, 400], [80, 430]] // tl tr br bl
function photo() {
  const img = makeImage(640, 480, [38, 36, 40])
  fillPoly(img, PAPER, [226, 224, 218])
  for (let k = 0; k < 4; k++) fillPoly(img, [[150, 150 + k * 50], [470, 140 + k * 50], [470, 150 + k * 50], [150, 160 + k * 50]], [20, 20, 30])
  return img
}

describe('detectDocument', () => {
  it('finds the corners of a skewed sheet', () => {
    const det = detectDocument(photo())
    expect(det).not.toBeNull()
    det.corners.forEach(([x, y], i) => {
      expect(Math.hypot(x - PAPER[i][0], y - PAPER[i][1])).toBeLessThan(640 * 0.03) // within 3% of the frame width
    })
    expect(det.confidence).toBeGreaterThan(0.5)
  })

  it('says "not found" for an empty desk and for a sheet that fills the frame', () => {
    expect(detectDocument(makeImage(640, 480, [60, 60, 60]))).toBeNull()
    expect(detectDocument(makeImage(640, 480, [240, 240, 240]))).toBeNull()
  })

  it('does not mistake a small bright blob for a document', () => {
    const img = makeImage(640, 480, [40, 40, 40])
    rect(img, 300, 200, 360, 250, [230, 230, 230])
    expect(detectDocument(img)).toBeNull()
  })
})

describe('warpPerspective', () => {
  it('turns the skewed sheet into an upright rectangle with the content in the right place', () => {
    const img = photo()
    // a black marker just inside the paper's top-left corner
    fillPoly(img, [[125, 85], [145, 83], [146, 100], [126, 102]], [0, 0, 0])
    const out = warpPerspective(img, PAPER.map((p) => [...p]))
    expect(out.width).toBeGreaterThan(380)
    expect(out.height).toBeGreaterThan(340)
    expect(out.width / out.height).toBeGreaterThan(1.0)
    // marker appears near the top-left of the flattened page; the far corner is paper-coloured
    let found = false
    for (let y = 0; y < out.height * 0.2 && !found; y++) for (let x = 0; x < out.width * 0.2; x++) if (getL(out, x, y) < 40) { found = true; break }
    expect(found).toBe(true)
    expect(getL(out, out.width - 6, out.height - 6)).toBeGreaterThan(180)
    expect(getL(out, 3, 3)).toBeGreaterThan(100) // no desk showing at the edge
  })
})

describe('flattenIllumination', () => {
  it('removes a lighting gradient and keeps the ink', () => {
    const img = makeImage(400, 300)
    for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) { const v = 90 + (x / 400) * 165; setPx(img, x, y, [v, v, v]) } // dark left, bright right
    rect(img, 100, 140, 300, 150, [15, 15, 15])
    const before = [getL(img, 20, 40), getL(img, 380, 40)]
    expect(before[1] - before[0]).toBeGreaterThan(100)
    const out = flattenIllumination(img)
    const bgL = [getL(out, 20, 40), getL(out, 200, 40), getL(out, 380, 40)]
    expect(Math.min(...bgL)).toBeGreaterThan(240)
    expect(getL(out, 200, 145)).toBeLessThan(60)
  })
})

describe('sharpness', () => {
  it('scores a crisp page above a blurred one', () => {
    const sharp = photo()
    const blurred = { ...sharp, data: new Uint8ClampedArray(sharp.data) }
    for (let pass = 0; pass < 6; pass++) {
      const src = new Uint8ClampedArray(blurred.data)
      for (let y = 1; y < blurred.height - 1; y++) for (let x = 1; x < blurred.width - 1; x++) for (let c = 0; c < 3; c++) {
        let s = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * blurred.width + x + dx) * 4 + c]
        blurred.data[(y * blurred.width + x) * 4 + c] = s / 9
      }
    }
    expect(sharpness(sharp)).toBeGreaterThan(sharpness(blurred) * 2)
  })
})

describe('scanDocument', () => {
  it('finds, flattens and cleans in one call', () => {
    const r = scanDocument(photo())
    expect(r.found).toBe(true)
    expect(r.img.width).toBeGreaterThan(300)
    expect(getL(r.img, 10, 10)).toBeGreaterThan(235) // paper is white
  })
  it('falls back to just cleaning the lighting when there is no sheet', () => {
    const r = scanDocument(makeImage(200, 150, [120, 120, 120]))
    expect(r.found).toBe(false)
    expect(r.img.width).toBe(200)
  })
})
