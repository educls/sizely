import { formatSize } from 'sizely'
import { useEffect, useState } from 'react'

interface Props {
  size: number
  limit?: number
  /** Bytes represented by the full width of the bar, shared by both meters. */
  scale: number
  /** Animate the fill in from this size (the original file's). */
  from?: number
  label: string
}

const FLOOR = 1024 // the bar starts at 1 KB

/**
 * File size against the rule's limit, on a log scale: a 5 MB photo and a
 * 100 KB limit are 50× apart, which a linear bar can't show.
 */
export function SizeMeter({ size, limit, scale, from, label }: Props) {
  const pct = (bytes: number) =>
    Math.min(100, Math.max(1.5, (Math.log(Math.max(bytes, FLOOR) / FLOOR) / Math.log(scale / FLOOR)) * 100))
  const [shown, setShown] = useState(from ?? size)

  useEffect(() => {
    if (from === undefined) {
      setShown(size)
      return
    }
    setShown(from)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(size)))
    return () => cancelAnimationFrame(id)
  }, [size, from])

  const over = limit !== undefined && size > limit
  return (
    <div className="meter" data-over={over || undefined}>
      <div className="meter-head">
        <strong>
          {label} {formatSize(size)}
        </strong>
        {limit !== undefined && <span>limit {formatSize(limit)}</span>}
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={`${label}: ${formatSize(size)}${limit ? ` of ${formatSize(limit)} allowed` : ''}`}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={size}
      >
        <div className="meter-fill" style={{ width: `${pct(shown)}%` }} />
        {limit !== undefined && (
          <div className="meter-limit" style={{ left: `${pct(limit)}%` }} />
        )}
      </div>
    </div>
  )
}
