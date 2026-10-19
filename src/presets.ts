/** Entry point for `sizely/presets`: ready-made rules for common uploads. */

import { sizely, type FileRule } from './rules/file-rule'
import type { SizeInput } from './shared/size'

/**
 * Generic, ready-made rules. They are starting points, not official specs:
 * extend them with the exact limits of the portal you target, e.g.
 * `presets.photo.size35x45().maxSize('300KB')`.
 *
 * Country- and portal-specific presets (passports, visas, exams, government
 * portals) are welcome as contributions, each one linking its official source.
 */
export const presets = {
  photo: {
    /** 35×45 mm at 300 dpi (413×531 px), the most common passport/visa photo size. */
    size35x45: (): FileRule => sizely.image().format('jpeg').printSize(35, 45),
    /** 30×40 mm at 300 dpi (354×472 px), the "3×4" photo common in Brazil and Portugal. */
    size3x4: (): FileRule => sizely.image().format('jpeg').printSize(30, 40),
    /** 2×2 in at 300 dpi (600×600 px), the US-style square photo. */
    square2in: (): FileRule => sizely.image().format('jpeg').printSize('2in', '2in'),
  },
  web: {
    /** Square avatar, 512×512, WebP with JPEG fallback, up to 200 KB. */
    avatar: (): FileRule =>
      sizely.image().format('webp', 'jpeg').dimensions(512, 512).maxSize('200KB'),
    /** Social share image (Open Graph / Twitter card), 1200×630. */
    openGraph: (): FileRule =>
      sizely.image().format('jpeg', 'png').dimensions(1200, 630).maxSize('1MB'),
    /** Upload-friendly photo: long side up to 2048 px, up to 1 MB. */
    photo: (): FileRule =>
      sizely.image().format('webp', 'jpeg').maxDimensions(2048, 2048).maxSize('1MB'),
  },
  document: {
    /** A PDF up to `maxSize` (default 2 MB). Fixing needs a `pdfEngine`. */
    pdf: (maxSize: SizeInput = '2MB'): FileRule => sizely.pdf().maxSize(maxSize),
  },
} as const
