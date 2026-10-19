import { afterEach, describe, expect, it, vi } from 'vitest'
import { FitError } from '../src/shared/errors'
import { compressPdf, PdfCompressError, pdfEngine } from '../src/pdf'
import { toRgba, unpredict } from '../src/pdf/pixels'
import { sizely } from '../src/rules/file-rule'
import { fakeEngine } from './helpers/image-engine'
import { buildPdf, pattern, pngFilter, readImages, scanBytes } from './helpers/pdf'

const MB = 1024 ** 2
const A4 = { width: 2480, height: 3508 } // A4 at 300 dpi

describe('pixels', () => {
  it('undoes every PNG filter type', () => {
    const raw = pattern(37, 11, 3)
    expect(unpredict(pngFilter(raw, 37, 11, 3), 15, 3, 37)).toEqual(raw)
  })

  it('expands gray and RGB to RGBA', () => {
    expect([...toRgba(new Uint8Array([9]), 1, 1, 1)]).toEqual([9, 9, 9, 255])
    expect([...toRgba(new Uint8Array([1, 2, 3]), 3, 1, 1)]).toEqual([1, 2, 3, 255])
  })
})

describe('compressPdf', () => {
  it('shrinks a scanned document to the target and keeps it a valid PDF with text', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([
      { kind: 'jpeg', ...A4 },
      { kind: 'jpeg', ...A4 },
      { kind: 'jpeg', ...A4 },
    ])
    expect(file.size).toBeGreaterThan(14 * MB)

    const result = await compressPdf(file, { engine, targetBytes: 2 * MB })
    expect(result.metTarget).toBe(true)
    expect(result.size).toBeLessThanOrEqual(2 * MB)
    expect(result.images.map((i) => i.status)).toEqual(['recompressed', 'recompressed', 'recompressed'])

    const out = await readImages(result.blob)
    expect(out.pages).toBe(3)
    for (const image of out.images) {
      expect(image.filter).toBe('/DCTDecode')
      expect(Math.max(image.width, image.height)).toBeGreaterThanOrEqual(1000)
      expect(image.width / image.height).toBeCloseTo(A4.width / A4.height, 2)
    }
    const text = new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()))
    expect(text).toContain('%PDF-')
  })

  it('prefers keeping resolution: a mild target only lowers quality', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const result = await compressPdf(file, { engine, targetBytes: Math.round(file.size * 0.8) })
    expect(result.settings).toMatchObject({ scale: 1 })
    expect(result.settings!.quality).toBeLessThan(0.85)
    expect(result.size).toBeLessThanOrEqual(file.size * 0.8)
    expect(result.images[0]).toMatchObject({ newWidth: A4.width, newHeight: A4.height })
  })

  it('never downscales below minLongSide, and reports when the target is out of reach', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const result = await compressPdf(file, { engine, targetBytes: 50 * 1024, minLongSide: 1400 })
    expect(result.metTarget).toBe(false)
    expect(result.images[0]!.newHeight).toBe(1400)
    expect(result.size).toBeLessThan(file.size)
  })

  it('without a target, re-encodes once at the default quality', async () => {
    const { engine, calls } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const result = await compressPdf(file, { engine })
    expect(result.metTarget).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.quality).toBe(0.75)
    expect(result.size).toBeLessThan(file.size)
  })

  it('ignores EXIF orientation inside embedded JPEGs, like PDF viewers do', async () => {
    const { engine, decodes } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    await compressPdf(file, { engine })
    expect(decodes).toEqual([{ applyOrientation: false }])
  })

  it('decodes Flate images with PNG and TIFF predictors exactly', async () => {
    const { engine, pixels } = fakeEngine()
    const { file } = await buildPdf([
      { kind: 'flate', width: 300, height: 200, channels: 3, predictor: 'png' },
      { kind: 'flate', width: 300, height: 200, channels: 1, predictor: 'tiff' },
      { kind: 'flate', width: 300, height: 200, channels: 3 },
    ])
    await compressPdf(file, { engine, minImageBytes: 0 })
    expect(pixels).toHaveLength(3)
    expect(pixels[0]).toEqual(toRgba(pattern(300, 200, 3), 3, 300, 200))
    expect(pixels[1]).toEqual(toRgba(pattern(300, 200, 1), 1, 300, 200))
    expect(pixels[2]).toEqual(toRgba(pattern(300, 200, 3), 3, 300, 200))
  })

  it('rewrites Flate and gray images as RGB JPEG, keeping 3-channel ICC profiles', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([
      { kind: 'flate', width: 1200, height: 1600, channels: 1, predictor: 'png', noise: true },
      { kind: 'jpeg', ...A4, colorSpace: 'ICC3' },
    ])
    const result = await compressPdf(file, { engine, minImageBytes: 0 })
    const { images } = await readImages(result.blob)
    const byRef = Object.fromEntries(images.map((i) => [i.ref, i]))
    const [gray, icc] = result.images
    expect(gray!.status).toBe('recompressed')
    expect(byRef[gray!.ref]).toMatchObject({ filter: '/DCTDecode', colorSpace: '/DeviceRGB', hasDecodeParms: false })
    expect(byRef[icc!.ref]).toMatchObject({ filter: '/DCTDecode', colorSpace: '/ICCBased' })
  })

  it('skips images it does not understand, saying why', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([
      { kind: 'jpeg', ...A4, colorSpace: 'DeviceCMYK' },
      { kind: 'raw', dict: { Width: 100, Height: 100, BitsPerComponent: 1, ColorSpace: 'DeviceGray', Filter: 'CCITTFaxDecode' }, bytes: 20_000 },
      { kind: 'raw', dict: { Width: 100, Height: 100, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: 'JBIG2Decode' }, bytes: 20_000 },
      { kind: 'jpeg', width: 100, height: 100, bytes: 2000 },
    ])
    const result = await compressPdf(file, { engine })
    expect(result.images.map((i) => [i.status, i.reason])).toEqual([
      ['skipped', 'colour space DeviceCMYK'],
      ['skipped', '1 bits per component'],
      ['skipped', 'filter JBIG2Decode'],
      ['skipped', 'already small'],
    ])
    expect(result.blob).toBe(file)
  })

  it('leaves soft masks alone and keeps them attached to the recompressed image', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4, smask: true }])
    const result = await compressPdf(file, { engine })
    const base = result.images.find((i) => i.width === A4.width)
    const mask = result.images.find((i) => i.width === 1000)
    expect(base).toMatchObject({ status: 'recompressed' })
    expect(mask).toMatchObject({ status: 'skipped', reason: 'used as a mask', width: 1000 })
    const { images } = await readImages(result.blob)
    const outBase = images.find((i) => i.ref === base!.ref)!
    const outMask = images.find((i) => i.ref === mask!.ref)!
    expect(outBase.smask).toBe(mask!.ref)
    expect(outMask).toMatchObject({ filter: '/FlateDecode', colorSpace: '/DeviceGray' })
  })

  it('returns text-only PDFs untouched without needing an image engine', async () => {
    const { file } = await buildPdf([])
    const result = await compressPdf(file, { targetBytes: 1 })
    expect(result).toMatchObject({ blob: file, metTarget: false, images: [] })
  })

  it('never returns a bigger file', async () => {
    const { engine } = fakeEngine()
    // Already aggressively compressed: re-encoding would grow it.
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4, bytes: 300_000 }])
    const result = await compressPdf(file, { engine })
    expect(result.blob).toBe(file)
    expect(result.images[0]).toMatchObject({ status: 'kept' })
  })

  it('refuses signed and encrypted PDFs', async () => {
    const { engine } = fakeEngine()
    const signed = await buildPdf([{ kind: 'jpeg', ...A4 }], { signed: true })
    const encrypted = await buildPdf([{ kind: 'jpeg', ...A4 }], { encrypted: true })
    await expect(compressPdf(signed.file, { engine })).rejects.toMatchObject({ name: 'PdfCompressError', issueCode: 'protected' })
    await expect(compressPdf(encrypted.file, { engine })).rejects.toBeInstanceOf(PdfCompressError)
  })

  it('reports garbage as unreadable', async () => {
    const { engine } = fakeEngine()
    const junk = new File([new TextEncoder().encode('%PDF-1.4 not really a pdf')], 'x.pdf')
    await expect(compressPdf(junk, { engine })).rejects.toMatchObject({ issueCode: 'unreadable' })
  })

  it('honours an AbortSignal', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const controller = new AbortController()
    controller.abort()
    await expect(compressPdf(file, { engine, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('pdfEngine with fit()', () => {
  it('makes sizely.pdf().maxSize() fix scanned documents', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }, { kind: 'jpeg', ...A4 }])
    const steps: string[] = []
    const result = await sizely.pdf().maxSize('1.5MB').fit(file, {
      pdfEngine: pdfEngine({ engine }),
      onStep: (s) => steps.push(s),
    })
    expect(result.changed).toBe(true)
    expect(result.file.size).toBeLessThanOrEqual(1.5 * MB)
    expect(result.info).toMatchObject({ kind: 'pdf', pages: 2 })
    expect(steps[0]).toBe('found 2 images, 2 recompressible')
    expect(steps.at(-1)).toMatch(/^saved .* MB → /)
  })

  it('turns a signed PDF into a friendly, localized FitError', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }], { signed: true })
    const error = await sizely.pdf().maxSize('1MB').fit(file, { pdfEngine: pdfEngine({ engine }), locale: 'pt-BR' }).catch((e) => e)
    expect(error).toBeInstanceOf(FitError)
    expect(error.reason).toBe('not_fixable')
    expect(error.message).toBe('Este PDF é assinado ou protegido por senha, então não pode ser alterado.')
  })

  it('gives up with a best effort when the target is impossible', async () => {
    const { engine } = fakeEngine()
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const error = await sizely.pdf().maxSize('20KB').fit(file, { pdfEngine: pdfEngine({ engine }) }).catch((e) => e)
    expect(error).toMatchObject({ reason: 'gave_up' })
    expect(error.bestEffort.size).toBeLessThan(scanBytes(A4.width, A4.height))
  })
})

describe('without @cantoo/pdf-lib installed', () => {
  const missing = {
    name: 'SizelyDependencyError',
    message: 'sizely/pdf needs @cantoo/pdf-lib. Install it with: npm install @cantoo/pdf-lib',
  }

  const importWithoutPdfLib = async () => {
    vi.resetModules()
    vi.doMock('@cantoo/pdf-lib', () => {
      throw new Error('not found')
    })
    return {
      pdf: await import('../src/pdf'),
      rules: await import('../src/rules/file-rule'),
      errors: await import('../src/shared/errors'),
    }
  }

  afterEach(() => {
    vi.doUnmock('@cantoo/pdf-lib')
    vi.resetModules()
  })

  it('imports fine and only fails when compressPdf is called, with a clear error', async () => {
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const { pdf } = await importWithoutPdfLib()
    await expect(pdf.compressPdf(file)).rejects.toMatchObject(missing)
  })

  it('is rethrown by fit() as is, not turned into a FitError', async () => {
    const { file } = await buildPdf([{ kind: 'jpeg', ...A4 }])
    const { pdf, rules, errors } = await importWithoutPdfLib()
    const error = await rules.sizely.pdf().maxSize('1MB').fit(file, { pdfEngine: pdf.pdfEngine() }).catch((e) => e)
    expect(error).toMatchObject(missing)
    expect(error).not.toBeInstanceOf(errors.FitError)
    expect(error).not.toBeInstanceOf(FitError)
  })
})
