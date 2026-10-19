/** `pdfEngine()`: plugs `compressPdf` into `rule.fit()` as a `PdfEngine`. */

import type { PdfEngine } from '../shared/types'
import { compressPdf } from './compress'
import type { PdfCompressOptions } from './types'

/**
 * A `PdfEngine` for `fit()`:
 *
 * ```ts
 * import { pdfEngine } from 'sizely/pdf'
 * await sizely.pdf().maxSize('2MB').fit(file, { pdfEngine: pdfEngine() })
 * ```
 */
export function pdfEngine(defaults: Omit<PdfCompressOptions, 'targetBytes' | 'signal' | 'onStep'> = {}): PdfEngine {
  return {
    async compress(file, { targetBytes, signal, onStep }) {
      const result = await compressPdf(file, { ...defaults, targetBytes, signal, onStep })
      return result.blob
    },
  }
}
