import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  concatTransformationMatrix,
} from '@cantoo/pdf-lib'
import { zlibSync } from 'fflate'
import { BYTES_PER_PIXEL, makeJpeg } from './image-engine'

export type TestImage =
  | { kind: 'jpeg'; width: number; height: number; bytes?: number; colorSpace?: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK' | 'ICC3'; smask?: boolean }
  | { kind: 'flate'; width: number; height: number; channels: 1 | 3; predictor?: 'png' | 'tiff' | 'none'; noise?: boolean }
  | { kind: 'raw'; dict: Record<string, unknown>; bytes: number }

/**
 * Deterministic pixels so decoding can be checked byte for byte. With `noise`,
 * the data is pseudo-random and barely compressible, like a photo.
 */
export function pattern(width: number, height: number, channels: number, noise = false) {
  const data = new Uint8Array(width * height * channels)
  let seed = 42
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        const base = (x * 7 + y * 13 + c * 61) & 0xff
        data[(y * width + x) * channels + c] = noise ? seed & 0xff : base
      }
    }
  }
  return data
}

/** PNG-filters rows, cycling through all five filter types. */
export function pngFilter(data: Uint8Array, width: number, height: number, bpp: number) {
  const rowBytes = width * bpp
  const out = new Uint8Array(height * (rowBytes + 1))
  for (let y = 0; y < height; y++) {
    const type = y % 5
    out[y * (rowBytes + 1)] = type
    for (let i = 0; i < rowBytes; i++) {
      const cur = data[y * rowBytes + i]!
      const left = i >= bpp ? data[y * rowBytes + i - bpp]! : 0
      const up = y > 0 ? data[(y - 1) * rowBytes + i]! : 0
      const upLeft = y > 0 && i >= bpp ? data[(y - 1) * rowBytes + i - bpp]! : 0
      let pred = 0
      if (type === 1) pred = left
      if (type === 2) pred = up
      if (type === 3) pred = (left + up) >> 1
      if (type === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      out[y * (rowBytes + 1) + 1 + i] = (cur - pred) & 0xff
    }
  }
  return out
}

function tiffFilter(data: Uint8Array, width: number, height: number, bpp: number) {
  const out = new Uint8Array(data)
  const rowBytes = width * bpp
  for (let y = 0; y < height; y++) {
    for (let i = rowBytes - 1; i >= bpp; i--) {
      const j = y * rowBytes + i
      out[j] = (data[j]! - data[j - bpp]!) & 0xff
    }
  }
  return out
}

/** Size a fake engine's JPEG would have at quality 0.95, like a high-quality scan. */
export const scanBytes = (w: number, h: number) => Math.round(w * h * BYTES_PER_PIXEL.jpeg(0.95))

export interface BuiltPdf {
  bytes: Uint8Array
  file: File
  imageRefs: string[]
}

/** Builds a PDF with one page per image, plus a line of real text on each page. */
export async function buildPdf(images: TestImage[], options: { signed?: boolean; encrypted?: boolean } = {}): Promise<BuiltPdf> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const ctx = doc.context
  const imageRefs: string[] = []

  for (const [i, image] of images.entries()) {
    const page = doc.addPage([595, 842])
    page.drawText(`Page ${i + 1}: selectable text`, { x: 40, y: 800, size: 14, font })

    let stream: PDFRawStream
    if (image.kind === 'jpeg') {
      const cs =
        image.colorSpace === 'ICC3'
          ? ctx.obj([PDFName.of('ICCBased'), ctx.register(ctx.stream(new Uint8Array(128), { N: 3 }))])
          : PDFName.of(image.colorSpace ?? 'DeviceRGB')
      const dict = ctx.obj({
        Type: 'XObject', Subtype: 'Image', Width: image.width, Height: image.height,
        BitsPerComponent: 8, ColorSpace: cs, Filter: 'DCTDecode',
      }) as PDFDict
      const bytes = makeJpeg(image.width, image.height, image.bytes ?? scanBytes(image.width, image.height))
      if (image.smask) {
        const maskDict = ctx.obj({
          Type: 'XObject', Subtype: 'Image', Width: 1000, Height: 1000, BitsPerComponent: 8,
          ColorSpace: 'DeviceGray', Filter: 'FlateDecode', Decode: [0, 1],
        }) as PDFDict
        dict.set(PDFName.of('SMask'), ctx.register(PDFRawStream.of(maskDict, zlibSync(pattern(1000, 1000, 1, true)))))
      }
      stream = PDFRawStream.of(dict, bytes)
    } else if (image.kind === 'flate') {
      const raw = pattern(image.width, image.height, image.channels, image.noise)
      const predictor = image.predictor ?? 'none'
      const filtered =
        predictor === 'png' ? pngFilter(raw, image.width, image.height, image.channels)
        : predictor === 'tiff' ? tiffFilter(raw, image.width, image.height, image.channels)
        : raw
      const dict = ctx.obj({
        Type: 'XObject', Subtype: 'Image', Width: image.width, Height: image.height,
        BitsPerComponent: 8, ColorSpace: image.channels === 3 ? 'DeviceRGB' : 'DeviceGray', Filter: 'FlateDecode',
      }) as PDFDict
      if (predictor !== 'none') {
        dict.set(PDFName.of('DecodeParms'), ctx.obj({
          Predictor: predictor === 'png' ? 15 : 2, Colors: image.channels, BitsPerComponent: 8, Columns: image.width,
        }))
      }
      stream = PDFRawStream.of(dict, zlibSync(filtered))
    } else {
      stream = PDFRawStream.of(ctx.obj({ Type: 'XObject', Subtype: 'Image', ...image.dict } as never) as unknown as PDFDict, new Uint8Array(image.bytes))
    }
    const ref = ctx.register(stream)
    imageRefs.push(ref.toString())
    const name = page.node.newXObject('Im', ref)
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(500, 0, 0, 700, 40, 60),
      drawObject(name),
      popGraphicsState(),
    )
  }

  if (options.signed) {
    const sig = ctx.obj({
      Type: 'Sig', Filter: 'Adobe.PPKLite', ByteRange: [0, 10, 20, 30], Contents: PDFString.of('00'),
    })
    const sigRef = ctx.register(sig)
    const field = ctx.register(ctx.obj({ FT: 'Sig', T: PDFString.of('Signature1'), V: sigRef }))
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [field], SigFlags: 3 }))
  }
  if (options.encrypted) {
    ctx.trailerInfo.Encrypt = ctx.register(ctx.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }))
  }

  const bytes = await doc.save({ useObjectStreams: false })
  return { bytes, file: new File([bytes as BlobPart], 'scan.pdf', { type: 'application/pdf' }), imageRefs }
}

export async function readImages(blob: Blob) {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))
  const images: { ref: string; width: number; height: number; filter: string; colorSpace: string; bytes: number; hasDecodeParms: boolean; smask?: string }[] = []
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
    const n = (k: string) => (obj.dict.lookup(PDFName.of(k)) as PDFNumber).asNumber()
    const cs = obj.dict.lookup(PDFName.of('ColorSpace'))
    images.push({
      ref: ref.toString(),
      width: n('Width'),
      height: n('Height'),
      filter: String(obj.dict.lookup(PDFName.of('Filter'))),
      colorSpace: cs instanceof PDFArray ? String(cs.lookup(0)) : String(cs),
      bytes: obj.contents.length,
      hasDecodeParms: obj.dict.has(PDFName.of('DecodeParms')),
      smask: obj.dict.get(PDFName.of('SMask'))?.toString(),
    })
  }
  return { doc, images, pages: doc.getPageCount() }
}
