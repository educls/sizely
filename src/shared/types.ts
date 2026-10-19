/**
 * Public types shared across the library: file info, issues, results, and
 * the engine interfaces that let you plug in your own image or PDF backend.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp'

export type DetectedFormat =
  | ImageFormat
  | 'gif'
  | 'avif'
  | 'heic'
  | 'pdf'
  | 'unknown'

export type FileKind = 'image' | 'pdf' | 'other'

/** What sizely learned about a file by reading its bytes (not its name). */
export interface FileInfo {
  kind: FileKind
  format: DetectedFormat
  mime: string
  size: number
  /** Displayed width, EXIF rotation already applied. */
  width?: number
  /** Displayed height, EXIF rotation already applied. */
  height?: number
  /** Best-effort page count; undefined when it can't be read cheaply. */
  pages?: number
}

export type IssueCode =
  | 'wrong_type'
  | 'wrong_format'
  | 'too_large'
  | 'too_small'
  | 'wrong_dimensions'
  | 'dimensions_too_large'
  | 'dimensions_too_small'
  | 'wrong_aspect_ratio'
  | 'too_many_pages'
  | 'unreadable'
  /** Signed or password-protected PDF, which must not be modified. */
  | 'protected'

export interface Issue {
  code: IssueCode
  /** Localized, end-user friendly message. */
  message: string
}

export interface CheckResult {
  ok: boolean
  info: FileInfo
  issues: Issue[]
}

export type Locale = 'en' | 'pt-BR'

export interface FitResult {
  /** The file to upload. The original when nothing needed fixing. */
  file: File
  /** Whether sizely produced a new file. */
  changed: boolean
  original: FileInfo
  info: FileInfo
  /** What was done, in order, e.g. `resized 4032×3024 → 600×800`. */
  steps: string[]
}

/** Draw instructions handed to an image engine. Coordinates are in pixels. */
export interface DrawPlan {
  width: number
  height: number
  /** Source crop rectangle. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination rectangle inside the output canvas. */
  dx: number
  dy: number
  dw: number
  dh: number
}

export interface DecodedImage {
  width: number
  height: number
  /** Engine-specific handle (ImageBitmap in the browser). */
  source: unknown
  close?: () => void
}

/**
 * Pluggable image backend. The default uses createImageBitmap + canvas,
 * so it runs in browsers and web workers. Swap it for sharp, jSquash,
 * or a test double.
 */
export interface ImageEngine {
  /**
   * Decodes an encoded image. `applyOrientation: false` ignores EXIF rotation,
   * which is what PDF viewers do with JPEGs embedded in a PDF.
   */
  decode(blob: Blob, options?: { applyOrientation?: boolean }): Promise<DecodedImage>
  /** Wraps raw RGBA pixels. Needed by `sizely/pdf` for Flate-compressed images. */
  fromPixels?(rgba: Uint8ClampedArray, width: number, height: number): Promise<DecodedImage>
  encode(
    image: DecodedImage,
    plan: DrawPlan,
    options: { format: ImageFormat; quality: number; background: string },
  ): Promise<Blob>
}

/**
 * Pluggable PDF backend. `sizely/pdf` provides an MIT one (`pdfEngine()`);
 * you can also wrap Ghostscript, MuPDF or Hyper Compress (AGPL).
 *
 * Throw an error with `issueCode: 'protected'` for signed or encrypted PDFs.
 */
export interface PdfEngine {
  compress(
    file: Blob,
    options: { targetBytes?: number; signal?: AbortSignal; onStep?: (step: string) => void },
  ): Promise<Blob>
}

export interface FitOptions {
  engine?: ImageEngine
  pdfEngine?: PdfEngine
  signal?: AbortSignal
  locale?: Locale
  /**
   * Point to keep in frame when cropping, 0–1 on each axis.
   * Pass a face-detection result here. Defaults to the centre.
   */
  focus?: { x: number; y: number }
  /** File name for the output. Extension is fixed to match the format. */
  fileName?: string
  onStep?: (step: string) => void
}
