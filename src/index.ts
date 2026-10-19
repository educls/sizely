/**
 * Entry point for `sizely`: the rule builder plus the lower-level building
 * blocks (inspection, size parsing, geometry, the canvas engine).
 *
 * This file only re-exports. Everything listed here is public API, so
 * removing or renaming anything is a breaking change.
 */

// Rules: build, check and fix
export { sizely, FileRule } from './rules/file-rule'
export { evaluate } from './rules/evaluate'
export { describeSpec } from './rules/describe'
export type { RuleSpec, RuleKind } from './rules/spec'
export { FitError, type FitErrorReason } from './shared/errors'

// Inspection: read a file's real format, dimensions and pages
export { inspect } from './inspect/inspect'
export { sniff } from './inspect/sniff'
export { imageSize } from './inspect/image-size'
export { pdfPageCount } from './inspect/pdf-pages'

// Utilities and engines
export { parseSize, formatSize, lengthToPx, type SizeInput, type LengthInput } from './shared/size'
export { planGeometry } from './fit/geometry'
export { canvasEngine } from './engines/canvas'

export type {
  CheckResult,
  DecodedImage,
  DetectedFormat,
  DrawPlan,
  FileInfo,
  FileKind,
  FitOptions,
  FitResult,
  ImageEngine,
  ImageFormat,
  Issue,
  IssueCode,
  Locale,
  PdfEngine,
} from './shared/types'
