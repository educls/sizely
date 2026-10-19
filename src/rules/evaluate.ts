/**
 * `evaluate()`: compares a file's info with a rule and lists what's wrong,
 * with end-user messages. Pure and synchronous; it never changes the file.
 */

import { aspectMatches } from '../fit/geometry'
import { dimsText, message, sizeText, word } from '../i18n/messages'
import { formatName } from '../shared/formats'
import type { DetectedFormat, FileInfo, ImageFormat, Issue, Locale } from '../shared/types'
import type { RuleSpec } from './spec'

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
    const received = dimsText(width, height)
    if (spec.width !== undefined && spec.height !== undefined) {
      if (width !== spec.width || height !== spec.height) {
        push('wrong_dimensions', { expected: dimsText(spec.width, spec.height), received })
      }
    } else {
      if (
        (spec.maxWidth !== undefined && width > spec.maxWidth) ||
        (spec.maxHeight !== undefined && height > spec.maxHeight)
      ) {
        push('dimensions_too_large', { expected: dimsText(spec.maxWidth, spec.maxHeight), received })
      }
      if (
        (spec.minWidth !== undefined && width < spec.minWidth) ||
        (spec.minHeight !== undefined && height < spec.minHeight)
      ) {
        push('dimensions_too_small', { expected: dimsText(spec.minWidth, spec.minHeight), received })
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
