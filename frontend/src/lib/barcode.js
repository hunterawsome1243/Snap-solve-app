// Read a barcode from a photo. Uses the browser's built-in detector where there is one (Chrome, Android),
// and falls back to ZXing everywhere else (including iPhone Safari).

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export function cleanCode(text) {
  const digits = String(text || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 14 ? digits : null
}

export async function decodeBarcode(file) {
  if ('BarcodeDetector' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const found = await new window.BarcodeDetector({ formats: FORMATS }).detect(bmp)
      const code = cleanCode(found[0]?.rawValue)
      if (code) return code
    } catch {
      /* fall through to ZXing */
    }
  }
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library')
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    [DecodeHintType.TRY_HARDER, true],
  ])
  const url = URL.createObjectURL(file)
  try {
    const res = await new BrowserMultiFormatReader(hints).decodeFromImageUrl(url)
    return cleanCode(res.getText())
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
