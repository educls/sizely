/**
 * Reads image width and height straight from the file headers, without
 * decoding pixels. One small parser per format; JPEG also applies EXIF rotation.
 */

import type { DetectedFormat } from '../shared/types'
import { ascii, be16, be32, le16, le32 } from './bytes'
import { sniff } from './sniff'

type Size = { width: number; height: number }

/** Reads the EXIF orientation tag (1–8) from a JPEG's APP1 segment. */
function jpegOrientation(b: Uint8Array, exifStart: number, exifEnd: number): number {
  const tiff = exifStart
  if (tiff + 8 > exifEnd) return 1
  const little = ascii(b, tiff, 2) === 'II'
  const u16 = (i: number) => (little ? le16(b, i) : be16(b, i))
  const u32 = (i: number) => (little ? le32(b, i) : be32(b, i))
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

/** Walks JPEG markers up to the frame header (SOF). */
function jpegSize(b: Uint8Array): Size | undefined {
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

/** WebP comes in three flavours: lossy (VP8), lossless (VP8L) and extended (VP8X). */
function webpSize(b: Uint8Array): Size | undefined {
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

/** AVIF and HEIC (ISOBMFF containers) store the size in an `ispe` box. */
function isobmffSize(b: Uint8Array): Size | undefined {
  for (let i = 0; i + 16 <= b.length; i++) {
    if (b[i] === 0x69 && ascii(b, i, 4) === 'ispe') {
      return { width: be32(b, i + 8), height: be32(b, i + 12) }
    }
  }
  return undefined
}

/** Reads pixel dimensions from image headers without decoding the image. */
export function imageSize(b: Uint8Array, format: DetectedFormat = sniff(b)): Size | undefined {
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
