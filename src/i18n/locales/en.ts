/** English messages. The reference locale: every other locale has the same keys. */

import type { LocaleMessages } from '../messages'

export const en: LocaleMessages = {
  wrong_type: (p) => `This must be ${p.expected === 'pdf' ? 'a PDF' : 'an image'}.`,
  wrong_format: (p) => `Format must be ${p.expected}, got ${p.received}.`,
  too_large: (p) => `File must be at most ${p.expected}, got ${p.received}.`,
  too_small: (p) => `File must be at least ${p.expected}, got ${p.received}.`,
  wrong_dimensions: (p) => `Image must be exactly ${p.expected} px, got ${p.received} px.`,
  dimensions_too_large: (p) => `Image must be at most ${p.expected} px, got ${p.received} px.`,
  dimensions_too_small: (p) => `Image must be at least ${p.expected} px, got ${p.received} px.`,
  wrong_aspect_ratio: (p) => `Image proportion must be ${p.expected}, got ${p.received}.`,
  too_many_pages: (p) => `Document must have at most ${p.expected} pages, got ${p.received}.`,
  unreadable: () => `This file could not be read.`,
  protected: () => `This PDF is signed or password-protected, so it can't be changed.`,
  or: ' or ',
  upTo: 'up to',
  atLeast: 'at least',
  pages: 'pages',
  image: 'Image',
  any: 'Any file',
}
