/**
 * Sample files generated on the fly, so the demo works without shipping
 * binaries and visitors can try it with one click.
 */

function addSensorNoise(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    d[i]! += n
    d[i + 1]! += n
    d[i + 2]! += n
  }
  ctx.putImageData(img, 0, 0)
}

/** A 3024×4032 portrait, like a phone camera's, about 4 MB. */
export async function samplePortrait(): Promise<File> {
  const w = 3024
  const h = 4032
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  const wall = ctx.createLinearGradient(0, 0, w, h)
  wall.addColorStop(0, '#9fb8d9')
  wall.addColorStop(1, '#d9e4f2')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, w, h)

  // Window light on the wall.
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.moveTo(w * 0.62, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h * 0.55)
  ctx.lineTo(w * 0.82, h * 0.7)
  ctx.closePath()
  ctx.fill()

  // Shoulders and sweater.
  ctx.fillStyle = '#2f3e64'
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 1.02, w * 0.52, h * 0.3, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#e8b9a0'
  ctx.fillRect(w * 0.43, h * 0.56, w * 0.14, h * 0.12)

  // Head.
  ctx.fillStyle = '#efc4aa'
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 0.44, w * 0.17, h * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2618'
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 0.35, w * 0.185, h * 0.09, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(w * 0.315, h * 0.35, w * 0.04, h * 0.1)
  ctx.fillRect(w * 0.645, h * 0.35, w * 0.04, h * 0.1)

  // Eyes and smile.
  ctx.fillStyle = '#2b1d14'
  for (const x of [0.44, 0.56]) {
    ctx.beginPath()
    ctx.ellipse(w * x, h * 0.44, w * 0.013, h * 0.008, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#a4574a'
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.48, w * 0.05, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()

  addSensorNoise(ctx, w, h, 28)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
  return new File([blob], 'IMG_2041.JPG', { type: 'image/jpeg', lastModified: Date.now() })
}

const CONTRACT = [
  'Service agreement',
  'This agreement is made between the parties named below,',
  'who agree to the following terms and conditions:',
  '1. The contractor will deliver the software described',
  '   in Appendix A, in monthly milestones.',
  '2. This agreement lasts twelve (12) months from the date',
  '   it is signed by both parties.',
  '3. Payment is due by the fifth business day of each month.',
]

async function scannedPage(page: number): Promise<Uint8Array> {
  const w = 2480
  const h = 3508
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#f3f1ec'
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-0.006) // scans are never straight
  ctx.translate(-w / 2, -h / 2)
  ctx.fillStyle = '#1c1c22'
  ctx.font = 'bold 76px Georgia, serif'
  ctx.fillText(CONTRACT[0]!, 230, 380)
  ctx.font = '54px Georgia, serif'
  for (let block = 0; block < 6; block++) {
    CONTRACT.slice(1).forEach((line, i) => ctx.fillText(line, 230, 580 + block * 470 + i * 64))
  }
  ctx.strokeStyle = '#2747d8'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.arc(1960, 3180, 170, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#2747d8'
  ctx.font = 'bold 50px sans-serif'
  ctx.fillText(`Page ${page}`, 1870, 3197)
  ctx.restore()
  addSensorNoise(ctx, w, h, 30)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
  return new Uint8Array(await blob.arrayBuffer())
}

/** A three-page A4 "scan" at 300 dpi, about 14 MB. */
export async function sampleScan(): Promise<File> {
  const { PDFDocument } = await import('@cantoo/pdf-lib')
  const doc = await PDFDocument.create()
  for (let p = 1; p <= 3; p++) {
    const image = await doc.embedJpg(await scannedPage(p))
    doc.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  }
  const bytes = await doc.save()
  return new File([bytes as BlobPart], 'contract-scan.pdf', { type: 'application/pdf' })
}
