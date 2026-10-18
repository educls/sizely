import { useCallback, useEffect, useRef, useState } from 'react'
import { FitError } from './errors'
import type { FileRule } from './rules'
import type { FitOptions, FitResult, Issue } from './types'

export type FitStatus = 'idle' | 'working' | 'done' | 'error'

export interface UseSizely {
  status: FitStatus
  result: FitResult | null
  /** End-user friendly problems when fitting failed. */
  issues: readonly Issue[]
  error: unknown
  /** Fit a file. Resolves with the result, or null when it failed or was superseded. */
  fit: (file: Blob) => Promise<FitResult | null>
  reset: () => void
}

/**
 * React hook around `rule.fit()`. Cancels the previous run when a new file
 * comes in or the component unmounts.
 *
 * ```tsx
 * const { fit, status, result, issues } = useSizely(rule, { locale: 'pt-BR' })
 * <input type="file" accept={rule.accept()} onChange={(e) => fit(e.target.files![0]!)} />
 * ```
 */
export function useSizely(rule: FileRule, options: Omit<FitOptions, 'signal'> = {}): UseSizely {
  const [status, setStatus] = useState<FitStatus>('idle')
  const [result, setResult] = useState<FitResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const controller = useRef<AbortController | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => () => controller.current?.abort(), [])

  const fit = useCallback(
    async (file: Blob) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      setStatus('working')
      setError(null)
      setResult(null)
      try {
        const res = await rule.fit(file, { ...optionsRef.current, signal: current.signal })
        if (current.signal.aborted) return null
        setResult(res)
        setStatus('done')
        return res
      } catch (err) {
        if (current.signal.aborted) return null
        setError(err)
        setStatus('error')
        return null
      }
    },
    [rule],
  )

  const reset = useCallback(() => {
    controller.current?.abort()
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  const issues = error instanceof FitError ? error.issues : []
  return { status, result, issues, error, fit, reset }
}
