/** Names the fixed file: keeps the original name and swaps the extension. */

import { extensionOf } from '../shared/formats'
import type { DetectedFormat } from '../shared/types'

/** `photo.HEIC` + `'jpeg'` → `photo.jpg`. Blobs without a name become `file.<ext>`. */
export function outputName(file: Blob, format: DetectedFormat, override?: string) {
  const name = override ?? (typeof File !== 'undefined' && file instanceof File ? file.name : 'file')
  return `${name.replace(/\.[^./\\]+$/, '') || 'file'}.${extensionOf(format)}`
}
