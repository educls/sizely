/** Brazilian Portuguese messages. */

import type { LocaleMessages } from '../messages'

export const ptBR: LocaleMessages = {
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
}
