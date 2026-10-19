/**
 * Parsing and formatting of file sizes (`'2MB'`) and print lengths (`'35mm'`).
 *
 * All size units are binary (1 KB = 1024 bytes), which is the safer
 * reading of portal limits like "up to 2 MB": a file that fits the binary
 * limit also fits the decimal one.
 */

export type SizeInput = number | string

const UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
}

/** Parses `500`, `"500KB"`, `"2 MB"`, `"1.5mb"`, `"300KiB"` into bytes. */
export function parseSize(input: SizeInput): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      throw new RangeError(`Invalid size: ${input}`)
    }
    return Math.floor(input)
  }
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)\s*$/i.exec(input)
  if (!match) throw new TypeError(`Invalid size: "${input}"`)
  const value = Number.parseFloat(match[1]!.replace(',', '.'))
  const unit = (match[2] || 'b').toLowerCase().replace(/ib$/, 'b')
  const multiplier = UNITS[unit]
  if (multiplier === undefined) throw new TypeError(`Unknown size unit: "${match[2]}"`)
  return Math.floor(value * multiplier)
}

/** Human-readable size, e.g. `482 KB`, `1.4 MB`. */
export function formatSize(bytes: number, locale = 'en'): string {
  const fmt = (n: number, digits: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: digits })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${fmt(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB`
  if (bytes < 1024 ** 3) return `${fmt(bytes / 1024 ** 2, 1)} MB`
  return `${fmt(bytes / 1024 ** 3, 1)} GB`
}

export type LengthInput = number | string

/**
 * Converts a print length to pixels. Numbers are millimetres.
 * Accepts `"35mm"`, `"3.5cm"`, `"2in"`.
 */
export function lengthToPx(length: LengthInput, dpi: number): number {
  let mm: number
  if (typeof length === 'number') {
    mm = length
  } else {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|in)?\s*$/i.exec(length)
    if (!match) throw new TypeError(`Invalid length: "${length}"`)
    const value = Number.parseFloat(match[1]!.replace(',', '.'))
    const unit = (match[2] || 'mm').toLowerCase()
    mm = unit === 'cm' ? value * 10 : unit === 'in' ? value * 25.4 : value
  }
  return Math.round((mm / 25.4) * dpi)
}
