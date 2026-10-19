import { describe, expect, it } from 'vitest'
import { formatSize, lengthToPx, parseSize } from '../src/shared/size'

describe('parseSize', () => {
  it.each([
    [500, 500],
    ['500', 500],
    ['500B', 500],
    ['1KB', 1024],
    ['500 kb', 512_000],
    ['2MB', 2 * 1024 ** 2],
    ['1.5mb', 1.5 * 1024 ** 2],
    ['1,5MB', 1.5 * 1024 ** 2],
    ['300KiB', 300 * 1024],
    ['1G', 1024 ** 3],
  ])('%s → %d bytes', (input, expected) => {
    expect(parseSize(input)).toBe(expected)
  })

  it('rejects garbage', () => {
    expect(() => parseSize('big')).toThrow(TypeError)
    expect(() => parseSize('10 parsecs')).toThrow(/unit/)
    expect(() => parseSize(-1)).toThrow(RangeError)
  })
})

describe('formatSize', () => {
  it('formats with sensible precision', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(500 * 1024)).toBe('500 KB')
    expect(formatSize(2.25 * 1024 ** 2)).toBe('2.3 MB')
  })

  it('uses the locale decimal separator', () => {
    expect(formatSize(1.5 * 1024 ** 2, 'pt-BR')).toBe('1,5 MB')
  })
})

describe('lengthToPx', () => {
  it('converts print sizes at 300 dpi', () => {
    expect(lengthToPx(35, 300)).toBe(413)
    expect(lengthToPx(45, 300)).toBe(531)
    expect(lengthToPx('3cm', 300)).toBe(354)
    expect(lengthToPx('2in', 300)).toBe(600)
  })
})
