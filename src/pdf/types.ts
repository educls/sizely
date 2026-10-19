/**
 * Types for sizely/pdf: compression options, the per-image report and the
 * result. `Candidate` and `Encoded` are internal working types.
 */

import type { PDFRawStream, PDFRef } from '@cantoo/pdf-lib'
import type { DecodedImage, ImageEngine } from '../shared/types'

export interface PdfCompressOptions {
  /** Aim for this many bytes. Without it, images are re-encoded once at `defaultQuality`. */
  targetBytes?: number
  signal?: AbortSignal
  /** Image engine for decoding and re-encoding. Defaults to the canvas engine. */
  engine?: ImageEngine
  /** Highest JPEG quality tried (default 0.85). */
  maxQuality?: number
  /** Lowest JPEG quality before images are downscaled (default 0.4). */
  minQuality?: number
  /** Quality used when there's no target (default 0.75). */
  defaultQuality?: number
  /**
   * Images are never downscaled below this many pixels on their long side
   * (default 1000, roughly 85 dpi for an A4 scan). Keeps documents readable.
   */
  minLongSide?: number
  /** Images smaller than this are left alone (default 8 KB). */
  minImageBytes?: number
  onStep?: (step: string) => void
}

export type PdfImageStatus = 'recompressed' | 'kept' | 'skipped'

export interface PdfImageReport {
  /** Object reference, e.g. `12 0 R`. */
  ref: string
  width: number
  height: number
  filter: string
  originalBytes: number
  status: PdfImageStatus
  /** Present when recompressed. */
  newBytes?: number
  newWidth?: number
  newHeight?: number
  /** Why an image was skipped or kept. */
  reason?: string
}

export interface PdfCompressResult {
  blob: Blob
  originalSize: number
  size: number
  /** `null` when no target was given. */
  metTarget: boolean | null
  images: PdfImageReport[]
  /** The global settings applied to recompressed images. */
  settings: { quality: number; scale: number } | null
}

/** An image that passed analysis and may be recompressed. Internal. */
export interface Candidate {
  ref: PDFRef
  stream: PDFRawStream
  report: PdfImageReport
  filter: 'DCTDecode' | 'FlateDecode'
  channels: 1 | 3
  /** Keep the original colour space (RGB or 3-channel ICC); gray becomes DeviceRGB. */
  keepColorSpace: boolean
  predictor: number
  image?: DecodedImage
}

/** One re-encoded version of an image. Internal. */
export interface Encoded {
  bytes: Uint8Array
  width: number
  height: number
}
