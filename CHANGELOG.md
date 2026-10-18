# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [0.1.1]

### Fixed

- `package.json` is now listed in `exports`, so `require('sizely/package.json')` and `import('sizely/package.json')` no longer fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- `sizely/pdf` now loads `@cantoo/pdf-lib` on first use instead of at import time. Importing `sizely/pdf` without the optional peer dependency no longer crashes with a raw `ERR_MODULE_NOT_FOUND`. Calling `compressPdf()` or `pdfEngine().compress()` throws a `SizelyDependencyError` instead, with the message `sizely/pdf needs @cantoo/pdf-lib. Install it with: npm install @cantoo/pdf-lib`. `fit()` passes this error through unchanged instead of turning it into an `unreadable` `FitError`.

## [0.1.0]

- Initial release: declarative file rules that validate and fix files in the browser before upload (`sizely.image()`, `.fit()`, `.check()`, `FitError`), the `useSizely` React hook, ready-made presets, and PDF compression in `sizely/pdf`.

[0.1.1]: https://github.com/educls/sizely/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/educls/sizely/releases/tag/v0.1.0
