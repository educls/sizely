/**
 * `FitError`, thrown by `rule.fit()` when a file can't be fixed, and the
 * abort helper used by every long-running step.
 */

import type { FileInfo, Issue } from './types'

export type FitErrorReason =
  /** The problem can't be fixed automatically (e.g. a PDF where an image is expected). */
  | 'not_fixable'
  /** A PDF needs fixing but no `pdfEngine` was passed. */
  | 'no_pdf_engine'
  /** The file couldn't be decoded. */
  | 'unreadable'
  /** sizely tried everything it's allowed to and the rules still fail. */
  | 'gave_up'

export class FitError extends Error {
  override readonly name = 'FitError'

  constructor(
    /** Why fitting stopped, for your code. */
    readonly reason: FitErrorReason,
    /** What is still wrong, with end-user friendly messages. */
    readonly issues: readonly Issue[],
    /** Info about the input file. */
    readonly info: FileInfo,
    /** The closest result sizely managed, if any. */
    readonly bestEffort?: File,
  ) {
    super(issues[0]?.message ?? reason)
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }
}
