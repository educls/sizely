# Contributing to sizely

Thanks for helping! Bug reports, presets, translations and code are all welcome.

## Setup

```bash
git clone https://github.com/educls/sizely.git
cd sizely
npm install
npm test          # unit tests (Node, fake image engine)
npm run typecheck
npm run build
```

To try the real canvas engine, run the demo. It imports the library from `src`, so changes hot-reload:

```bash
cd examples/demo
npm install
npm run dev
```

## Project structure

Each file starts with a comment saying what it does. The four files at the top of `src/` are the package entry points, one per import path; they only re-export, so they double as a list of the public API.

```
src/
├── index.ts            → `sizely`          builder, inspection, utilities
├── react.ts            → `sizely/react`    useSizely hook
├── presets.ts          → `sizely/presets`  ready-made rules
├── pdf.ts              → `sizely/pdf`      PDF compression
│
├── rules/              What a rule is and how files are checked against it
│   ├── file-rule.ts      sizely.image()/pdf()/any() and the chainable FileRule
│   ├── spec.ts           RuleSpec, the plain-data form of a rule
│   ├── evaluate.ts       evaluate(): file info + rule → list of issues
│   └── describe.ts       describeSpec(): "JPEG · up to 500 KB · 600×800 px"
│
├── inspect/            Reading a file's bytes (never its name)
│   ├── inspect.ts        inspect(): Blob → FileInfo
│   ├── sniff.ts          real format from magic bytes
│   ├── image-size.ts     width/height from image headers, EXIF-aware
│   ├── pdf-pages.ts      best-effort PDF page count
│   └── bytes.ts          low-level byte readers
│
├── fit/                Fixing files that fail a rule
│   ├── fit-file.ts       fitFile(): checks, then routes to image or PDF
│   ├── fit-image.ts      crop/resize, then search format and quality
│   ├── fit-pdf.ts        calls the pdfEngine, maps errors to FitError
│   ├── geometry.ts       crop/letterbox/resize math (pure)
│   └── output-name.ts    photo.HEIC → photo.jpg
│
├── engines/
│   └── canvas.ts         default ImageEngine (createImageBitmap + canvas)
│
├── pdf/                Implementation of sizely/pdf
│   ├── compress.ts       compressPdf(): analyze, search, rewrite
│   ├── analyze.ts        which images can be recompressed, signed check
│   ├── pixels.ts         PNG/TIFF predictors, gray/RGB → RGBA
│   ├── pdf-lib.ts        loads @cantoo/pdf-lib on demand
│   ├── engine.ts         pdfEngine() for rule.fit()
│   ├── errors.ts         PdfCompressError
│   └── types.ts          options, report and result types
│
├── i18n/               End-user messages
│   ├── messages.ts       message()/word() lookups
│   └── locales/          one file per language (en.ts, pt-BR.ts)
│
└── shared/             Used everywhere
    ├── types.ts          public types and engine interfaces
    ├── errors.ts         FitError, throwIfAborted
    ├── formats.ts        MIME type, extension and name per format
    └── size.ts           '2MB' and '35mm' parsing and formatting
```

Tests live in `test/`, one file per area, with shared fixtures in `test/helpers/`.

## Ground rules

- Keep the core dependency-free and small. Heavy code belongs behind a subpath (like `sizely/pdf`) and AGPL code doesn't belong in this repo.
- `sizely/pdf` must never make a document worse: when in doubt, skip the image and say why in the report.
- Every behaviour change comes with a test. The image pipeline is tested with a fake engine (`test/helpers/image-engine.ts`) so tests stay fast and deterministic.
- Issue messages are written for end users, not developers.

## Presets

Presets for passports, visas, exams and government portals are the most useful contribution. Because a wrong spec makes someone's application fail, each preset needs:

1. A link to the **official** source (a government or institution page, not a photo-shop blog).
2. The date you checked it.
3. A test asserting its numbers.

Open an issue with the "Preset request" template first if you're unsure.

## Translations

Messages live in `src/i18n/locales/`, one file per language. Copy `en.ts`, translate it, add the code to the `Locale` type in `src/shared/types.ts`, register it in `src/i18n/messages.ts`, and add a test like the `pt-BR` one in `test/rules.test.ts`.

## Releasing (maintainers)

`npm version <patch|minor|major>` then `npm publish`. `prepublishOnly` runs typecheck, tests and build.
