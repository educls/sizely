/** `describeSpec()`: a one-line summary of a rule, for hints under an upload field. */

import { dimsText, sizeText, word } from '../i18n/messages'
import { formatName } from '../shared/formats'
import type { Locale } from '../shared/types'
import type { RuleSpec } from './spec'

/** Short human summary of a spec, e.g. `JPEG · up to 500 KB · 600×800 px`. */
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
      parts.push(`${word(locale, 'upTo')} ${dimsText(spec.maxWidth, spec.maxHeight)} px`)
    }
    if (spec.minWidth !== undefined || spec.minHeight !== undefined) {
      parts.push(`${word(locale, 'atLeast')} ${dimsText(spec.minWidth, spec.minHeight)} px`)
    }
    if (spec.aspect) parts.push(spec.aspect.label)
  }
  if (spec.maxPages !== undefined) parts.push(`${word(locale, 'upTo')} ${spec.maxPages} ${word(locale, 'pages')}`)
  return parts.join(' · ')
}
