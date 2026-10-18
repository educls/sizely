<div align="center">

<!-- Absolute URL so the logo also shows on npm. jsDelivr serves SVG with an image MIME type; raw.githubusercontent.com doesn't. -->
# <img src="https://cdn.jsdelivr.net/gh/educls/sizely@main/docs/logo.svg" alt="" height="32" align="absmiddle" /> sizely

**Stop rejecting uploads. Fix them.**

Declarative file rules that validate *and* auto-fix files in the browser, before upload.

[![npm](https://img.shields.io/npm/v/sizely)](https://www.npmjs.com/package/sizely)
[![bundle size](https://img.shields.io/bundlephobia/minzip/sizely)](https://bundlephobia.com/package/sizely)
[![license](https://img.shields.io/npm/l/sizely)](./LICENSE)

**[Try the live demo](https://educls.github.io/sizely/)**: drop a photo or a scanned PDF and watch it get fixed.

<!-- Absolute URL: npm renders this README without the docs/ folder, so a relative path breaks there. -->
<img src="https://cdn.jsdelivr.net/gh/educls/sizely@main/docs/demo.gif" alt="A 41.8 MB phone photo becomes a valid 354×472 JPEG of 17 KB, under the 100 KB limit" width="640" />

</div>

---

Your user has a 4 MB photo straight from their phone. Your form wants a JPEG, 600×800, under 100 KB.

Today they get a red *"File too large"* and go looking for a sketchy website to fix it.
With sizely, the file is fixed on their device in a few hundred milliseconds, and nothing leaves the browser.

```ts
import { sizely } from 'sizely'

const photo = sizely.image().format('jpg').dimensions(600, 800).maxSize('100KB')

const { file, steps } = await photo.fit(input.files[0])
// steps → ['resized 3024×4032 → 600×800', 'encoded JPEG at quality 0.84 (97 KB)']
await upload(file) // guaranteed to pass the rule
```

## Why sizely

- **Validate and fix with one rule.** The same rule checks a file, explains what's wrong to the user, and fixes it.
- **Reads bytes, not names.** A PNG renamed to `.jpg` is a PNG. Formats come from magic bytes, dimensions from headers.
- **Phone-photo aware.** EXIF rotation is applied, so a portrait photo is treated as portrait.
- **Best quality that fits.** A binary search finds the *highest* JPEG/WebP quality under your size limit, not the lowest.
- **Pixels last.** It changes quality first, then format, and only then shrinks dimensions, never below your minimums.
- **Smart crop.** `cover` crops to the target shape around a focus point (pass a face-detection result); `contain` pads.
- **Messages for humans.** Issues come with end-user messages in English and Brazilian Portuguese, ready for your UI.
- **Shrinks scanned PDFs too, MIT licensed.** `sizely/pdf` recompresses the images inside a PDF, where the weight of a scan lives, and leaves text selectable.
- **Tiny.** The core is ~7 KB min+gzip with zero dependencies, tree-shakeable, and works in web workers.
- **Pluggable.** Bring your own image engine (sharp, jSquash) or PDF engine.

## Install

```bash
npm install sizely
```

## Usage

### Check without changing anything

```ts
const result = await photo.check(file, { locale: 'pt-BR' })

result.ok      // false
result.info    // { kind: 'image', format: 'png', width: 4032, height: 3024, size: 4194304, ... }
result.issues  // [{ code: 'wrong_format', message: 'O formato precisa ser JPEG, mas é PNG.' }, ...]
```

### Fix, or explain why not

```ts
import { FitError } from 'sizely'

try {
  const { file, changed } = await photo.fit(input.files[0], { locale: 'pt-BR' })
  await upload(file)
} catch (error) {
  if (error instanceof FitError) {
    showError(error.message)   // end-user friendly
    error.reason               // 'not_fixable' | 'no_pdf_engine' | 'unreadable' | 'gave_up'
    error.bestEffort           // the closest file sizely managed, if any
  }
}
```

### Hints for your upload field

```tsx
<input type="file" accept={photo.accept()} />
<small>{photo.describe('pt-BR')}</small>   {/* JPEG · até 100 KB · 600×800 px */}
```

### React and Next.js

```tsx
'use client'
import { sizely } from 'sizely'
import { useSizely } from 'sizely/react'

const avatar = sizely.image().format('webp', 'jpeg').dimensions(512, 512).maxSize('200KB')

export function AvatarUpload() {
  const { fit, status, result, issues } = useSizely(avatar)

  return (
    <>
      <input type="file" accept={avatar.accept()} onChange={(e) => fit(e.target.files![0]!)} />
      {status === 'working' && <p>Optimizing…</p>}
      {result && <img src={URL.createObjectURL(result.file)} alt="" />}
      {issues.map((issue) => <p key={issue.code}>{issue.message}</p>)}
    </>
  )
}
```

The hook cancels the previous run when a new file arrives or the component unmounts.

### Verify on the server too

Never trust the client. `check()` only reads headers, so the same rule runs in Node 20+, Bun and edge runtimes:

```ts
// app/api/upload/route.ts
import { avatar } from '@/lib/rules'

export async function POST(request: Request) {
  const file = (await request.formData()).get('file') as File
  const { ok, issues } = await avatar.check(file)
  if (!ok) return Response.json({ issues }, { status: 422 })
  // ...
}
```

## API

### Rules

Start with `sizely.image()`, `sizely.pdf()` or `sizely.any()`. Rules are immutable: every method returns a new rule, so you can build on shared ones.

| Method | What it does |
| --- | --- |
| `.format('jpeg', 'png', 'webp')` | Allowed formats, in order of preference for output. `'jpg'` works too. |
| `.maxSize('500KB')` / `.minSize()` | File size. Numbers are bytes; strings accept `B`, `KB`, `MB`, `GB` (binary). |
| `.dimensions(600, 800)` | Exact size in pixels. Crops (or pads) to the shape, then resizes. |
| `.printSize(35, 45, { dpi: 300 })` | Exact print size. Numbers are mm; strings accept `mm`, `cm`, `in`. |
| `.maxDimensions(w, h)` / `.minDimensions(w, h)` | Bounds. Either side can be `undefined`. |
| `.aspectRatio(3, 4, tolerance?)` | Required proportion. Tolerance is relative, 1% by default. |
| `.maxPages(10)` | PDF page limit (checked, not fixed). |
| `.crop('cover' \| 'contain')` | Crop to the shape (default) or pad it with the background. |
| `.background('#fff')` | Padding colour, also used for transparency in JPEG output. |
| `.minQuality(0.5)` | Lowest JPEG/WebP quality before sizely starts reducing pixels. |
| `.check(file, { locale })` | `{ ok, info, issues }`. Never changes the file. |
| `.fit(file, options)` | `{ file, changed, original, info, steps }`, or throws `FitError`. |
| `.describe(locale)` | One-line summary, e.g. `JPEG · up to 500 KB · 600×800 px`. |
| `.accept()` | Value for `<input type="file" accept>`. |
| `.toJSON()` / `sizely.fromJSON()` | Rules are plain data: store them in a CMS or send them from your API. |

### `fit()` options

| Option | Default | |
| --- | --- | --- |
| `locale` | `'en'` | `'en'` or `'pt-BR'` for issue messages. |
| `focus` | `{ x: .5, y: .5 }` | Point to keep in frame when cropping (0–1). Pass a face position. |
| `signal` | | `AbortSignal` to cancel. |
| `fileName` | input name | Output name; the extension always matches the real format. |
| `onStep` | | Called with each step, for progress UIs. |
| `engine` | canvas | Image engine. See [Custom engines](#custom-engines). |
| `pdfEngine` | none | Needed to fix PDFs. Use `pdfEngine()` from `sizely/pdf`, see [PDFs](#pdfs). |

### Presets

Generic starting points you can extend:

```ts
import { presets } from 'sizely/presets'

presets.photo.size35x45()            // 413×531 JPEG, the common passport/visa size
presets.photo.size3x4().maxSize('100KB')
presets.photo.square2in()            // 600×600 JPEG
presets.web.avatar()                 // 512×512 WebP/JPEG ≤ 200 KB
presets.web.openGraph()              // 1200×630 ≤ 1 MB
presets.web.photo()                  // long side ≤ 2048 px, ≤ 1 MB
presets.document.pdf('2MB')
```

**Want presets for a specific passport, visa, exam or government portal?** [Contribute one](./CONTRIBUTING.md#presets). Each preset must link its official source.

## PDFs

sizely checks PDFs (type, size, page count) out of the box. To make one smaller, add the PDF engine:

```bash
npm install sizely @cantoo/pdf-lib
```

```ts
import { sizely } from 'sizely'
import { pdfEngine } from 'sizely/pdf'

const scan = sizely.pdf().maxSize('1MB')
const { file } = await scan.fit(input.files[0], { pdfEngine: pdfEngine() })
```

**How it works.** In a scanned document, almost all the bytes are page images. `sizely/pdf` finds every image in the PDF, recompresses it with the same quality search used for photos (the highest JPEG quality that fits, then fewer pixels only if needed), and writes it back. Text, fonts, links and vectors are not touched, so text stays selectable. In a headless Chromium test, a 16.3 MB PDF with three A4 pages scanned at 300 dpi went down to 1.0 MB in about 3 seconds.

**What it refuses or skips**, so it never breaks a document:

| Case | What happens |
| --- | --- |
| Digitally signed or password-protected PDF | Refused with `issueCode: 'protected'`. Any change would invalidate the signature. |
| CMYK, Indexed, Lab, JBIG2, CCITT, JPEG 2000 or 1-bit images | Left as they are, with the reason in the report. |
| Soft masks and stencil masks | Left as they are, so transparency survives. |
| Image that wouldn't get smaller | Kept. The output is never bigger than the input. |
| Images would drop below 1000 px on the long side (`minLongSide`) | Not shrunk further, so scans stay readable. `fit()` throws `gave_up` with the best effort attached. |

For details, call `compressPdf` directly:

```ts
import { compressPdf } from 'sizely/pdf'

const { blob, size, metTarget, images } = await compressPdf(file, { targetBytes: 1_000_000 })
images // [{ width: 2480, height: 3508, status: 'recompressed', newWidth: 1609, newBytes: 343040 }, ...]
```

`@cantoo/pdf-lib` (MIT, a maintained fork of pdf-lib) adds about 250 KB gzipped, so load the engine only when a PDF shows up:

```ts
const { pdfEngine } = await import('sizely/pdf')
```

**Bring your own engine.** Any object with a `compress(file, { targetBytes, signal })` method works, for example a wrapper around Ghostscript, MuPDF or Hyper Compress. Those are stronger on unusual PDFs but AGPL licensed.

## Custom engines

The default image engine uses `createImageBitmap` and `OffscreenCanvas`, so it runs in browsers and web workers. Anything implementing `ImageEngine` works: sharp on the server, jSquash for MozJPEG/AVIF quality, or a test double.

```ts
interface ImageEngine {
  decode(blob: Blob, options?: { applyOrientation?: boolean }): Promise<DecodedImage>
  encode(image: DecodedImage, plan: DrawPlan, options: { format; quality; background }): Promise<Blob>
  fromPixels?(rgba: Uint8ClampedArray, width: number, height: number): Promise<DecodedImage> // used by sizely/pdf
}
```

## How it works

1. **Inspect.** Read the first bytes: real format, dimensions (EXIF rotation applied), PDF page count.
2. **Plan.** Compute crop, padding and scale as plain numbers (`planGeometry`, pure and tested).
3. **Encode.** Try each allowed format at full resolution, binary-searching quality to sit just under `maxSize`.
4. **Shrink only if needed.** Reduce pixels by the square root of the overshoot, never below your minimums.
5. **Verify.** Re-inspect the output against the rule. If it still fails, throw `FitError` with the best effort attached.

## Demo

The demo in [`examples/demo`](./examples/demo) is a Vite + React app that imports the library straight from `src`, so it doubles as a playground while you work on sizely:

```bash
npm install && cd examples/demo && npm install && npm run dev
```

## Roadmap

- [ ] Face-aware crop plugin for document photos
- [ ] Official presets for passports, visas and government portals (contributions welcome)
- [ ] More locales (es, fr, de…)
- [ ] `stripMetadata()` rule to always remove EXIF/GPS
- [ ] Web worker helper
- [ ] Vue and Svelte bindings
- [ ] HEIC decoding plugin for non-Safari browsers
- [ ] `sizely/pdf`: grayscale JPEG output, CMYK images, opt-in rasterize mode for any PDF

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). Presets and translations are great first contributions.

## License

[MIT](./LICENSE)
