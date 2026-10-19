/** Counts PDF pages by scanning the raw text, without a PDF library. */

/**
 * Best-effort PDF page count. Reads the page tree's /Count. Returns
 * undefined for PDFs whose objects are hidden in compressed object streams.
 */
export function pdfPageCount(b: Uint8Array): number | undefined {
  const text = new TextDecoder('latin1').decode(b)
  let best: number | undefined
  const counts = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g
  for (const match of text.matchAll(counts)) {
    const n = Number(match[1] ?? match[2])
    if (best === undefined || n > best) best = n
  }
  if (best !== undefined) return best
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)
  return pages ? pages.length : undefined
}
