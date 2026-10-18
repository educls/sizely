import { formatSize } from './size'
import type { DetectedFormat, IssueCode, Locale } from './types'

type Params = Record<string, string | number>

const FORMAT_NAMES: Record<DetectedFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  heic: 'HEIC',
  pdf: 'PDF',
  unknown: '?',
}

export const formatName = (f: DetectedFormat) => FORMAT_NAMES[f]

const DICT: Record<Locale, Record<IssueCode, (p: Params) => string> & Record<string, unknown>> = {
  en: {
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
  },
  'pt-BR': {
    wrong_type: (p) => `O arquivo precisa ser ${p.expected === 'pdf' ? 'um PDF' : 'uma imagem'}.`,
    wrong_format: (p) => `O formato precisa ser ${p.expected}, mas é ${p.received}.`,
    too_large: (p) => `O arquivo pode ter no máximo ${p.expected}, mas tem ${p.received}.`,
    too_small: (p) => `O arquivo precisa ter pelo menos ${p.expected}, mas tem ${p.received}.`,
    wrong_dimensions: (p) =>
      `A imagem precisa ter exatamente ${p.expected} px, mas tem ${p.received} px.`,
    dimensions_too_large: (p) =>
      `A imagem pode ter no máximo ${p.expected} px, mas tem ${p.received} px.`,
    dimensions_too_small: (p) =>
      `A imagem precisa ter pelo menos ${p.expected} px, mas tem ${p.received} px.`,
    wrong_aspect_ratio: (p) => `A proporção precisa ser ${p.expected}, mas é ${p.received}.`,
    too_many_pages: (p) =>
      `O documento pode ter no máximo ${p.expected} páginas, mas tem ${p.received}.`,
    unreadable: () => `Não foi possível ler este arquivo.`,
    protected: () => `Este PDF é assinado ou protegido por senha, então não pode ser alterado.`,
    or: ' ou ',
    upTo: 'até',
    atLeast: 'mín.',
    pages: 'páginas',
    image: 'Imagem',
    any: 'Qualquer arquivo',
  },
}

export function message(locale: Locale, code: IssueCode, params: Params = {}): string {
  return (DICT[locale] ?? DICT.en)[code](params)
}

export function word(locale: Locale, key: 'or' | 'upTo' | 'atLeast' | 'pages' | 'image' | 'any') {
  return (DICT[locale] ?? DICT.en)[key] as string
}

export const sizeText = (bytes: number, locale: Locale) => formatSize(bytes, locale)
