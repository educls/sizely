/**
 * `inspect()`: turns a File or Blob into a `FileInfo` (format, size,
 * dimensions, pages) by reading its bytes. Validation starts here.
 */

import { kindOf, mimeOf } from '../shared/formats'
import type { FileInfo } from '../shared/types'
import { imageSize } from './image-size'
import { pdfPageCount } from './pdf-pages'
import { sniff } from './sniff'

/** Bytes read for images. Enough for headers plus a large EXIF thumbnail. */
const IMAGE_HEAD_BYTES = 512 * 1024

/** Inspects a File or Blob by reading its bytes. */
export async function inspect(file: Blob): Promise<FileInfo> {
  const headBuffer = await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer()
  const head = new Uint8Array(headBuffer)
  const format = sniff(head)
  const kind = kindOf(format)
  const info: FileInfo = {
    kind,
    format,
    mime: format === 'unknown' ? file.type || mimeOf('unknown') : mimeOf(format),
    size: file.size,
  }
  if (kind === 'image') {
    const size = imageSize(head, format)
    if (size) {
      info.width = size.width
      info.height = size.height
    }
  } else if (kind === 'pdf') {
    const all = file.size <= IMAGE_HEAD_BYTES ? head : new Uint8Array(await file.arrayBuffer())
    const pages = pdfPageCount(all)
    if (pages !== undefined) info.pages = pages
  }
  return info
}
