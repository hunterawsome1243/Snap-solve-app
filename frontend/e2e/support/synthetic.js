// Synthetic photos and camera video for the tests: no binary fixtures in git, nothing to download.
import zlib from 'node:zlib'

export const PAPER = [[140, 80], [500, 56], [540, 400], [110, 430]] // tl tr br bl, in a 640x480 frame

function inPoly(x, y, q) {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** RGBA frame: a lit-from-the-left sheet with lines of "writing", on a dark desk. */
export function paperFrame(width = 640, height = 480, quad = PAPER) {
  const data = new Uint8ClampedArray(width * height * 4)
  const lines = [0, 1, 2, 3].map((k) => [[170, 150 + k * 50], [470, 142 + k * 50], [470, 152 + k * 50], [170, 160 + k * 50]])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = [38, 36, 40]
      if (inPoly(x + 0.5, y + 0.5, quad)) {
        const light = 0.62 + 0.38 * Math.min(1, Math.max(0, (x - 100) / 440)) // a shadow across the left side
        c = lines.some((l) => inPoly(x + 0.5, y + 0.5, l)) ? [22, 22, 34] : [226 * light, 224 * light, 218 * light]
      }
      const i = (y * width + x) * 4
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
    }
  }
  return { data, width, height }
}

// ---- PNG encoder (RGB, no filtering) ----
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
})()
function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length)
  out.writeUInt32BE(body.length, 0)
  out.write(type, 4, 'ascii')
  body.copy(out, 8)
  out.writeUInt32BE(CRC(out.subarray(4, 8 + body.length)), 8 + body.length)
  return out
}
export function encodePng({ data, width, height }) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, o = y * (width * 3 + 1) + 1 + x * 3
      raw[o] = data[i]; raw[o + 1] = data[i + 1]; raw[o + 2] = data[i + 2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---- Y4M video: the fake camera in headless Chromium plays this file in a loop ----
export function encodeY4m({ data, width, height }, frames = 30) {
  const Y = Buffer.alloc(width * height)
  for (let i = 0; i < Y.length; i++) Y[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, chroma, chroma])
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`), ...Array(frames).fill(frame)])
}

// ---- an EAN-13 barcode on a white label, for the live barcode scanner tests ----
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_R = EAN_L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).join(''))
const EAN_G = EAN_R.map((p) => [...p].reverse().join(''))
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function ean13Modules(first12) {
  const d = [...first12].map(Number)
  const check = (10 - (d.reduce((s, v, i) => s + v * (i % 2 ? 3 : 1), 0) % 10)) % 10
  const all = [...d, check]
  const parity = EAN_PARITY[all[0]]
  let m = '101'
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[all[i]]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += EAN_R[all[i]]
  return { modules: m + '101', digits: all.join('') }
}

/** RGBA frame: a white label with the barcode, on a dark desk. */
export function barcodeFrame(first12, width = 640, height = 480, unit = 4) {
  const { modules } = ean13Modules(first12)
  const data = new Uint8ClampedArray(width * height * 4)
  const x0 = Math.round((width - modules.length * unit) / 2), y0 = Math.round(height * 0.3), y1 = Math.round(height * 0.7)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = [38, 36, 40]
      if (x > 40 && x < width - 40 && y > 70 && y < height - 70) c = [236, 236, 232]
      if (y >= y0 && y <= y1) {
        const k = Math.floor((x - x0) / unit)
        if (k >= 0 && k < modules.length && modules[k] === '1') c = [18, 18, 18]
      }
      const i = (y * width + x) * 4
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
    }
  }
  return { data, width, height }
}
