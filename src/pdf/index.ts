import type { PDFDict, PDFDocument, PDFRawStream, PDFRef } from '@cantoo/pdf-lib'
import { defaultEngine } from '../engines/canvas'
import { throwIfAborted } from '../errors'
import { formatSize } from '../size'
import type { DecodedImage, DrawPlan, ImageEngine, PdfEngine } from '../types'
import { toRgba, unpredict } from './pixels'

export type PdfCompressErrorCode = 'protected' | 'unreadable'

/** Thrown for PDFs sizely/pdf must not or cannot touch. */
export class PdfCompressError extends Error {
  override readonly name = 'PdfCompressError'
  /** Read by `fit()` to produce an end-user message. */
  readonly issueCode: PdfCompressErrorCode

  constructor(code: PdfCompressErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.issueCode = code
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause
  }
}

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

interface Candidate {
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

interface Encoded {
  bytes: Uint8Array
  width: number
  height: number
}

type PdfLib = typeof import('@cantoo/pdf-lib')

const MISSING_PDF_LIB = 'sizely/pdf needs @cantoo/pdf-lib. Install it with: npm install @cantoo/pdf-lib'

/** Set by `loadPdfLib()`; every helper below runs after `compressPdf` has awaited it. */
let lib: PdfLib
let loading: Promise<PdfLib> | undefined

/**
 * `@cantoo/pdf-lib` is an optional peer dependency, so it's loaded on first
 * use: importing sizely/pdf never fails, and a missing install gets a clear
 * message instead of a raw module-not-found error.
 */
function loadPdfLib(): Promise<PdfLib> {
  loading ??= import('@cantoo/pdf-lib').then(
    (mod) => (lib = mod),
    (cause: unknown) => {
      loading = undefined
      const error = new Error(MISSING_PDF_LIB)
      error.name = 'SizelyDependencyError'
      ;(error as { cause?: unknown }).cause = cause
      throw error
    },
  )
  return loading
}

const N = (name: string) => lib.PDFName.of(name)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const SEARCH_STEPS = 5
const MAX_SHRINK_ROUNDS = 8

function filterName(dict: PDFDict): string | undefined {
  const filter = dict.lookup(N('Filter'))
  if (filter instanceof lib.PDFName) return filter.decodeText()
  if (filter instanceof lib.PDFArray) {
    if (filter.size() === 0) return undefined
    if (filter.size() > 1) return filter.asArray().map((f) => (f instanceof lib.PDFName ? f.decodeText() : '?')).join('+')
    const only = filter.lookup(0)
    return only instanceof lib.PDFName ? only.decodeText() : '?'
  }
  return undefined
}

function decodeParm(dict: PDFDict, key: string): number | undefined {
  let parms = dict.lookup(N('DecodeParms'))
  if (parms instanceof lib.PDFArray) parms = parms.lookup(0)
  if (!(parms instanceof lib.PDFDict)) return undefined
  const value = parms.lookup(N(key))
  return value instanceof lib.PDFNumber ? value.asNumber() : undefined
}

/** Returns the channel count and whether the colour space can be kept, or a skip reason. */
function colorSpaceInfo(dict: PDFDict): { channels: 1 | 3; keep: boolean } | string {
  const cs = dict.lookup(N('ColorSpace'))
  if (cs instanceof lib.PDFName) {
    const name = cs.decodeText()
    if (name === 'DeviceRGB') return { channels: 3, keep: true }
    if (name === 'DeviceGray') return { channels: 1, keep: false }
    return `colour space ${name}`
  }
  if (cs instanceof lib.PDFArray) {
    const family = cs.lookup(0)
    const familyName = family instanceof lib.PDFName ? family.decodeText() : '?'
    if (familyName === 'ICCBased') {
      const profile = cs.lookup(1)
      const n = profile instanceof lib.PDFRawStream ? profile.dict.lookup(N('N')) : undefined
      const channels = n instanceof lib.PDFNumber ? n.asNumber() : 0
      if (channels === 3) return { channels: 3, keep: true }
      if (channels === 1) return { channels: 1, keep: false }
      return `ICC colour space with ${channels} channels`
    }
    if (familyName === 'CalRGB') return { channels: 3, keep: true }
    if (familyName === 'CalGray') return { channels: 1, keep: false }
    return `colour space ${familyName}`
  }
  return 'missing colour space'
}

function analyzeReport(ref: PDFRef, stream: PDFRawStream): PdfImageReport {
  const num = (key: string) => {
    const v = stream.dict.lookup(N(key))
    return v instanceof lib.PDFNumber ? v.asNumber() : 0
  }
  return {
    ref: ref.toString(),
    width: num('Width'),
    height: num('Height'),
    filter: filterName(stream.dict) ?? 'none',
    originalBytes: stream.contents.length,
    status: 'skipped',
  }
}

/** True when a Decode array is present and differs from the default [0 1 0 1 …]. */
function hasCustomDecode(dict: PDFDict): boolean {
  const decode = dict.lookup(N('Decode'))
  if (!(decode instanceof lib.PDFArray)) return false
  return decode.asArray().some((v, i) => !(v instanceof lib.PDFNumber) || v.asNumber() !== i % 2)
}

function analyze(ref: PDFRef, stream: PDFRawStream, minImageBytes: number): Candidate | PdfImageReport {
  const { dict } = stream
  const report = analyzeReport(ref, stream)
  const { filter } = report
  const bpc = dict.lookup(N('BitsPerComponent'))
  const skip = (reason: string) => ({ ...report, reason })

  if (dict.lookup(N('ImageMask')) === lib.PDFBool.True) return skip('image mask')
  if (!(bpc instanceof lib.PDFNumber) || bpc.asNumber() !== 8) {
    return skip(`${bpc instanceof lib.PDFNumber ? bpc.asNumber() : '?'} bits per component`)
  }
  if (filter !== 'DCTDecode' && filter !== 'FlateDecode') return skip(`filter ${filter}`)
  if (hasCustomDecode(dict)) return skip('custom Decode array')
  if (dict.lookup(N('Mask')) instanceof lib.PDFArray) return skip('colour-key mask')
  if (!report.width || !report.height) return skip('missing dimensions')
  if (report.originalBytes < minImageBytes) return skip('already small')

  const cs = colorSpaceInfo(dict)
  if (typeof cs === 'string') return skip(cs)

  let predictor = 1
  if (filter === 'FlateDecode') {
    predictor = decodeParm(dict, 'Predictor') ?? 1
    const colors = decodeParm(dict, 'Colors') ?? 1
    const bpc = decodeParm(dict, 'BitsPerComponent') ?? 8
    const columns = decodeParm(dict, 'Columns') ?? 1
    if (predictor > 1 && (colors !== cs.channels || bpc !== 8 || columns !== report.width)) {
      return skip('unusual predictor parameters')
    }
    if (predictor > 2 && predictor < 10) return skip(`predictor ${predictor}`)
  }

  return { ref, stream, report, filter, channels: cs.channels, keepColorSpace: cs.keep, predictor }
}

function isSigned(doc: PDFDocument): boolean {
  const acroForm = doc.catalog.lookup(N('AcroForm'))
  if (acroForm instanceof lib.PDFDict) {
    const flags = acroForm.lookup(N('SigFlags'))
    if (flags instanceof lib.PDFNumber && (flags.asNumber() & 1) === 1) return true
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof lib.PDFDict && object.has(N('ByteRange')) && object.has(N('Contents'))) return true
  }
  return false
}

async function decodeCandidate(c: Candidate, engine: ImageEngine): Promise<DecodedImage> {
  if (c.filter === 'DCTDecode') {
    const blob = new Blob([c.stream.contents as BlobPart], { type: 'image/jpeg' })
    // PDF viewers ignore EXIF orientation inside embedded JPEGs, so must we.
    return engine.decode(blob, { applyOrientation: false })
  }
  if (!engine.fromPixels) throw new Error('engine cannot wrap raw pixels')
  const raw = lib.decodePDFRawStream(c.stream).decode()
  const pixels = unpredict(raw, c.predictor, c.channels, c.report.width)
  return engine.fromPixels(toRgba(pixels, c.channels, c.report.width, c.report.height), c.report.width, c.report.height)
}

/** Smallest scale allowed for an image so its long side stays ≥ minLongSide. */
const imageFloor = (c: Candidate, minLongSide: number) =>
  Math.min(1, minLongSide / Math.max(c.report.width, c.report.height))

function scaledSize(c: Candidate, scale: number, minLongSide: number) {
  const s = Math.min(1, Math.max(scale, imageFloor(c, minLongSide)))
  return {
    width: Math.max(1, Math.round(c.report.width * s)),
    height: Math.max(1, Math.round(c.report.height * s)),
  }
}

/**
 * Shrinks a PDF by recompressing the images inside it, which is where the
 * weight of scanned documents lives. Text stays selectable; fonts and vector
 * content are untouched. Pure TypeScript, MIT licensed, runs in the browser.
 */
export async function compressPdf(file: Blob, options: PdfCompressOptions = {}): Promise<PdfCompressResult> {
  const maxQuality = options.maxQuality ?? 0.85
  const minQuality = options.minQuality ?? 0.4
  const defaultQuality = options.defaultQuality ?? 0.75
  const minLongSide = options.minLongSide ?? 1000
  const minImageBytes = options.minImageBytes ?? 8 * 1024
  const { signal, targetBytes } = options
  const step = (s: string) => options.onStep?.(s)

  throwIfAborted(signal)
  await loadPdfLib()
  const bytes = new Uint8Array(await file.arrayBuffer())
  let doc: PDFDocument
  let signed: boolean
  try {
    doc = await lib.PDFDocument.load(bytes, { updateMetadata: false })
    doc.getPageCount() // forces the page tree to resolve, so junk fails here
    signed = isSigned(doc)
  } catch (error) {
    if (error instanceof lib.EncryptedPDFError) {
      throw new PdfCompressError('protected', 'PDF is encrypted', { cause: error })
    }
    throw new PdfCompressError('unreadable', 'PDF could not be parsed', { cause: error })
  }
  if (signed) throw new PdfCompressError('protected', 'PDF is digitally signed')

  const reports: PdfImageReport[] = []
  const candidates: Candidate[] = []
  const images = doc.context
    .enumerateIndirectObjects()
    .filter((entry): entry is [PDFRef, PDFRawStream] =>
      entry[1] instanceof lib.PDFRawStream && entry[1].dict.lookup(N('Subtype')) === N('Image'),
    )
  // Soft masks and stencil masks must stay single-channel; a canvas can only
  // write RGB JPEGs, so they're left alone.
  const masks = new Set<string>()
  for (const [, stream] of images) {
    for (const key of ['SMask', 'Mask']) {
      const value = stream.dict.get(N(key))
      if (value instanceof lib.PDFRef) masks.add(value.toString())
    }
  }
  for (const [ref, object] of images) {
    const result = masks.has(ref.toString())
      ? { ...analyzeReport(ref, object), reason: 'used as a mask' }
      : analyze(ref, object, minImageBytes)
    if ('stream' in result) {
      candidates.push(result)
      reports.push(result.report)
    } else {
      reports.push(result)
    }
  }

  const original = (): PdfCompressResult => ({
    blob: file,
    originalSize: file.size,
    size: file.size,
    metTarget: targetBytes === undefined ? null : file.size <= targetBytes,
    images: reports,
    settings: null,
  })
  if (candidates.length === 0) {
    step(`found ${plural(reports.length, 'image')}, 0 recompressible`)
    return original()
  }
  // Resolved only now, so PDFs without images work anywhere, even in Node.
  const engine = options.engine ?? defaultEngine()

  try {
    for (const c of candidates) {
      throwIfAborted(signal)
      try {
        c.image = await decodeCandidate(c, engine)
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error
        c.report.reason = `could not decode: ${(error as Error)?.message ?? error}`
      }
    }
    const usable = candidates.filter((c) => c.image)
    step(`found ${plural(reports.length, 'image')}, ${usable.length} recompressible`)
    if (usable.length === 0) return original()

    // Everything that isn't a recompressible image stays the same size, so one
    // save tells us the fixed overhead and every estimate after that is exact.
    const baseline = await doc.save({ useObjectStreams: true, updateFieldAppearances: false })
    const overhead = baseline.length - usable.reduce((sum, c) => sum + c.stream.contents.length, 0)

    const cache = new Map<string, Encoded>()
    const encodeOne = async (c: Candidate, scale: number, quality: number): Promise<Encoded> => {
      const size = scaledSize(c, scale, minLongSide)
      const key = `${c.report.ref}|${size.width}x${size.height}|${quality.toFixed(4)}`
      const hit = cache.get(key)
      if (hit) return hit
      throwIfAborted(signal)
      const { width: w, height: h } = c.report
      const plan: DrawPlan = { width: size.width, height: size.height, sx: 0, sy: 0, sw: w, sh: h, dx: 0, dy: 0, dw: size.width, dh: size.height }
      const blob = await engine.encode(c.image!, plan, { format: 'jpeg', quality, background: '#ffffff' })
      const encoded = { bytes: new Uint8Array(await blob.arrayBuffer()), width: size.width, height: size.height }
      cache.set(key, encoded)
      return encoded
    }

    /** Encodes every image at one setting. An image is only replaced if it gets smaller. */
    const pass = async (scale: number, quality: number) => {
      const chosen: (Encoded | null)[] = []
      let total = overhead
      for (const c of usable) {
        const encoded = await encodeOne(c, scale, quality)
        const better = encoded.bytes.length < c.stream.contents.length
        chosen.push(better ? encoded : null)
        total += better ? encoded.bytes.length : c.stream.contents.length
      }
      return { scale, quality, chosen, total }
    }
    type Pass = Awaited<ReturnType<typeof pass>>

    let best: Pass
    if (targetBytes === undefined) {
      best = await pass(1, defaultQuality)
    } else {
      const fits = (p: Pass) => p.total <= targetBytes
      const floorScale = Math.min(...usable.map((c) => imageFloor(c, minLongSide)))
      let scale = 1
      let found: Pass | undefined
      let smallest: Pass | undefined
      for (let round = 0; round < MAX_SHRINK_ROUNDS && !found; round++) {
        const top = await pass(scale, maxQuality)
        if (fits(top)) {
          found = top
          break
        }
        const floor = await pass(scale, minQuality)
        if (!smallest || floor.total < smallest.total) smallest = floor
        if (fits(floor)) {
          let lo = minQuality
          let hi = maxQuality
          found = floor
          for (let i = 0; i < SEARCH_STEPS; i++) {
            const mid = (lo + hi) / 2
            const p = await pass(scale, mid)
            if (fits(p)) {
              found = p
              lo = mid
            } else {
              hi = mid
            }
          }
          break
        }
        // Below the smallest per-image floor, nothing changes any more.
        if (scale <= floorScale) break
        const imageBudget = targetBytes - overhead
        const imageTotal = floor.total - overhead
        const factor =
          imageBudget <= 0 ? 0.5 : Math.min(0.95, Math.max(0.5, Math.sqrt(imageBudget / imageTotal) * 0.95))
        scale = Math.max(scale * factor, floorScale)
      }
      best = found ?? smallest!
    }

    if (best.chosen.every((e) => e === null)) {
      usable.forEach((c) => {
        c.report.status = 'kept'
        c.report.reason = 'recompressing would not make it smaller'
      })
      return original()
    }

    usable.forEach((c, i) => {
      const encoded = best.chosen[i]
      if (!encoded) {
        c.report.status = 'kept'
        c.report.reason = 'recompressing would not make it smaller'
        return
      }
      const dict = c.stream.dict.clone(doc.context)
      dict.delete(N('DecodeParms'))
      dict.delete(N('Length'))
      dict.set(N('Filter'), N('DCTDecode'))
      dict.set(N('Width'), lib.PDFNumber.of(encoded.width))
      dict.set(N('Height'), lib.PDFNumber.of(encoded.height))
      dict.set(N('BitsPerComponent'), lib.PDFNumber.of(8))
      if (!c.keepColorSpace) dict.set(N('ColorSpace'), N('DeviceRGB'))
      doc.context.assign(c.ref, lib.PDFRawStream.of(dict, encoded.bytes))
      Object.assign(c.report, {
        status: 'recompressed',
        newBytes: encoded.bytes.length,
        newWidth: encoded.width,
        newHeight: encoded.height,
      })
    })

    throwIfAborted(signal)
    const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false })
    if (out.length >= file.size) return original()

    const recompressed = reports.filter((r) => r.status === 'recompressed').length
    const scaleNote = best.scale < 1 ? `, images scaled to ≤${Math.round(best.scale * 100)}%` : ''
    step(`recompressed ${plural(recompressed, 'image')} at JPEG quality ${best.quality.toFixed(2)}${scaleNote}`)
    step(`saved ${formatSize(file.size)} → ${formatSize(out.length)}`)
    return {
      blob: new Blob([out as BlobPart], { type: 'application/pdf' }),
      originalSize: file.size,
      size: out.length,
      metTarget: targetBytes === undefined ? null : out.length <= targetBytes,
      images: reports,
      settings: { quality: best.quality, scale: best.scale },
    }
  } finally {
    candidates.forEach((c) => c.image?.close?.())
  }
}

/**
 * A `PdfEngine` for `fit()`:
 *
 * ```ts
 * import { pdfEngine } from 'sizely/pdf'
 * await sizely.pdf().maxSize('2MB').fit(file, { pdfEngine: pdfEngine() })
 * ```
 */
export function pdfEngine(defaults: Omit<PdfCompressOptions, 'targetBytes' | 'signal' | 'onStep'> = {}): PdfEngine {
  return {
    async compress(file, { targetBytes, signal, onStep }) {
      const result = await compressPdf(file, { ...defaults, targetBytes, signal, onStep })
      return result.blob
    },
  }
}
