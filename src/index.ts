export { sizely, FileRule } from './rules'
export { FitError, type FitErrorReason } from './errors'
export { inspect, sniff, imageSize, pdfPageCount } from './inspect'
export { parseSize, formatSize, lengthToPx, type SizeInput, type LengthInput } from './size'
export { canvasEngine } from './engines/canvas'
export { planGeometry } from './geometry'
export { evaluate, describeSpec, type RuleSpec, type RuleKind } from './spec'
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
} from './types'
