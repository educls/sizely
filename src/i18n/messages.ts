/**
 * Looks up end-user messages in the right language. The texts themselves
 * live in `./locales/`, one file per language.
 *
 * To add a language: copy `locales/en.ts`, translate it, add the code to the
 * `Locale` type in `shared/types.ts`, and register it in `LOCALES` below.
 */

import { formatSize } from '../shared/size'
import type { IssueCode, Locale } from '../shared/types'
import { en } from './locales/en'
import { ptBR } from './locales/pt-BR'

export type Params = Record<string, string | number>

/** Short words used to build summaries like `JPEG · up to 500 KB`. */
export type Word = 'or' | 'upTo' | 'atLeast' | 'pages' | 'image' | 'any'

/** One message per issue code, plus the summary words. */
export type LocaleMessages = Record<IssueCode, (params: Params) => string> & Record<Word, string>

const LOCALES: Record<Locale, LocaleMessages> = {
  en,
  'pt-BR': ptBR,
}

const messagesFor = (locale: Locale) => LOCALES[locale] ?? LOCALES.en

export function message(locale: Locale, code: IssueCode, params: Params = {}): string {
  return messagesFor(locale)[code](params)
}

export function word(locale: Locale, key: Word): string {
  return messagesFor(locale)[key]
}

export const sizeText = (bytes: number, locale: Locale) => formatSize(bytes, locale)

/** `600×800`; a missing side shows as `∞`. */
export const dimsText = (width?: number, height?: number) => `${width ?? '∞'}×${height ?? '∞'}`
