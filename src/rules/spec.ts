/**
 * `RuleSpec`: the plain-data form of a rule. `FileRule` builds it, `evaluate()`
 * checks files against it, and `fit()` uses it to fix them.
 */

import type { ImageFormat } from '../shared/types'

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
