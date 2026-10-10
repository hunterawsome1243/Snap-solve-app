import fs from 'node:fs'
import { EAN_PNG } from './mocks.js'

// Photos of a barcode the way a phone really takes them: big, with a small barcode that may be dim, noisy, blurry or tilted.
export async function barcodePhoto(page, opts) {
  return page.evaluate(async ({ eanB64, opts }) => {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + eanB64 })
    const W = 4032, H = 3024
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#6d7f95'); g.addColorStop(1, '#c9b79c'); x.fillStyle = g; x.fillRect(0, 0, W, H)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 160; i++) { x.fillStyle = `hsla(${rnd() * 360},50%,${30 + rnd() * 50}%,.55)`; x.fillRect(rnd() * W, rnd() * H, 80 + rnd() * 700, 40 + rnd() * 300) }
    x.fillStyle = '#222'; x.font = '160px sans-serif'; for (let i = 0; i < 14; i++) x.fillText('NET WT 12 OZ  Fresh & Tasty', rnd() * W * 0.5, 200 + i * 210)
    const bw = W * opts.frac, bh = bw * (img.height / img.width)
    x.save(); x.translate(W * (opts.cx ?? 0.5), H * (opts.cy ?? 0.5)); x.rotate(((opts.deg || 0) * Math.PI) / 180)
    if (opts.blur) x.filter = `blur(${opts.blur}px)`
    x.drawImage(img, -bw / 2, -bh / 2, bw, bh); x.restore(); x.filter = 'none'
    if (opts.dark) { x.fillStyle = `rgba(0,0,0,${opts.dark})`; x.fillRect(0, 0, W, H) }
    if (opts.noise) { const d = x.getImageData(0, 0, W, H); for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * opts.noise; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n } x.putImageData(d, 0, 0) }
    return c.toDataURL('image/jpeg', 0.8).split(',')[1]
  }, { eanB64: fs.readFileSync(EAN_PNG).toString('base64'), opts })
}
