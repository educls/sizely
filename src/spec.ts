import { aspectMatches } from './geometry'
import { formatName, message, sizeText, word } from './messages'
import type { DetectedFormat, FileInfo, ImageFormat, Issue, Locale } from './types'

export type RuleKind = 'image' | 'pdf' | 'any'

/** Plain-data description of a rule. Serializable, so presets can live in JSON. */
export interface RuleSpec {
  kind: RuleKind
  /** Allowed image formats, in order of preference for output. */
  formats?: ImageFormat[]
  maxSize?: number
  minSize?: number
  width?: number
  height?: number
  maxWidth?: number
  maxHeight?: number
  minWidth?: number
  minHeight?: number
  aspect?: { ratio: number; tolerance: number; label: string }
  maxPages?: number
  /** `cover` crops to the target shape, `contain` letterboxes. */
  fitMode: 'cover' | 'contain'
  /** Fill for letterboxing and for transparency in JPEG output. */
  background: string
  /** Lowest JPEG/WebP quality sizely may use before shrinking pixels. */
  minQuality: number
}

export const DEFAULT_SPEC: RuleSpec = {
  kind: 'any',
  fitMode: 'cover',
  background: '#ffffff',
  minQuality: 0.5,
}

const dims = (w?: number, h?: number) => `${w ?? '∞'}×${h ?? '∞'}`
const ratioText = (w: number, h: number) => (w / h).toFixed(2)

/** Checks a file's info against a spec. Pure and synchronous. */
export function evaluate(spec: RuleSpec, info: FileInfo, locale: Locale = 'en'): Issue[] {
  const issues: Issue[] = []
  const push = (code: Issue['code'], params: Record<string, string | number> = {}) =>
    issues.push({ code, message: message(locale, code, params) })

  if (spec.kind === 'image' && info.kind !== 'image') {
    push('wrong_type', { expected: 'image' })
    return issues
  }
  if (spec.kind === 'pdf' && info.kind !== 'pdf') {
    push('wrong_type', { expected: 'pdf' })
    return issues
  }

  if (spec.formats?.length && info.kind === 'image') {
    if (!spec.formats.includes(info.format as ImageFormat)) {
      push('wrong_format', {
        expected: spec.formats.map(formatName).join(word(locale, 'or')),
        received: formatName(info.format as DetectedFormat),
      })
    }
  }

  if (spec.maxSize !== undefined && info.size > spec.maxSize) {
    push('too_large', {
      expected: sizeText(spec.maxSize, locale),
      received: sizeText(info.size, locale),
    })
  }
  if (spec.minSize !== undefined && info.size < spec.minSize) {
    push('too_small', {
      expected: sizeText(spec.minSize, locale),
      received: sizeText(info.size, locale),
    })
  }

  if (info.kind === 'image') {
    const { width, height } = info
    const hasGeometryRules =
      spec.width !== undefined ||
      spec.maxWidth !== undefined ||
      spec.maxHeight !== undefined ||
      spec.minWidth !== undefined ||
      spec.minHeight !== undefined ||
      spec.aspect !== undefined
    if (width === undefined || height === undefined) {
      if (hasGeometryRules) push('unreadable')
      return issues
    }
    const received = dims(width, height)
    if (spec.width !== undefined && spec.height !== undefined) {
      if (width !== spec.width || height !== spec.height) {
        push('wrong_dimensions', { expected: dims(spec.width, spec.height), received })
      }
    } else {
      if (
        (spec.maxWidth !== undefined && width > spec.maxWidth) ||
        (spec.maxHeight !== undefined && height > spec.maxHeight)
      ) {
        push('dimensions_too_large', { expected: dims(spec.maxWidth, spec.maxHeight), received })
      }
      if (
        (spec.minWidth !== undefined && width < spec.minWidth) ||
        (spec.minHeight !== undefined && height < spec.minHeight)
      ) {
        push('dimensions_too_small', { expected: dims(spec.minWidth, spec.minHeight), received })
      }
      if (
        spec.aspect &&
        !aspectMatches(width, height, spec.aspect.ratio, spec.aspect.tolerance)
      ) {
        push('wrong_aspect_ratio', { expected: spec.aspect.label, received: ratioText(width, height) })
      }
    }
  }

  if (info.kind === 'pdf' && spec.maxPages !== undefined && info.pages !== undefined) {
    if (info.pages > spec.maxPages) {
      push('too_many_pages', { expected: spec.maxPages, received: info.pages })
    }
  }

  return issues
}

/** Short human summary of a spec, for hints under an upload field. */
export function describeSpec(spec: RuleSpec, locale: Locale = 'en'): string {
  const parts: string[] = []
  if (spec.kind === 'pdf') parts.push('PDF')
  else if (spec.formats?.length) parts.push(spec.formats.map(formatName).join(word(locale, 'or')))
  else parts.push(word(locale, spec.kind === 'image' ? 'image' : 'any'))
  if (spec.maxSize !== undefined) parts.push(`${word(locale, 'upTo')} ${sizeText(spec.maxSize, locale)}`)
  if (spec.width !== undefined && spec.height !== undefined) {
    parts.push(`${spec.width}×${spec.height} px`)
  } else {
    if (spec.maxWidth !== undefined || spec.maxHeight !== undefined) {
      parts.push(`${word(locale, 'upTo')} ${dims(spec.maxWidth, spec.maxHeight)} px`)
    }
    if (spec.minWidth !== undefined || spec.minHeight !== undefined) {
      parts.push(`${word(locale, 'atLeast')} ${dims(spec.minWidth, spec.minHeight)} px`)
    }
    if (spec.aspect) parts.push(spec.aspect.label)
  }
  if (spec.maxPages !== undefined) parts.push(`${word(locale, 'upTo')} ${spec.maxPages} ${word(locale, 'pages')}`)
  return parts.join(' · ')
}
