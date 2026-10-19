/**
 * Fixes an image: plans the crop/resize, then searches formats, JPEG/WebP
 * quality and, as a last resort, smaller dimensions until the file passes.
 */

import { defaultEngine } from '../engines/canvas'
import { inspect } from '../inspect/inspect'
import { message } from '../i18n/messages'
import { evaluate } from '../rules/evaluate'
import type { RuleSpec } from '../rules/spec'
import { FitError, throwIfAborted } from '../shared/errors'
import { formatName, mimeOf } from '../shared/formats'
import { formatSize } from '../shared/size'
import type {
  DecodedImage,
  DetectedFormat,
  DrawPlan,
  FileInfo,
  FitOptions,
  FitResult,
  ImageEngine,
  ImageFormat,
  Issue,
} from '../shared/types'
import { planGeometry, scalePlan } from './geometry'
import { outputName } from './output-name'

const TOP_QUALITY = 0.92
const SEARCH_STEPS = 6
const MAX_SHRINK_ROUNDS = 8
const ENCODABLE: readonly DetectedFormat[] = ['jpeg', 'png', 'webp']

interface Attempt {
  blob: Blob
  format: ImageFormat
  quality: number
  plan: DrawPlan
}

/** Formats to try, best first. The current format wins when it's allowed. */
export function candidateFormats(spec: RuleSpec, current: DetectedFormat): ImageFormat[] {
  const isEncodable = ENCODABLE.includes(current)
  let list: ImageFormat[]
  if (spec.formats?.length) {
    list = [...spec.formats]
    const i = list.indexOf(current as ImageFormat)
    if (i > 0) list.unshift(...list.splice(i, 1))
  } else if (current === 'png') {
    // PNG has no quality knob; WebP/JPEG usually beat shrinking pixels.
    list = spec.maxSize !== undefined ? ['png', 'webp', 'jpeg'] : ['png']
  } else {
    list = isEncodable ? [current as ImageFormat] : ['jpeg']
  }
  return [...new Set(list)]
}

async function encodeToFit(
  engine: ImageEngine,
  image: DecodedImage,
  basePlan: DrawPlan,
  format: ImageFormat,
  spec: RuleSpec,
  allowShrink: boolean,
  signal?: AbortSignal,
): Promise<{ fit?: Attempt; smallest: Attempt }> {
  const max = spec.maxSize
  let plan = basePlan
  let smallest: Attempt | undefined

  const encode = async (p: DrawPlan, quality: number): Promise<Attempt> => {
    throwIfAborted(signal)
    const blob = await engine.encode(image, p, { format, quality, background: spec.background })
    const attempt = { blob, format, quality, plan: p }
    if (!smallest || blob.size < smallest.blob.size) smallest = attempt
    return attempt
  }
  const fits = (a: Attempt) => max === undefined || a.blob.size <= max

  for (let round = 0; round < (allowShrink ? MAX_SHRINK_ROUNDS : 1); round++) {
    let roundSmallest: Attempt
    if (format === 'png') {
      const a = await encode(plan, 1)
      if (fits(a)) return { fit: a, smallest: smallest! }
      roundSmallest = a
    } else {
      const top = await encode(plan, TOP_QUALITY)
      if (fits(top)) return { fit: top, smallest: smallest! }
      const floor = await encode(plan, spec.minQuality)
      if (fits(floor)) {
        // Highest quality that still fits.
        let lo = spec.minQuality
        let hi = TOP_QUALITY
        let best = floor
        for (let i = 0; i < SEARCH_STEPS; i++) {
          const mid = (lo + hi) / 2
          const a = await encode(plan, mid)
          if (fits(a)) {
            best = a
            lo = mid
          } else {
            hi = mid
          }
        }
        return { fit: best, smallest: smallest! }
      }
      roundSmallest = floor
    }

    if (!allowShrink || max === undefined) break
    // File size scales roughly with pixel count, so shrink by sqrt of the overshoot.
    let factor = Math.min(0.95, Math.max(0.5, Math.sqrt(max / roundSmallest.blob.size) * 0.95))
    const minFactor = Math.max(
      spec.minWidth !== undefined ? spec.minWidth / plan.width : 0,
      spec.minHeight !== undefined ? spec.minHeight / plan.height : 0,
    )
    if (minFactor >= 1) break
    factor = Math.max(factor, minFactor)
    const next = scalePlan(plan, factor)
    if (next.width === plan.width && next.height === plan.height) break
    plan = next
  }
  return { smallest: smallest! }
}

function describeSteps(original: FileInfo, srcW: number, srcH: number, attempt: Attempt) {
  const steps: string[] = []
  const { plan } = attempt
  const cropW = Math.round(plan.sw)
  const cropH = Math.round(plan.sh)
  if (cropW !== srcW || cropH !== srcH) steps.push(`cropped ${srcW}×${srcH} → ${cropW}×${cropH}`)
  const letterboxed = plan.dx > 0.5 || plan.dy > 0.5
  if (letterboxed) steps.push(`fitted inside ${plan.width}×${plan.height} (padded)`)
  const fromW = letterboxed ? Math.round(plan.dw) : cropW
  const fromH = letterboxed ? Math.round(plan.dh) : cropH
  if (!letterboxed && (fromW !== plan.width || fromH !== plan.height)) {
    steps.push(`resized ${fromW}×${fromH} → ${plan.width}×${plan.height}`)
  }
  if (original.format !== attempt.format) {
    steps.push(`converted ${formatName(original.format)} → ${formatName(attempt.format)}`)
  }
  const q = attempt.format === 'png' ? '' : ` at quality ${attempt.quality.toFixed(2)}`
  steps.push(`encoded ${formatName(attempt.format)}${q} (${formatSize(attempt.blob.size)})`)
  return steps
}

export async function fitImage(
  file: Blob,
  spec: RuleSpec,
  original: FileInfo,
  options: FitOptions,
): Promise<FitResult> {
  const locale = options.locale ?? 'en'
  const engine = options.engine ?? defaultEngine()

  let image: DecodedImage
  try {
    image = await engine.decode(file)
  } catch {
    const issue: Issue = { code: 'unreadable', message: message(locale, 'unreadable') }
    throw new FitError('unreadable', [issue], original)
  }

  let chosen: Attempt | undefined
  let smallest: Attempt | undefined
  let lastError: unknown
  try {
    const basePlan = planGeometry(image.width, image.height, spec, options.focus)
    const exact = spec.width !== undefined && spec.height !== undefined
    const formats = candidateFormats(spec, original.format)

    // Pass 1 keeps every pixel; pass 2 may shrink. Changing format or quality
    // is preferred over throwing pixels away.
    passes: for (const allowShrink of exact ? [false] : [false, true]) {
      for (const format of formats) {
        try {
          const result = await encodeToFit(engine, image, basePlan, format, spec, allowShrink, options.signal)
          if (!smallest || result.smallest.blob.size < smallest.blob.size) smallest = result.smallest
          if (result.fit) {
            chosen = result.fit
            break passes
          }
        } catch (error) {
          if ((error as Error)?.name === 'AbortError' || options.signal?.aborted) throw error
          lastError = error // e.g. browser can't encode WebP: try the next format
        }
      }
    }

    const attempt = chosen ?? smallest
    if (!attempt) throw lastError ?? new Error('sizely: no format could be encoded')

    const out = new File([attempt.blob], outputName(file, attempt.format, options.fileName), {
      type: mimeOf(attempt.format),
    })
    const info = await inspect(out)
    const remaining = evaluate(spec, info, locale)
    if (remaining.length) throw new FitError('gave_up', remaining, original, out)

    const steps = describeSteps(original, image.width, image.height, attempt)
    steps.forEach((s) => options.onStep?.(s))
    return { file: out, changed: true, original, info, steps }
  } finally {
    image.close?.()
  }
}
