// Load a photo with its EXIF rotation applied (phone photos are often sideways),
// downscaled so uploads stay small and fast.
export async function loadPhoto(file, max = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.92)
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
