import { scanDocument } from './lib/scanner.js'

// Load a photo with its EXIF rotation applied (phone photos are often sideways),
// downscaled so uploads stay small and fast.
export async function loadPhotoCanvas(file, max = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c
}

export async function loadPhoto(file, max = 2000) {
  return (await loadPhotoCanvas(file, max)).toDataURL('image/jpeg', 0.92)
}

// ---- document scanning glue (the maths lives in lib/scanner.js) ----
export const pixelsOf = (source, w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function canvasOf({ data, width, height }) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  c.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0)
  return c
}

/** Find the page, flatten it, even out the light. Returns the cleaned canvas and whether a page was found. */
export function cleanUp(canvas) {
  const r = scanDocument(pixelsOf(canvas, canvas.width, canvas.height))
  return { canvas: canvasOf(r.img), found: r.found }
}


// crop = {x,y,w,h} as fractions (0..1) of the image.
export function cropImage(img, crop, max = 1600) {
  const sx = crop.x * img.naturalWidth
  const sy = crop.y * img.naturalHeight
  const sw = crop.w * img.naturalWidth
  const sh = crop.h * img.naturalHeight
  const scale = Math.min(1, max / Math.max(sw, sh))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * scale))
  c.height = Math.max(1, Math.round(sh * scale))
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.88)
}
