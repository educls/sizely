import { describe, expect, it } from 'vitest'
import { imageSize, inspect, pdfPageCount, sniff } from '../src/inspect'
import { makeJpeg, makePdf, makePng, makeWebp, toFile } from './helpers'

const enc = (s: string) => new TextEncoder().encode(s)

describe('sniff', () => {
  it('detects formats from bytes, not names', () => {
    expect(sniff(makeJpeg(10, 10))).toBe('jpeg')
    expect(sniff(makePng(10, 10))).toBe('png')
    expect(sniff(makeWebp(10, 10))).toBe('webp')
    expect(sniff(makePdf(1))).toBe('pdf')
    expect(sniff(enc('GIF89a\x01\x00\x01\x00'))).toBe('gif')
    expect(sniff(enc('hello world'))).toBe('unknown')
  })

  it('tells AVIF from HEIC by ftyp brands', () => {
    const ftyp = (major: string, ...compat: string[]) => {
      const body = enc(`ftyp${major}\0\0\0\0${compat.join('')}`)
      const out = new Uint8Array(4 + body.length)
      out[3] = out.length
      out.set(body, 4)
      return out
    }
    expect(sniff(ftyp('avif', 'mif1', 'miaf'))).toBe('avif')
    expect(sniff(ftyp('mif1', 'avif'))).toBe('avif')
    expect(sniff(ftyp('heic', 'mif1'))).toBe('heic')
  })

  it('finds a PDF header preceded by junk', () => {
    expect(sniff(enc('\n\n  %PDF-1.7\n'))).toBe('pdf')
  })
})

describe('imageSize', () => {
  it('reads PNG, WebP and JPEG headers', () => {
    expect(imageSize(makePng(640, 480))).toEqual({ width: 640, height: 480 })
    expect(imageSize(makeWebp(1920, 1080))).toEqual({ width: 1920, height: 1080 })
    expect(imageSize(makeJpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 })
  })

  it('applies EXIF rotation so phone photos report their displayed size', () => {
    expect(imageSize(makeJpeg(4032, 3024, 2000, 6))).toEqual({ width: 3024, height: 4032 })
    expect(imageSize(makeJpeg(4032, 3024, 2000, 3))).toEqual({ width: 4032, height: 3024 })
  })
})

describe('pdfPageCount', () => {
  it('reads the page tree count', () => {
    expect(pdfPageCount(makePdf(12))).toBe(12)
  })

  it('falls back to counting page objects', () => {
    const pdf = enc('%PDF-1.4 << /Type /Page >> << /Type /Page >> << /Type /Page >>')
    expect(pdfPageCount(pdf)).toBe(3)
  })
})

describe('inspect', () => {
  it('ignores a lying extension and MIME type', async () => {
    const info = await inspect(toFile(makePng(100, 50, 3000), 'photo.jpg', 'image/jpeg'))
    expect(info).toEqual({ kind: 'image', format: 'png', mime: 'image/png', size: 3000, width: 100, height: 50 })
  })

  it('reports PDF pages', async () => {
    const info = await inspect(toFile(makePdf(4), 'doc.pdf'))
    expect(info).toMatchObject({ kind: 'pdf', pages: 4 })
  })
})
