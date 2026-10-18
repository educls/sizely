import type { ReactNode } from 'react'

interface Props {
  width?: number
  height?: number
  /** Marks a side red when it doesn't match the rule. */
  widthOk?: boolean
  heightOk?: boolean
  children: ReactNode
}

/**
 * Draws technical-drawing dimension lines around its content: the width
 * across the top, the height down the left side.
 */
export function Dimensioned({ width, height, widthOk = true, heightOk = true, children }: Props) {
  // PDFs have pages, not pixel dimensions.
  if (width === undefined && height === undefined) return <div className="dim-plain">{children}</div>
  return (
    <div className="dim">
      <div className="dim-x" data-bad={!widthOk || undefined} aria-hidden={width === undefined}>
        {width !== undefined && <span>{width.toLocaleString('en')} px</span>}
      </div>
      <div className="dim-y" data-bad={!heightOk || undefined} aria-hidden={height === undefined}>
        {height !== undefined && <span>{height.toLocaleString('en')} px</span>}
      </div>
      <div className="dim-body">{children}</div>
    </div>
  )
}
