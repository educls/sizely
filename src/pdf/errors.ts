/** `PdfCompressError`: thrown for PDFs that sizely/pdf must not or cannot touch. */

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
