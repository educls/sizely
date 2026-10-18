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

## Ground rules

- Keep the core dependency-free and small. Heavy code belongs behind a subpath (like `sizely/pdf`) and AGPL code doesn't belong in this repo.
- `sizely/pdf` must never make a document worse: when in doubt, skip the image and say why in the report.
- Every behaviour change comes with a test. The image pipeline is tested with a fake engine (`test/helpers.ts`) so tests stay fast and deterministic.
- Issue messages are written for end users, not developers.

## Presets

Presets for passports, visas, exams and government portals are the most useful contribution. Because a wrong spec makes someone's application fail, each preset needs:

1. A link to the **official** source (a government or institution page, not a photo-shop blog).
2. The date you checked it.
3. A test asserting its numbers.

Open an issue with the "Preset request" template first if you're unsure.

## Translations

Messages live in `src/messages.ts`. Add your locale to the `Locale` type and the dictionary, plus a test like the `pt-BR` one in `test/rules.test.ts`.

## Releasing (maintainers)

`npm version <patch|minor|major>` then `npm publish`. `prepublishOnly` runs typecheck, tests and build.
