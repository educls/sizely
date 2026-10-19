/**
 * Fixes a PDF that is too large by calling the `pdfEngine` passed to `fit()`,
 * and turns engine failures into end-user `FitError`s.
 */

import { inspect } from '../inspect/inspect'
import { message } from '../i18n/messages'
import { evaluate } from '../rules/evaluate'
import type { RuleSpec } from '../rules/spec'
import { FitError, throwIfAborted } from '../shared/errors'
import { formatSize } from '../shared/size'
import type { FileInfo, FitOptions, FitResult, Issue } from '../shared/types'
import { outputName } from './output-name'

export async function fitPdf(
  file: Blob,
  spec: RuleSpec,
  original: FileInfo,
  issues: Issue[],
  options: FitOptions,
): Promise<FitResult> {
  const locale = options.locale ?? 'en'
  if (issues.some((i) => i.code !== 'too_large')) {
    throw new FitError('not_fixable', issues, original)
  }
  if (!options.pdfEngine) throw new FitError('no_pdf_engine', issues, original)

  const steps: string[] = []
  let blob: Blob
  try {
    blob = await options.pdfEngine.compress(file, {
      targetBytes: spec.maxSize,
      signal: options.signal,
      onStep: (step) => {
        steps.push(step)
        options.onStep?.(step)
      },
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError' || options.signal?.aborted) throw error
    // A missing optional dependency is the developer's to fix, not the end user's.
    if ((error as Error)?.name === 'SizelyDependencyError') throw error
    const code = (error as { issueCode?: unknown })?.issueCode
    const issueCode = code === 'protected' ? 'protected' : 'unreadable'
    const issue: Issue = { code: issueCode, message: message(locale, issueCode) }
    const fitError = new FitError(issueCode === 'protected' ? 'not_fixable' : 'unreadable', [issue], original)
    ;(fitError as { cause?: unknown }).cause = error
    throw fitError
  }
  throwIfAborted(options.signal)
  const out = new File([blob], outputName(file, 'pdf', options.fileName), { type: 'application/pdf' })
  const info = await inspect(out)
  const remaining = evaluate(spec, info, locale)
  if (remaining.length) throw new FitError('gave_up', remaining, original, out)
  if (steps.length === 0) {
    // Engines that don't report progress still get a summary line.
    const summary = `compressed PDF ${formatSize(original.size)} → ${formatSize(out.size)}`
    steps.push(summary)
    options.onStep?.(summary)
  }
  return { file: out, changed: true, original, info, steps }
}
