/**
 * Everything sizely knows about each file format, in one table per property:
 * MIME type, file extension, display name, and whether it's an image.
 */

import type { DetectedFormat, FileKind } from './types'

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

const EXTENSIONS: Record<DetectedFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  heic: 'heic',
  pdf: 'pdf',
  unknown: 'bin',
}

const NAMES: Record<DetectedFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  heic: 'HEIC',
  pdf: 'PDF',
  unknown: '?',
}

const IMAGE_FORMATS = new Set<DetectedFormat>(['jpeg', 'png', 'webp', 'gif', 'avif', 'heic'])

/** `'jpeg'` → `'image/jpeg'` */
export const mimeOf = (format: DetectedFormat) => MIME[format]

/** `'jpeg'` → `'jpg'` */
export const extensionOf = (format: DetectedFormat) => EXTENSIONS[format]

/** `'jpeg'` → `'JPEG'`, for messages shown to people. */
export const formatName = (format: DetectedFormat) => NAMES[format]

export function kindOf(format: DetectedFormat): FileKind {
  if (IMAGE_FORMATS.has(format)) return 'image'
  if (format === 'pdf') return 'pdf'
  return 'other'
}
