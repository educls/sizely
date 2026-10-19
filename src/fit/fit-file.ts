/**
 * `fitFile()`: the entry point behind `rule.fit()`. Checks the file, returns
 * it untouched when it already passes, and otherwise hands it to the image
 * or PDF fixer.
 */

import { inspect } from '../inspect/inspect'
import { evaluate } from '../rules/evaluate'
import type { RuleSpec } from '../rules/spec'
import { FitError, throwIfAborted } from '../shared/errors'
import type { FitOptions, FitResult } from '../shared/types'
import { fitImage } from './fit-image'
import { fitPdf } from './fit-pdf'
import { outputName } from './output-name'

/** Validates `file` against `spec` and fixes it when possible. */
export async function fitFile(
  file: Blob,
  spec: RuleSpec,
  options: FitOptions = {},
): Promise<FitResult> {
  throwIfAborted(options.signal)
  const locale = options.locale ?? 'en'
  const original = await inspect(file)
  const issues = evaluate(spec, original, locale)

  if (issues.length === 0) {
    const asFile =
      typeof File !== 'undefined' && file instanceof File
        ? file
        : new File([file], outputName(file, original.format, options.fileName), { type: original.mime })
    return { file: asFile, changed: false, original, info: original, steps: [] }
  }

  if (issues.some((i) => i.code === 'wrong_type')) throw new FitError('not_fixable', issues, original)
  if (original.kind === 'pdf') return fitPdf(file, spec, original, issues, options)
  if (original.kind === 'image') return fitImage(file, spec, original, options)
  throw new FitError('not_fixable', issues, original)
}
