import { fitFile } from './fit'
import { inspect } from './inspect'
import { lengthToPx, parseSize, type LengthInput, type SizeInput } from './size'
import { DEFAULT_SPEC, describeSpec, evaluate, type RuleKind, type RuleSpec } from './spec'
import type { CheckResult, FitOptions, FitResult, ImageFormat, Locale } from './types'

type FormatInput = ImageFormat | 'jpg'

const normalizeFormat = (f: FormatInput): ImageFormat => (f === 'jpg' ? 'jpeg' : f)

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * An immutable, chainable file rule. Every method returns a new rule, so
 * rules can be shared and extended safely:
 *
 * ```ts
 * const photo = sizely.image().format('jpg').maxSize('500KB')
 * const avatar = photo.dimensions(512, 512)
 * ```
 */
export class FileRule {
  constructor(readonly spec: Readonly<RuleSpec>) {}

  private with(patch: Partial<RuleSpec>): FileRule {
    return new FileRule({ ...this.spec, ...patch })
  }

  /** Allowed formats, in order of preference for output. `'jpg'` is accepted. */
  format(...formats: FormatInput[]): FileRule {
    return this.with({ formats: [...new Set(formats.map(normalizeFormat))] })
  }

  /** Maximum file size: `500_000`, `'500KB'`, `'2MB'`. Binary units. */
  maxSize(size: SizeInput): FileRule {
    return this.with({ maxSize: parseSize(size) })
  }

  minSize(size: SizeInput): FileRule {
    return this.with({ minSize: parseSize(size) })
  }

  /** Exact output size in pixels. Crops (or pads) to the shape, then resizes. */
  dimensions(width: number, height: number): FileRule {
    return this.with({ width, height })
  }

  /**
   * Exact print size, converted to pixels at `dpi` (default 300).
   * Numbers are millimetres; strings accept `mm`, `cm` and `in`.
   *
   * ```ts
   * sizely.image().printSize(35, 45)        // 413×531 px
   * sizely.image().printSize('2in', '2in')  // 600×600 px
   * ```
   */
  printSize(width: LengthInput, height: LengthInput, options: { dpi?: number } = {}): FileRule {
    const dpi = options.dpi ?? 300
    return this.dimensions(lengthToPx(width, dpi), lengthToPx(height, dpi))
  }

  maxDimensions(width?: number, height?: number): FileRule {
    return this.with({ maxWidth: width, maxHeight: height })
  }

  minDimensions(width?: number, height?: number): FileRule {
    return this.with({ minWidth: width, minHeight: height })
  }

  /** Required proportion, e.g. `aspectRatio(3, 4)`. Tolerance is relative (1% default). */
  aspectRatio(width: number, height: number, tolerance = 0.01): FileRule {
    const d = gcd(Math.round(width), Math.round(height)) || 1
    const label = `${Math.round(width) / d}:${Math.round(height) / d}`
    return this.with({ aspect: { ratio: width / height, tolerance, label } })
  }

  maxPages(pages: number): FileRule {
    return this.with({ maxPages: pages })
  }

  /** `'cover'` (default) crops to the target shape; `'contain'` pads with `background`. */
  crop(mode: 'cover' | 'contain'): FileRule {
    return this.with({ fitMode: mode })
  }

  /** Fill colour for padding and for transparency in JPEG output. */
  background(color: string): FileRule {
    return this.with({ background: color })
  }

  /** Lowest JPEG/WebP quality allowed before pixels are reduced (0–1, default 0.5). */
  minQuality(quality: number): FileRule {
    if (quality <= 0 || quality > 1) throw new RangeError('minQuality must be in (0, 1]')
    return this.with({ minQuality: quality })
  }

  /** Validates without changing anything. */
  async check(file: Blob, options: { locale?: Locale } = {}): Promise<CheckResult> {
    const info = await inspect(file)
    const issues = evaluate(this.spec, info, options.locale)
    return { ok: issues.length === 0, info, issues }
  }

  /** Validates and, when needed, produces a fixed file. Throws `FitError` when it can't. */
  fit(file: Blob, options?: FitOptions): Promise<FitResult> {
    return fitFile(file, this.spec, options)
  }

  /** Short summary for hints under an upload field, e.g. `JPEG · up to 500 KB · 600×800 px`. */
  describe(locale: Locale = 'en'): string {
    return describeSpec(this.spec, locale)
  }

  /** The `accept` attribute for `<input type="file">`. */
  accept(): string {
    if (this.spec.kind === 'pdf') return 'application/pdf,.pdf'
    if (this.spec.kind === 'image') return 'image/*'
    return ''
  }

  toJSON(): RuleSpec {
    return { ...this.spec }
  }
}

const start = (kind: RuleKind) => new FileRule({ ...DEFAULT_SPEC, kind })

export const sizely = {
  /** Any image the browser can decode (JPEG, PNG, WebP, GIF, AVIF, HEIC on Safari). */
  image: () => start('image'),
  pdf: () => start('pdf'),
  any: () => start('any'),
  /** Rebuild a rule from `rule.toJSON()` output, e.g. a preset stored as JSON. */
  fromJSON: (spec: Partial<RuleSpec> & { kind: RuleKind }) =>
    new FileRule({ ...DEFAULT_SPEC, ...spec }),
}
