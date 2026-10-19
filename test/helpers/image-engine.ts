import { imageSize, sniff } from '../../src'
import type { DecodedImage, DrawPlan, ImageEngine, ImageFormat } from '../../src/shared/types'

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0))

function pad(header: number[], size: number, trailer: number[] = []) {
  const out = new Uint8Array(Math.max(size, header.length + trailer.length))
  out.set(header)
  out.set(trailer, out.length - trailer.length)
  return out
}

/** Minimal JPEG: SOI, optional EXIF orientation, SOF0, zero padding, EOI. */
export function makeJpeg(width: number, height: number, size = 1000, orientation?: number) {
  const header = [0xff, 0xd8]
  if (orientation) {
    // APP1 'Exif\0\0' + big-endian TIFF with one IFD entry (0x0112).
    const tiff = [...bytes('MM'), 0, 42, ...be32(8), ...be16(1), ...be16(0x0112), ...be16(3), ...be32(1), ...be16(orientation), 0, 0, ...be32(0)]
    const payload = [...bytes('Exif'), 0, 0, ...tiff]
    header.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload)
  }
  header.push(0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1)
  return pad(header, size, [0xff, 0xd9])
}

export function makePng(width: number, height: number, size = 1000) {
  const header = [0x89, ...bytes('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...bytes('IHDR'), ...be32(width), ...be32(height), 8, 6, 0, 0, 0]
  return pad(header, size)
}

export function makeWebp(width: number, height: number, size = 1000) {
  const header = [
    ...bytes('RIFF'), ...le32(Math.max(size, 30) - 8), ...bytes('WEBP'), ...bytes('VP8X'), ...le32(10),
    0, 0, 0, 0,
    (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff,
  ]
  return pad(header, size)
}

export function makePdf(pages: number, size = 2000) {
  const text = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count ${pages} >> endobj\n%%EOF\n`
  return pad(bytes(text), size)
}

export const toFile = (data: Uint8Array, name: string, type = '') =>
  new File([data as BlobPart], name, { type })

/** Rough bytes-per-pixel model so tests can reason about sizes. */
export const BYTES_PER_PIXEL: Record<ImageFormat, (q: number) => number> = {
  jpeg: (q) => 0.05 + 0.6 * q,
  webp: (q) => 0.03 + 0.4 * q,
  png: () => 1.5,
}

export interface FakeEngineOptions {
  unsupported?: ImageFormat[]
}

/** Test double: "encodes" by writing a valid header padded to a modelled size. */
export function fakeEngine(options: FakeEngineOptions = {}) {
  const calls: { plan: DrawPlan; format: ImageFormat; quality: number }[] = []
  const decodes: { applyOrientation?: boolean }[] = []
  const pixels: Uint8ClampedArray[] = []
  const engine: ImageEngine = {
    async decode(blob: Blob, opts = {}): Promise<DecodedImage> {
      decodes.push(opts)
      const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer())
      const size = imageSize(head, sniff(head))
      if (!size) throw new Error('cannot decode')
      return { ...size, source: null }
    },
    async fromPixels(rgba, width, height) {
      pixels.push(rgba)
      return { width, height, source: null }
    },
    async encode(_image, plan, { format, quality }) {
      if (options.unsupported?.includes(format)) throw new Error(`cannot encode ${format}`)
      calls.push({ plan, format, quality })
      const size = Math.round(plan.width * plan.height * BYTES_PER_PIXEL[format](quality)) + 200
      const data =
        format === 'jpeg'
          ? makeJpeg(plan.width, plan.height, size)
          : format === 'png'
            ? makePng(plan.width, plan.height, size)
            : makeWebp(plan.width, plan.height, size)
      return new Blob([data as BlobPart], { type: `image/${format}` })
    },
  }
  return { engine, calls, decodes, pixels }
}
