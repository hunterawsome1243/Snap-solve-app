// Document scanning, without OpenCV: find the sheet of paper, flatten its perspective, remove shadows.
//
// Everything here works on plain pixel buffers, { data: Uint8ClampedArray (RGBA), width, height }, so the same
// code runs in the React app, inlined into the single-file artifact, and in unit tests. Canvas glue lives elsewhere.
//
// Detection assumes the usual case: a lighter sheet on a darker surface. When it can't find a convincing
// rectangle it says so (returns null) and callers fall back to the whole frame rather than guessing.

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

export function makeImage(width, height, fill = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** Average-pool by an integer factor so the longest side is at most maxSide. */
export function downscale(img, maxSide) {
  const factor = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxSide))
  if (factor === 1) return { img, factor: 1 }
  const w = Math.floor(img.width / factor)
  const h = Math.floor(img.height / factor)
  const out = new Uint8ClampedArray(w * h * 4)
  const n = factor * factor
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0
      for (let dy = 0; dy < factor; dy++) {
        let i = ((y * factor + dy) * img.width + x * factor) * 4
        for (let dx = 0; dx < factor; dx++, i += 4) {
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return { img: { data: out, width: w, height: h }, factor }
}

export function luminance(img) {
  const L = new Uint8Array(img.width * img.height)
  for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000
  return L
}

function boxBlur(src, w, h) {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          s += src[yy * w + xx]; n++
        }
      }
      out[y * w + x] = s / n
    }
  }
  return out
}

function otsu(L) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < L.length; i++) hist[L[i]]++
  const total = L.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, best = 0, thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) { best = between; thr = t }
  }
  return thr
}

function largestComponent(mask, w, h) {
  const label = new Int32Array(w * h)
  const queue = new Int32Array(w * h)
  let bestId = 0, bestArea = 0, id = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue
    id++
    let head = 0, tail = 0
    queue[tail++] = start
    label[start] = id
    while (head < tail) {
      const p = queue[head++]
      const x = p % w, y = (p - x) / w
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; queue[tail++] = p - 1 }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; queue[tail++] = p + 1 }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; queue[tail++] = p - w }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; queue[tail++] = p + w }
    }
    if (tail > bestArea) { bestArea = tail; bestId = id }
  }
  if (!bestId) return null
  const pixels = new Int32Array(bestArea)
  for (let p = 0, k = 0; p < label.length; p++) if (label[p] === bestId) pixels[k++] = p
  return pixels
}

const area = (q) => {
  let s = 0
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1] }
  return Math.abs(s) / 2
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
function isConvex(q) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (cross === 0) continue
    if (!sign) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

/**
 * Find the sheet of paper. Returns { corners: [tl, tr, br, bl] in pixels of `img`, confidence 0..1 } or null.
 */
export function detectDocument(img, { analysisSize = 240 } = {}) {
  const { img: small, factor } = downscale(img, analysisSize)
  const { width: w, height: h } = small
  const L = boxBlur(boxBlur(luminance(small), w, h), w, h)
  const thr = otsu(L)
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) mask[i] = L[i] > thr ? 1 : 0
  const comp = largestComponent(mask, w, h)
  if (!comp) return null
  const frac = comp.length / (w * h)
  if (frac < 0.12 || frac > 0.97) return null

  // corners = the pixels farthest along each diagonal (averaged, so one noisy pixel can't move a corner)
  const n = comp.length
  const k = Math.max(3, Math.floor(n * 0.004))
  const pick = (key) => {
    const idx = Array.from(comp)
    idx.sort((a, b) => key(a) - key(b))
    let sx = 0, sy = 0
    for (let i = 0; i < k; i++) { const p = idx[i]; sx += p % w; sy += Math.floor(p / w) }
    return [sx / k, sy / k]
  }
  const X = (p) => p % w
  const Y = (p) => Math.floor(p / w)
  const quad = [
    pick((p) => X(p) + Y(p)), // tl
    pick((p) => -(X(p) - Y(p))), // tr
    pick((p) => -(X(p) + Y(p))), // br
    pick((p) => X(p) - Y(p)), // bl
  ]
  if (!isConvex(quad)) return null
  const qa = area(quad)
  const fill = n / qa // how much of the quad is bright paper; text holes lower it a little
  if (fill < 0.72 || fill > 1.2) return null
  const top = dist(quad[0], quad[1]), bottom = dist(quad[3], quad[2])
  const left = dist(quad[0], quad[3]), right = dist(quad[1], quad[2])
  if (Math.max(top, bottom) / Math.min(top, bottom) > 3 || Math.max(left, right) / Math.min(left, right) > 3) return null
  if (Math.min(top, bottom, left, right) < Math.min(w, h) * 0.2) return null

  // pixel centres of the border pixels sit half a pixel inside the true edge
  const corners = quad.map(([x, y]) => [(x + 0.5) * factor, (y + 0.5) * factor])
  return { corners, confidence: Math.max(0, Math.min(1, 1 - Math.abs(1 - fill) * 2)) }
}

// ---- perspective warp -------------------------------------------------------------------------------------

function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return { a: x1 - x0, b: x3 - x0, c: x0, d: y1 - y0, e: y3 - y0, f: y0, g: 0, h: 0 }
  }
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const h = (dx1 * dy3 - dx3 * dy1) / den
  return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h }
}

/** Flatten the quad [tl, tr, br, bl] into an upright rectangle. */
export function warpPerspective(img, corners, maxSide = 2000) {
  const [tl, tr, br, bl] = corners
  let W = Math.max(dist(tl, tr), dist(bl, br))
  let H = Math.max(dist(tl, bl), dist(tr, br))
  const s = Math.min(1, maxSide / Math.max(W, H))
  W = Math.max(8, Math.round(W * s))
  H = Math.max(8, Math.round(H * s))
  const m = squareToQuad(corners)
  const out = new Uint8ClampedArray(W * H * 4)
  const { data, width, height } = img
  for (let v = 0; v < H; v++) {
    const t = (v + 0.5) / H
    for (let u = 0; u < W; u++) {
      const sq = (u + 0.5) / W
      const den = m.g * sq + m.h * t + 1
      const x = (m.a * sq + m.b * t + m.c) / den - 0.5
      const y = (m.d * sq + m.e * t + m.f) / den - 0.5
      const x0 = Math.max(0, Math.min(width - 2, Math.floor(x)))
      const y0 = Math.max(0, Math.min(height - 2, Math.floor(y)))
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0))
      const i00 = (y0 * width + x0) * 4, i10 = i00 + 4, i01 = i00 + width * 4, i11 = i01 + 4
      const o = (v * W + u) * 4
      for (let c = 0; c < 3; c++) {
        out[o + c] = (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) + (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy
      }
      out[o + 3] = 255
    }
  }
  return { data: out, width: W, height: H }
}

// ---- shadow removal -----------------------------------------------------------------------------------------

/**
 * Even out the lighting. The paper colour in each block (its 90th-percentile brightness: text covers far less
 * than 10% of a block) is the local "white"; dividing by it removes shadows and gradients and keeps the ink.
 */
export function flattenIllumination(img) {
  const { width: w, height: h, data } = img
  const L = luminance(img)
  const block = Math.max(8, Math.round(Math.min(w, h) / 36))
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block)
  const bg = new Float32Array(bw * bh)
  const hist = new Uint16Array(256)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0)
      let n = 0
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y++) {
        for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x++) { hist[L[y * w + x]]++; n++ }
      }
      let acc = 0, v = 255
      for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= n * 0.1) { v = t; break } }
      bg[by * bw + bx] = Math.max(60, v)
    }
  }
  // smooth the grid so block edges never show
  const sm = new Float32Array(bg.length)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0, c = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = by + dy, xx = bx + dx
        if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) { s += bg[yy * bw + xx]; c++ }
      }
      sm[by * bw + bx] = s / c
    }
  }
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y++) {
    const gy = Math.max(0, Math.min(bh - 1, (y + 0.5) / block - 0.5))
    const y0 = Math.floor(gy), y1 = Math.min(bh - 1, y0 + 1), fy = gy - y0
    for (let x = 0; x < w; x++) {
      const gx = Math.max(0, Math.min(bw - 1, (x + 0.5) / block - 0.5))
      const x0 = Math.floor(gx), x1 = Math.min(bw - 1, x0 + 1), fx = gx - x0
      const b = (sm[y0 * bw + x0] * (1 - fx) + sm[y0 * bw + x1] * fx) * (1 - fy) + (sm[y1 * bw + x0] * (1 - fx) + sm[y1 * bw + x1] * fx) * fy
      const k = 255 / b
      const i = (y * w + x) * 4
      out[i] = clamp255(data[i] * k); out[i + 1] = clamp255(data[i + 1] * k); out[i + 2] = clamp255(data[i + 2] * k); out[i + 3] = 255
    }
  }
  // push the ink toward black: stretch from the darkest 0.5% up to white
  const hist2 = new Uint32Array(256)
  for (let i = 0; i < out.length; i += 4) hist2[(out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) / 1000 | 0]++
  let acc = 0, lo = 0
  for (let t = 0; t < 256; t++) { acc += hist2[t]; if (acc >= w * h * 0.005) { lo = t; break } }
  if (lo > 0 && lo < 200) {
    const scale = 255 / (255 - lo)
    for (let i = 0; i < out.length; i += 4) {
      out[i] = clamp255((out[i] - lo) * scale); out[i + 1] = clamp255((out[i + 1] - lo) * scale); out[i + 2] = clamp255((out[i + 2] - lo) * scale)
    }
  }
  return { data: out, width: w, height: h }
}

// ---- focus ---------------------------------------------------------------------------------------------------

/** Variance of the Laplacian on a small copy: higher means sharper. Compare readings against each other, not to a fixed number. */
export function sharpness(img) {
  const { img: small } = downscale(img, 320)
  const { width: w, height: h } = small
  const L = luminance(small)
  let sum = 0, sum2 = 0, n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]
      sum += lap; sum2 += lap * lap; n++
    }
  }
  const mean = sum / n
  return sum2 / n - mean * mean
}

// ---- the whole pipeline --------------------------------------------------------------------------------------

/** Quad as fractions of the frame (0..1), handy for drawing an overlay on a video of any size. */
export function normalizeCorners(corners, width, height) {
  return corners.map(([x, y]) => [x / width, y / height])
}

/**
 * Photo in, scan out: find the sheet, flatten it, remove shadows. If no sheet is found the whole frame is
 * kept and only the lighting is fixed. `found` says which happened.
 */
export function scanDocument(img, { maxSide = 2000 } = {}) {
  const det = detectDocument(img)
  const flat = det ? warpPerspective(img, det.corners, maxSide) : img
  return { img: flattenIllumination(flat), found: !!det, corners: det ? det.corners : null }
}
