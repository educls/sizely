/**
 * Decides what sizely/pdf may touch: which images can be recompressed (and
 * why the others are skipped), and whether the document is signed.
 */

import type { PDFDict, PDFDocument, PDFRawStream, PDFRef } from '@cantoo/pdf-lib'
import { lib, N } from './pdf-lib'
import type { Candidate, PdfImageReport } from './types'

function filterName(dict: PDFDict): string | undefined {
  const filter = dict.lookup(N('Filter'))
  if (filter instanceof lib.PDFName) return filter.decodeText()
  if (filter instanceof lib.PDFArray) {
    if (filter.size() === 0) return undefined
    if (filter.size() > 1) return filter.asArray().map((f) => (f instanceof lib.PDFName ? f.decodeText() : '?')).join('+')
    const only = filter.lookup(0)
    return only instanceof lib.PDFName ? only.decodeText() : '?'
  }
  return undefined
}

function decodeParm(dict: PDFDict, key: string): number | undefined {
  let parms = dict.lookup(N('DecodeParms'))
  if (parms instanceof lib.PDFArray) parms = parms.lookup(0)
  if (!(parms instanceof lib.PDFDict)) return undefined
  const value = parms.lookup(N(key))
  return value instanceof lib.PDFNumber ? value.asNumber() : undefined
}

/** Returns the channel count and whether the colour space can be kept, or a skip reason. */
function colorSpaceInfo(dict: PDFDict): { channels: 1 | 3; keep: boolean } | string {
  const cs = dict.lookup(N('ColorSpace'))
  if (cs instanceof lib.PDFName) {
    const name = cs.decodeText()
    if (name === 'DeviceRGB') return { channels: 3, keep: true }
    if (name === 'DeviceGray') return { channels: 1, keep: false }
    return `colour space ${name}`
  }
  if (cs instanceof lib.PDFArray) {
    const family = cs.lookup(0)
    const familyName = family instanceof lib.PDFName ? family.decodeText() : '?'
    if (familyName === 'ICCBased') {
      const profile = cs.lookup(1)
      const n = profile instanceof lib.PDFRawStream ? profile.dict.lookup(N('N')) : undefined
      const channels = n instanceof lib.PDFNumber ? n.asNumber() : 0
      if (channels === 3) return { channels: 3, keep: true }
      if (channels === 1) return { channels: 1, keep: false }
      return `ICC colour space with ${channels} channels`
    }
    if (familyName === 'CalRGB') return { channels: 3, keep: true }
    if (familyName === 'CalGray') return { channels: 1, keep: false }
    return `colour space ${familyName}`
  }
  return 'missing colour space'
}

/** The report every image starts with: dimensions, filter and size, marked skipped. */
export function analyzeReport(ref: PDFRef, stream: PDFRawStream): PdfImageReport {
  const num = (key: string) => {
    const v = stream.dict.lookup(N(key))
    return v instanceof lib.PDFNumber ? v.asNumber() : 0
  }
  return {
    ref: ref.toString(),
    width: num('Width'),
    height: num('Height'),
    filter: filterName(stream.dict) ?? 'none',
    originalBytes: stream.contents.length,
    status: 'skipped',
  }
}

/** True when a Decode array is present and differs from the default [0 1 0 1 …]. */
function hasCustomDecode(dict: PDFDict): boolean {
  const decode = dict.lookup(N('Decode'))
  if (!(decode instanceof lib.PDFArray)) return false
  return decode.asArray().some((v, i) => !(v instanceof lib.PDFNumber) || v.asNumber() !== i % 2)
}

/** Returns a candidate for recompression, or a report saying why the image is skipped. */
export function analyze(ref: PDFRef, stream: PDFRawStream, minImageBytes: number): Candidate | PdfImageReport {
  const { dict } = stream
  const report = analyzeReport(ref, stream)
  const { filter } = report
  const bpc = dict.lookup(N('BitsPerComponent'))
  const skip = (reason: string) => ({ ...report, reason })

  if (dict.lookup(N('ImageMask')) === lib.PDFBool.True) return skip('image mask')
  if (!(bpc instanceof lib.PDFNumber) || bpc.asNumber() !== 8) {
    return skip(`${bpc instanceof lib.PDFNumber ? bpc.asNumber() : '?'} bits per component`)
  }
  if (filter !== 'DCTDecode' && filter !== 'FlateDecode') return skip(`filter ${filter}`)
  if (hasCustomDecode(dict)) return skip('custom Decode array')
  if (dict.lookup(N('Mask')) instanceof lib.PDFArray) return skip('colour-key mask')
  if (!report.width || !report.height) return skip('missing dimensions')
  if (report.originalBytes < minImageBytes) return skip('already small')

  const cs = colorSpaceInfo(dict)
  if (typeof cs === 'string') return skip(cs)

  let predictor = 1
  if (filter === 'FlateDecode') {
    predictor = decodeParm(dict, 'Predictor') ?? 1
    const colors = decodeParm(dict, 'Colors') ?? 1
    const bpc = decodeParm(dict, 'BitsPerComponent') ?? 8
    const columns = decodeParm(dict, 'Columns') ?? 1
    if (predictor > 1 && (colors !== cs.channels || bpc !== 8 || columns !== report.width)) {
      return skip('unusual predictor parameters')
    }
    if (predictor > 2 && predictor < 10) return skip(`predictor ${predictor}`)
  }

  return { ref, stream, report, filter, channels: cs.channels, keepColorSpace: cs.keep, predictor }
}

/** A signature covers the exact bytes, so signed PDFs must never be rewritten. */
export function isSigned(doc: PDFDocument): boolean {
  const acroForm = doc.catalog.lookup(N('AcroForm'))
  if (acroForm instanceof lib.PDFDict) {
    const flags = acroForm.lookup(N('SigFlags'))
    if (flags instanceof lib.PDFNumber && (flags.asNumber() & 1) === 1) return true
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof lib.PDFDict && object.has(N('ByteRange')) && object.has(N('Contents'))) return true
  }
  return false
}
