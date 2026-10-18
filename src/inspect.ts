import type { DetectedFormat, FileInfo, FileKind } from './types'

const MIME: Record<DetectedFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  pdf: 'application/pdf',
  unknown: 'application/octet-stream',
}

const IMAGE_FORMATS = new Set<DetectedFormat>(['jpeg', 'png', 'webp', 'gif', 'avif', 'heic'])

/** Bytes read for images. Enough for headers plus a large EXIF thumbnail. */
const IMAGE_HEAD_BYTES = 512 * 1024

const ascii = (b: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...b.subarray(start, start + length))

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8)
const be32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0

/** Detects the real format from magic bytes. File names and MIME types lie. */
export function sniff(b: Uint8Array): DetectedFormat {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && ascii(b, 1, 3) === 'PNG' && b[0] === 0x89) return 'png'
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'gif'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const boxSize = Math.min(be32(b, 0), b.length)
    const brands: string[] = [ascii(b, 8, 4)]
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(b, i, 4))
    if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif'
    if (brands.some((x) => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1'].includes(x))) {
      return 'heic'
    }
  }
  // The PDF header may legally be preceded by junk within the first 1 KB.
  const head = ascii(b, 0, Math.min(b.length, 1024))
  if (head.includes('%PDF-')) return 'pdf'
  return 'unknown'
}

function jpegOrientation(b: Uint8Array, exifStart: number, exifEnd: number): number {
  const tiff = exifStart
  if (tiff + 8 > exifEnd) return 1
  const little = ascii(b, tiff, 2) === 'II'
  const u16 = (i: number) => (little ? le16(b, i) : be16(b, i))
  const u32 = (i: number) =>
    little
      ? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0
      : be32(b, i)
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > exifEnd) return 1
  const count = u16(ifd)
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12
    if (entry + 12 > exifEnd) break
    if (u16(entry) === 0x0112) return u16(entry + 8)
  }
  return 1
}

function jpegSize(b: Uint8Array): { width: number; height: number } | undefined {
  let orientation = 1
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]!
    if (marker === 0xff) {
      i++
      continue
    }
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break
    const length = be16(b, i + 2)
    if (marker === 0xe1 && ascii(b, i + 4, 6) === 'Exif\0\0') {
      orientation = jpegOrientation(b, i + 10, Math.min(b.length, i + 2 + length))
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof && i + 9 <= b.length) {
      const height = be16(b, i + 5)
      const width = be16(b, i + 7)
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height }
    }
    i += 2 + length
  }
  return undefined
}

function webpSize(b: Uint8Array): { width: number; height: number } | undefined {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ' && b.length >= 30) {
    return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const width = 1 + (((b[22]! & 0x3f) << 8) | b[21]!)
    const height = 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6))
    return { width, height }
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16))
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16))
    return { width, height }
  }
  return undefined
}

function isobmffSize(b: Uint8Array): { width: number; height: number } | undefined {
  for (let i = 0; i + 16 <= b.length; i++) {
    if (b[i] === 0x69 && ascii(b, i, 4) === 'ispe') {
      return { width: be32(b, i + 8), height: be32(b, i + 12) }
    }
  }
  return undefined
}

/** Reads pixel dimensions from image headers without decoding the image. */
export function imageSize(
  b: Uint8Array,
  format: DetectedFormat = sniff(b),
): { width: number; height: number } | undefined {
  switch (format) {
    case 'png':
      return b.length >= 24 ? { width: be32(b, 16), height: be32(b, 20) } : undefined
    case 'gif':
      return b.length >= 10 ? { width: le16(b, 6), height: le16(b, 8) } : undefined
    case 'jpeg':
      return jpegSize(b)
    case 'webp':
      return webpSize(b)
    case 'avif':
    case 'heic':
      return isobmffSize(b)
    default:
      return undefined
  }
}

/**
 * Best-effort PDF page count. Reads the page tree's /Count. Returns
 * undefined for PDFs whose objects are hidden in compressed object streams.
 */
export function pdfPageCount(b: Uint8Array): number | undefined {
  const text = new TextDecoder('latin1').decode(b)
  let best: number | undefined
  const counts = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g
  for (const match of text.matchAll(counts)) {
    const n = Number(match[1] ?? match[2])
    if (best === undefined || n > best) best = n
  }
  if (best !== undefined) return best
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)
  return pages ? pages.length : undefined
}

function kindOf(format: DetectedFormat): FileKind {
  if (IMAGE_FORMATS.has(format)) return 'image'
  if (format === 'pdf') return 'pdf'
  return 'other'
}

/** Inspects a File or Blob by reading its bytes. */
export async function inspect(file: Blob): Promise<FileInfo> {
  const headBuffer = await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer()
  const head = new Uint8Array(headBuffer)
  const format = sniff(head)
  const kind = kindOf(format)
  const info: FileInfo = {
    kind,
    format,
    mime: format === 'unknown' ? file.type || MIME.unknown : MIME[format],
    size: file.size,
  }
  if (kind === 'image') {
    const size = imageSize(head, format)
    if (size) {
      info.width = size.width
      info.height = size.height
    }
  } else if (kind === 'pdf') {
    const all = file.size <= IMAGE_HEAD_BYTES ? head : new Uint8Array(await file.arrayBuffer())
    const pages = pdfPageCount(all)
    if (pages !== undefined) info.pages = pages
  }
  return info
}

export const mimeOf = (format: DetectedFormat) => MIME[format]

export const EXTENSIONS: Record<DetectedFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  heic: 'heic',
  pdf: 'pdf',
  unknown: 'bin',
}
