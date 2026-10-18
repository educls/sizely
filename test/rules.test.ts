import { describe, expect, it } from 'vitest'
import { planGeometry } from '../src/geometry'
import { presets } from '../src/presets'
import { sizely } from '../src/rules'
import { makeJpeg, makePdf, makePng, toFile } from './helpers'

const codes = (r: { issues: readonly { code: string }[] }) => r.issues.map((i) => i.code)

describe('FileRule.check', () => {
  const rule = sizely.image().format('jpg').maxSize('100KB').dimensions(600, 800)

  it('passes a file that already matches', async () => {
    const result = await rule.check(toFile(makeJpeg(600, 800, 50_000), 'a.jpg'))
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('reports every problem at once', async () => {
    const result = await rule.check(toFile(makePng(4000, 3000, 300_000), 'a.png'))
    expect(codes(result)).toEqual(['wrong_format', 'too_large', 'wrong_dimensions'])
  })

  it('writes messages end users can read, in English or Portuguese', async () => {
    const file = toFile(makeJpeg(600, 800, 200 * 1024), 'a.jpg')
    const en = await rule.check(file)
    const pt = await rule.check(file, { locale: 'pt-BR' })
    expect(en.issues[0]!.message).toBe('File must be at most 100 KB, got 200 KB.')
    expect(pt.issues[0]!.message).toBe('O arquivo pode ter no máximo 100 KB, mas tem 200 KB.')
  })

  it('rejects the wrong kind of file outright', async () => {
    const result = await rule.check(toFile(makePdf(1), 'a.pdf'))
    expect(codes(result)).toEqual(['wrong_type'])
  })

  it('checks bounds and aspect ratio', async () => {
    const bounds = sizely.image().maxDimensions(1000, 1000).minDimensions(200).aspectRatio(1, 1)
    expect(codes(await bounds.check(toFile(makeJpeg(1200, 900), 'a.jpg')))).toEqual([
      'dimensions_too_large',
      'wrong_aspect_ratio',
    ])
    expect(codes(await bounds.check(toFile(makeJpeg(100, 100), 'a.jpg')))).toEqual(['dimensions_too_small'])
  })

  it('checks PDF pages', async () => {
    const pdf = sizely.pdf().maxPages(3)
    expect(codes(await pdf.check(toFile(makePdf(5), 'a.pdf')))).toEqual(['too_many_pages'])
  })
})

describe('FileRule builder', () => {
  it('is immutable', () => {
    const base = sizely.image().maxSize('1MB')
    const derived = base.dimensions(100, 100)
    expect(base.spec.width).toBeUndefined()
    expect(derived.spec).toMatchObject({ width: 100, height: 100, maxSize: 1024 ** 2 })
  })

  it('describes itself for upload hints', () => {
    const rule = sizely.image().format('jpeg', 'png').maxSize('500KB').dimensions(600, 800)
    expect(rule.describe()).toBe('JPEG or PNG · up to 500 KB · 600×800 px')
    expect(rule.describe('pt-BR')).toBe('JPEG ou PNG · até 500 KB · 600×800 px')
    expect(sizely.pdf().maxSize('2MB').maxPages(10).describe()).toBe('PDF · up to 2 MB · up to 10 pages')
  })

  it('round-trips through JSON', () => {
    const rule = sizely.image().format('webp').aspectRatio(16, 9).maxSize('2MB')
    const copy = sizely.fromJSON(JSON.parse(JSON.stringify(rule)))
    expect(copy.spec).toEqual(rule.spec)
    expect(copy.spec.aspect?.label).toBe('16:9')
  })

  it('converts print sizes', () => {
    expect(presets.photo.size35x45().spec).toMatchObject({ width: 413, height: 531, formats: ['jpeg'] })
    expect(presets.photo.size3x4().spec).toMatchObject({ width: 354, height: 472 })
    expect(presets.photo.square2in().spec).toMatchObject({ width: 600, height: 600 })
  })
})

describe('planGeometry', () => {
  const base = { fitMode: 'cover' as const }

  it('crops the centre to the target shape, then resizes', () => {
    const plan = planGeometry(4000, 3000, { ...base, width: 600, height: 800 })
    expect(plan).toMatchObject({ width: 600, height: 800, sy: 0, sh: 3000, sw: 2250, sx: 875 })
  })

  it('keeps the focus point in frame', () => {
    const left = planGeometry(4000, 3000, { ...base, width: 600, height: 800 }, { x: 0, y: 0.5 })
    const right = planGeometry(4000, 3000, { ...base, width: 600, height: 800 }, { x: 1, y: 0.5 })
    expect(left.sx).toBe(0)
    expect(right.sx).toBe(4000 - 2250)
  })

  it('pads instead of cropping in contain mode', () => {
    const plan = planGeometry(4000, 3000, { fitMode: 'contain', width: 800, height: 800 })
    expect(plan).toMatchObject({ width: 800, height: 800, sw: 4000, sh: 3000, dx: 0, dy: 100, dw: 800, dh: 600 })
  })

  it('fits within max bounds keeping proportion', () => {
    const plan = planGeometry(4000, 3000, { ...base, maxWidth: 2048, maxHeight: 2048 })
    expect(plan).toMatchObject({ width: 2048, height: 1536 })
  })

  it('upscales to meet minimum bounds', () => {
    const plan = planGeometry(300, 200, { ...base, minWidth: 600 })
    expect(plan).toMatchObject({ width: 600, height: 400 })
  })
})
