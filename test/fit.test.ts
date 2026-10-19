import { describe, expect, it } from 'vitest'
import { FitError } from '../src/shared/errors'
import { candidateFormats } from '../src/fit/fit-image'
import { sizely } from '../src/rules/file-rule'
import { DEFAULT_SPEC } from '../src/rules/spec'
import type { PdfEngine } from '../src/shared/types'
import { fakeEngine, makeJpeg, makePdf, makePng, toFile } from './helpers/image-engine'

const phone = () => toFile(makeJpeg(4032, 3024, 3 * 1024 ** 2, 6), 'IMG_0042.JPG', 'image/jpeg')

describe('fit: images', () => {
  it('returns the original untouched when it already fits', async () => {
    const { engine, calls } = fakeEngine()
    const file = toFile(makeJpeg(600, 800, 50_000), 'ok.jpg')
    const result = await sizely.image().maxSize('100KB').fit(file, { engine })
    expect(result.changed).toBe(false)
    expect(result.file).toBe(file)
    expect(calls).toHaveLength(0)
  })

  it('turns a rotated phone photo into an exact document photo', async () => {
    const { engine } = fakeEngine()
    const rule = sizely.image().format('jpg').dimensions(600, 800).maxSize('200KB')
    const result = await rule.fit(phone(), { engine })

    expect(result.changed).toBe(true)
    expect(result.original).toMatchObject({ width: 3024, height: 4032 })
    expect(result.info).toMatchObject({ format: 'jpeg', width: 600, height: 800 })
    expect(result.file.size).toBeLessThanOrEqual(200 * 1024)
    expect(result.file.name).toBe('IMG_0042.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.steps.join(' | ')).toMatch(/resized 3024×4032 → 600×800 \| encoded JPEG at quality 0\.\d\d/)
    expect((await rule.check(result.file)).ok).toBe(true)
  })

  it('uses the highest quality that fits instead of the lowest', async () => {
    const { engine } = fakeEngine()
    const rule = sizely.image().format('jpeg').dimensions(600, 800).maxSize('250KB')
    const result = await rule.fit(phone(), { engine })
    const quality = Number(result.steps.at(-1)!.match(/quality ([\d.]+)/)![1])
    // 0.92 would be ~282 KB; the search should land just under the limit, far above the 0.5 floor.
    expect(quality).toBeGreaterThan(0.75)
    expect(result.file.size).toBeGreaterThan(235 * 1024)
    expect(result.file.size).toBeLessThanOrEqual(250 * 1024)
  })

  it('prefers changing format over shrinking pixels', async () => {
    const { engine, calls } = fakeEngine()
    const screenshot = toFile(makePng(1000, 1000, 1_500_000), 'screen.png')
    const result = await sizely.image().maxSize('400KB').fit(screenshot, { engine })
    expect(result.info).toMatchObject({ format: 'webp', width: 1000, height: 1000 })
    expect(result.file.name).toBe('screen.webp')
    expect(calls.every((c) => c.plan.width === 1000)).toBe(true)
  })

  it('shrinks pixels only when quality alone is not enough', async () => {
    const { engine } = fakeEngine()
    const rule = sizely.image().format('jpeg').maxDimensions(4000, 4000).maxSize('200KB')
    const result = await rule.fit(phone(), { engine })
    expect(result.file.size).toBeLessThanOrEqual(200 * 1024)
    expect(result.info.width!).toBeLessThan(3024)
    expect(result.info.width! / result.info.height!).toBeCloseTo(3024 / 4032, 2)
  })

  it('never shrinks below the minimum dimensions', async () => {
    const { engine } = fakeEngine()
    const rule = sizely.image().format('jpeg').minDimensions(2000, 2000).maxSize('50KB')
    const error = await rule.fit(phone(), { engine }).catch((e) => e)
    expect(error).toBeInstanceOf(FitError)
    expect(error.reason).toBe('gave_up')
    expect(error.bestEffort.size).toBeGreaterThan(50 * 1024)
    const { info } = await sizely.image().check(error.bestEffort)
    expect(info.width).toBe(2000)
    expect(info.height!).toBeGreaterThanOrEqual(2000)
  })

  it('gives up with a best effort when exact dimensions cannot fit the size', async () => {
    const { engine } = fakeEngine()
    const rule = sizely.image().format('jpeg').dimensions(2000, 2000).maxSize('20KB')
    const error = await rule.fit(phone(), { engine, locale: 'pt-BR' }).catch((e) => e)
    expect(error).toBeInstanceOf(FitError)
    expect(error.reason).toBe('gave_up')
    expect(error.issues.map((i: { code: string }) => i.code)).toEqual(['too_large'])
    expect(error.message).toMatch(/^O arquivo pode ter no máximo 20 KB/)
    expect(error.bestEffort).toBeInstanceOf(File)
  })

  it('upscales tiny images to meet the minimum', async () => {
    const { engine } = fakeEngine()
    const result = await sizely.image().minDimensions(600).fit(toFile(makeJpeg(300, 200), 'small.jpg'), { engine })
    expect(result.info).toMatchObject({ width: 600, height: 400 })
  })

  it('falls back to the next format when the browser cannot encode one', async () => {
    const { engine } = fakeEngine({ unsupported: ['webp'] })
    const rule = sizely.image().format('webp', 'jpeg').dimensions(512, 512)
    const result = await rule.fit(phone(), { engine })
    expect(result.info.format).toBe('jpeg')
  })

  it('honours an AbortSignal', async () => {
    const { engine } = fakeEngine()
    const controller = new AbortController()
    controller.abort()
    await expect(
      sizely.image().dimensions(10, 10).fit(phone(), { engine, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('refuses to turn a PDF into an image', async () => {
    const { engine } = fakeEngine()
    const error = await sizely.image().fit(toFile(makePdf(1), 'a.pdf'), { engine }).catch((e) => e)
    expect(error).toMatchObject({ name: 'FitError', reason: 'not_fixable' })
  })

  it('reports steps as they happen', async () => {
    const { engine } = fakeEngine()
    const seen: string[] = []
    await sizely.image().format('jpeg').dimensions(600, 800).fit(phone(), { engine, onStep: (s) => seen.push(s) })
    expect(seen[0]).toMatch(/^resized/)
  })
})

describe('fit: PDFs', () => {
  const bigPdf = () => toFile(makePdf(3, 3 * 1024 ** 2), 'contrato.pdf')

  it('asks for a PDF engine instead of failing silently', async () => {
    const error = await sizely.pdf().maxSize('1MB').fit(bigPdf()).catch((e) => e)
    expect(error).toMatchObject({ reason: 'no_pdf_engine' })
  })

  it('uses the PDF engine you plug in', async () => {
    const pdfEngine: PdfEngine = {
      async compress(_file, { targetBytes }) {
        return new Blob([makePdf(3, targetBytes! - 1000) as BlobPart])
      },
    }
    const result = await sizely.pdf().maxSize('1MB').fit(bigPdf(), { pdfEngine })
    expect(result.changed).toBe(true)
    expect(result.file.size).toBeLessThanOrEqual(1024 ** 2)
    expect(result.file.name).toBe('contrato.pdf')
  })

  it('does not pretend to fix page limits', async () => {
    const pdfEngine: PdfEngine = { compress: async (f) => f }
    const error = await sizely.pdf().maxPages(1).fit(bigPdf(), { pdfEngine }).catch((e) => e)
    expect(error).toMatchObject({ reason: 'not_fixable' })
  })
})

describe('candidateFormats', () => {
  const spec = (patch = {}) => ({ ...DEFAULT_SPEC, kind: 'image' as const, ...patch })

  it('keeps the current format first when allowed', () => {
    expect(candidateFormats(spec({ formats: ['jpeg', 'png'] }), 'png')).toEqual(['png', 'jpeg'])
  })

  it('converts formats the browser cannot write', () => {
    expect(candidateFormats(spec(), 'heic')).toEqual(['jpeg'])
    expect(candidateFormats(spec({ formats: ['webp'] }), 'heic')).toEqual(['webp'])
  })

  it('offers WebP/JPEG for heavy PNGs only when size matters', () => {
    expect(candidateFormats(spec(), 'png')).toEqual(['png'])
    expect(candidateFormats(spec({ maxSize: 1000 }), 'png')).toEqual(['png', 'webp', 'jpeg'])
  })
})
