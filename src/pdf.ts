/**
 * Entry point for `sizely/pdf`: PDF compression, usable on its own
 * (`compressPdf`) or as the `pdfEngine` for `rule.fit()`.
 *
 * Needs the optional peer dependency `@cantoo/pdf-lib`, loaded on first use.
 * The implementation lives in `./pdf/`.
 */

export { compressPdf } from './pdf/compress'
export { pdfEngine } from './pdf/engine'
export { PdfCompressError, type PdfCompressErrorCode } from './pdf/errors'
export type {
  PdfCompressOptions,
  PdfCompressResult,
  PdfImageReport,
  PdfImageStatus,
} from './pdf/types'
