// Read a barcode (EAN-13/8, UPC-A/E) from a photo.
//
// A phone photo of a product is a hard case: the barcode is a small part of a big, sometimes blurry, dim, noisy or
// tilted picture. So after trying the browser's built-in detector (Chrome, Android), this looks at the picture many
// ways, cheapest first, and stops at the first barcode ZXing can read: the whole photo at several sizes (shrinking
// hides blur and noise), with the contrast stretched, tilted a little either way, and zoomed into parts of it.
//
// The ZXing library is passed in (`zx`), so the React app can load it from its bundle and the phone artifact from a CDN.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export function cleanCode(text) {
  const digits = String(text || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 14 ? digits : null
}

/** Stores look products up by the 12-digit UPC-A, so a short UPC-E code is expanded to it. */
export function upcEToA(code) {
  const d = String(code)
  if (!/^\d{8}$/.test(d) || (d[0] !== '0' && d[0] !== '1')) return d
  const [ns, a, b, c, e, f, g, check] = d
  const last = Number(g)
  let body
  if (last <= 2) body = `${a}${b}${g}0000${c}${e}${f}`
  else if (last === 3) body = `${a}${b}${c}00000${e}${f}`
  else if (last === 4) body = `${a}${b}${c}${e}00000${f}`
  else body = `${a}${b}${c}${e}${f}0000${g}`
  return `${ns}${body}${check}`
}

/** Stretch the grey levels so the darkest 2% become black and the lightest 2% white (helps dim, flat photos). */
export function stretch(gray) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const cut = gray.length * 0.02
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break } }
  if (hi - lo < 8) return gray
  const out = new Uint8ClampedArray(gray.length)
  const k = 255 / (hi - lo)
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * k
  return out
}

/** Box blur (a few passes of a moving average), in place of a heavier blur, for sharpening. */
function boxBlur(gray, w, h, r) {
  const tmp = new Float32Array(gray.length), out = new Float32Array(gray.length)
  const run = (src, dst, len, stride, lines, lineStride) => {
    for (let l = 0; l < lines; l++) {
      const base = l * lineStride
      let sum = 0
      for (let i = -r; i <= r; i++) sum += src[base + Math.min(len - 1, Math.max(0, i)) * stride]
      for (let i = 0; i < len; i++) {
        dst[base + i * stride] = sum / (2 * r + 1)
        sum += src[base + Math.min(len - 1, i + r + 1) * stride] - src[base + Math.max(0, i - r) * stride]
      }
    }
  }
  run(gray, tmp, w, 1, h, w)
  run(tmp, out, h, w, w, 1)
  return out
}

/** Unsharp mask: add back the difference from a blurred copy, so soft (out-of-focus) bars get crisp edges again. */
export function sharpen(gray, w, h, radius) {
  const blurred = boxBlur(gray, w, h, Math.max(1, Math.round(radius)))
  const out = new Uint8ClampedArray(gray.length)
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] + 2.5 * (gray[i] - blurred[i])
  return stretch(out)
}

const MAX_SIDE = 4096 // a 12-megapixel phone photo is used at its full size: a small barcode needs every pixel
const tick = () => new Promise((r) => setTimeout(r, 0)) // let the page breathe between attempts

async function toCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

/** A view of the photo: a part of it (fractions), scaled so its longest side is `side` pixels, turned by `deg` degrees. */
function renderView(src, { crop = [0, 0, 1, 1], side = MAX_SIDE, deg = 0 }) {
  const sx = crop[0] * src.width, sy = crop[1] * src.height, sw = crop[2] * src.width, sh = crop[3] * src.height
  const k = side / Math.max(sw, sh)
  const w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k))
  const rad = (deg * Math.PI) / 180
  const W = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)))
  const H = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)))
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d', { willReadFrequently: true })
  x.fillStyle = '#808080'
  x.fillRect(0, 0, W, H)
  x.imageSmoothingQuality = 'high'
  x.translate(W / 2, H / 2)
  x.rotate(rad)
  x.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  return c
}

function grayOf(canvas) {
  const { data, width, height } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
  return { gray, width, height }
}

export function makeReader(zx) {
  const reader = new zx.MultiFormatReader()
  reader.setHints(new Map([
    [zx.DecodeHintType.POSSIBLE_FORMATS, [zx.BarcodeFormat.EAN_13, zx.BarcodeFormat.EAN_8, zx.BarcodeFormat.UPC_A, zx.BarcodeFormat.UPC_E]],
    [zx.DecodeHintType.TRY_HARDER, true],
  ]))
  return reader
}

/** One look at one view. Returns the digits, or null. ZXing checks the barcode's own check digit. */
function readView(zx, reader, canvas, mode) {
  const { gray, width, height } = grayOf(canvas)
  const pixels = mode === 'sharp' ? sharpen(gray, width, height, Math.max(width, height) / 350) : mode === 'stretch' ? stretch(gray) : gray
  const lum = new zx.RGBLuminanceSource(pixels, width, height)
  for (const Binarizer of [zx.HybridBinarizer, zx.GlobalHistogramBinarizer]) {
    try {
      const res = reader.decode(new zx.BinaryBitmap(new Binarizer(lum)))
      const text = res.getText()
      return cleanCode(res.getBarcodeFormat() === zx.BarcodeFormat.UPC_E ? upcEToA(text) : text)
    } catch {
      /* not found in this view: carry on */
    }
  }
  return null
}

/**
 * The order the views are tried in: the cheap, likely ones first. `mode`: as it is, contrast stretched, or sharpened.
 * A barcode on a package held sideways reads top to bottom, so the likely views are also tried turned a quarter.
 */
export function plan() {
  const CENTER = [0.2, 0.2, 0.6, 0.6]
  const views = [{ side: MAX_SIDE }, { side: 1400 }, { side: 800 }, { side: 1400, crop: CENTER }, { side: 900, crop: CENTER }]
  const sideways = [{ side: MAX_SIDE }, { side: 1400 }, { side: 800 }, { side: 1400, crop: CENTER }].map((v) => ({ ...v, deg: 90 }))
  const steps = [
    ...views.map((v) => ({ ...v, mode: 'raw' })),
    ...views.map((v) => ({ ...v, mode: 'stretch' })),
    ...sideways.map((v) => ({ ...v, mode: 'raw' })),
    ...sideways.map((v) => ({ ...v, mode: 'stretch' })),
  ]
  // a little tilted either way
  for (const deg of [-12, 12, -24, 24]) steps.push({ side: 1400, deg, mode: 'stretch' })
  // out of focus: shrink (which hides blur) and sharpen
  for (const deg of [0, 90]) {
    steps.push(...[1400, 1000, 700].map((side) => ({ side, deg, mode: 'sharp' })), { side: 1000, deg, crop: CENTER, mode: 'sharp' })
  }
  for (const deg of [-12, 12, -24, 24]) steps.push({ side: 800, deg, mode: 'stretch' })
  for (const deg of [-36, 36, -48, 48]) steps.push({ side: 1400, deg, mode: 'stretch' }, { side: 800, deg, mode: 'stretch' })
  // zoom into each part of the photo, for a barcode that is small in a big picture
  const spots = [[0.3, 0.3], [0.05, 0.3], [0.55, 0.3], [0.3, 0.05], [0.3, 0.55], [0.05, 0.05], [0.55, 0.05], [0.05, 0.55], [0.55, 0.55]]
  for (const deg of [0, 90]) for (const [x, y] of spots) steps.push({ side: 1800, deg, crop: [x, y, 0.4, 0.4], mode: 'stretch' })
  return steps
}

async function builtIn(canvas) {
  if (!('BarcodeDetector' in window)) return null
  try {
    const found = await new window.BarcodeDetector({ formats: FORMATS }).detect(canvas)
    return cleanCode(found[0]?.rawValue)
  } catch {
    return null
  }
}

/**
 * Find a barcode in a photo file. `loadZXing` returns the ZXing namespace. Gives up after `budgetMs`.
 * `onProgress(fraction)` is optional.
 */
export async function decodeBarcode(file, { loadZXing, budgetMs = 15000, onProgress } = {}) {
  const src = await toCanvas(file)
  const quick = await builtIn(src)
  if (quick) return quick
  const zx = await loadZXing()
  const reader = makeReader(zx)
  const steps = plan()
  const t0 = Date.now()
  for (let i = 0; i < steps.length; i++) {
    if (Date.now() - t0 > budgetMs) break
    const { mode, ...view } = steps[i]
    const code = readView(zx, reader, renderView(src, view), mode)
    if (code) return code
    onProgress?.((i + 1) / steps.length)
    await tick()
  }
  return null
}

/** Look at one video frame or canvas, once (for live scanning). */
export async function decodeFrame(canvas, zx, reader = makeReader(zx)) {
  return (await builtIn(canvas)) || readView(zx, reader, canvas, 'raw') || readView(zx, reader, canvas, 'stretch')
}
