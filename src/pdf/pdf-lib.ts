/**
 * Loads `@cantoo/pdf-lib` on demand and shares it with the other files in
 * this folder through the `lib` binding.
 */

type PdfLib = typeof import('@cantoo/pdf-lib')

const MISSING_PDF_LIB = 'sizely/pdf needs @cantoo/pdf-lib. Install it with: npm install @cantoo/pdf-lib'

/**
 * The loaded library, set by `loadPdfLib()`. Only read it from code that runs
 * after `compressPdf` has awaited `loadPdfLib()`.
 */
export let lib: PdfLib
let loading: Promise<PdfLib> | undefined

/**
 * `@cantoo/pdf-lib` is an optional peer dependency, so it's loaded on first
 * use: importing sizely/pdf never fails, and a missing install gets a clear
 * message instead of a raw module-not-found error.
 */
export function loadPdfLib(): Promise<PdfLib> {
  loading ??= import('@cantoo/pdf-lib').then(
    (mod) => (lib = mod),
    (cause: unknown) => {
      loading = undefined
      const error = new Error(MISSING_PDF_LIB)
      error.name = 'SizelyDependencyError'
      ;(error as { cause?: unknown }).cause = cause
      throw error
    },
  )
  return loading
}

/** `N('Filter')` → the PDF name `/Filter`. */
export const N = (name: string) => lib.PDFName.of(name)
