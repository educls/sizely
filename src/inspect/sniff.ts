/** Detects a file's real format from its first bytes ("magic numbers"). */

import type { DetectedFormat } from '../shared/types'
import { ascii, be32 } from './bytes'

/** Detects the real format from magic bytes. File names and MIME types lie. */
export function sniff(b: Uint8Array): DetectedFormat {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && ascii(b, 1, 3) === 'PNG' && b[0] === 0x89) return 'png'
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'gif'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const boxSize = Math.min(be32(b, 0), b.length)
    const brands: string[] = [ascii(b, 8, 4)]
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(b, i, 4))
    if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif'
    if (brands.some((x) => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1'].includes(x))) {
      return 'heic'
    }
  }
  // The PDF header may legally be preceded by junk within the first 1 KB.
  const head = ascii(b, 0, Math.min(b.length, 1024))
  if (head.includes('%PDF-')) return 'pdf'
  return 'unknown'
}
