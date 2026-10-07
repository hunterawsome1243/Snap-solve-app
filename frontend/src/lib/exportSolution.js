// Save a solution as a PNG or PDF. The page draws a plain, fixed-width "sheet" off-screen and we photograph it.

export async function captureSheet(el) {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(el, { backgroundColor: getComputedStyle(el).backgroundColor, scale: 2, useCORS: true, logging: false })
}

async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type })
  // phones: the share sheet has "Save Image", "Save to Files", AirDrop, Messages ...
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'SnapSolve solution' })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export async function saveImage(el, filename = 'snapsolve.png') {
  const canvas = await captureSheet(el)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  return deliver(blob, filename)
}

export async function savePdf(el, filename = 'snapsolve.pdf') {
  const canvas = await captureSheet(el)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 28
  const w = pageW - margin * 2
  const h = (canvas.height * w) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)
  const usable = pageH - margin * 2
  for (let offset = 0, page = 0; offset < h - 1; offset += usable, page++) {
    if (page > 0) pdf.addPage()
    // draw the full image shifted up; margins are repainted over the overflow
    pdf.addImage(img, 'JPEG', margin, margin - offset, w, h)
    const bg = getComputedStyle(el).backgroundColor.match(/\d+/g)?.map(Number) || [255, 255, 255]
    pdf.setFillColor(...bg.slice(0, 3))
    pdf.rect(0, 0, pageW, margin, 'F')
    pdf.rect(0, pageH - margin, pageW, margin, 'F')
  }
  return deliver(pdf.output('blob'), filename)
}
