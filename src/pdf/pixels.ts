/**
 * Pixel helpers for Flate-compressed PDF images: undo PNG/TIFF predictors and
 * expand gray or RGB pixels to the RGBA an image engine expects.
 */

/**
 * Undoes PDF/PNG predictors on decoded Flate data. Only 8 bits per component.
 *
 * - Predictor 1: none
 * - Predictor 2: TIFF horizontal differencing
 * - Predictor 10–15: PNG filters, chosen per row by a leading filter byte
 */
export function unpredict(
  data: Uint8Array,
  predictor: number,
  colors: number,
  columns: number,
): Uint8Array {
  if (predictor <= 1) return data
  const bpp = colors
  const rowBytes = colors * columns

  if (predictor === 2) {
    const out = new Uint8Array(data)
    for (let row = 0; row * rowBytes < out.length; row++) {
      const start = row * rowBytes
      for (let i = start + bpp; i < Math.min(start + rowBytes, out.length); i++) {
        out[i] = (out[i]! + out[i - bpp]!) & 0xff
      }
    }
    return out
  }

  if (predictor < 10) throw new Error(`Unsupported predictor ${predictor}`)
  const rows = Math.floor(data.length / (rowBytes + 1))
  const out = new Uint8Array(rows * rowBytes)
  let prev = new Uint8Array(rowBytes)
  for (let r = 0; r < rows; r++) {
    const filter = data[r * (rowBytes + 1)]!
    const src = data.subarray(r * (rowBytes + 1) + 1, (r + 1) * (rowBytes + 1))
    const cur = out.subarray(r * rowBytes, (r + 1) * rowBytes)
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bpp ? cur[i - bpp]! : 0
      const up = prev[i]!
      const upLeft = i >= bpp ? prev[i - bpp]! : 0
      let value: number
      switch (filter) {
        case 0:
          value = src[i]!
          break
        case 1:
          value = src[i]! + left
          break
        case 2:
          value = src[i]! + up
          break
        case 3:
          value = src[i]! + ((left + up) >> 1)
          break
        case 4: {
          const p = left + up - upLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - up)
          const pc = Math.abs(p - upLeft)
          value = src[i]! + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
          break
        }
        default:
          throw new Error(`Invalid PNG filter type ${filter}`)
      }
      cur[i] = value & 0xff
    }
    prev = cur
  }
  return out
}

/** Expands 1- or 3-channel 8-bit pixels to RGBA. */
export function toRgba(data: Uint8Array, channels: 1 | 3, width: number, height: number) {
  const pixels = width * height
  if (data.length < pixels * channels) {
    throw new Error(`Image data too short: ${data.length} < ${pixels * channels}`)
  }
  const out = new Uint8ClampedArray(pixels * 4)
  for (let p = 0, s = 0, d = 0; p < pixels; p++, d += 4) {
    if (channels === 1) {
      const v = data[s++]!
      out[d] = v
      out[d + 1] = v
      out[d + 2] = v
    } else {
      out[d] = data[s++]!
      out[d + 1] = data[s++]!
      out[d + 2] = data[s++]!
    }
    out[d + 3] = 255
  }
  return out
}
