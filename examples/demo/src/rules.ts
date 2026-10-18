import { sizely, type FileRule } from 'sizely'

export interface DemoRule {
  id: string
  name: string
  /** Where you'd meet this rule in real life. */
  context: string
  rule: FileRule
  /** The code a developer would write. Kept in sync with `rule` by hand. */
  code: string
  kind: 'image' | 'pdf'
  /** Point to keep in frame when cropping (a face detector would provide it). */
  focus?: { x: number; y: number }
}

export const DEMO_RULES: DemoRule[] = [
  {
    id: 'document-photo',
    name: 'Document photo',
    context: 'ID cards, exam sign-ups, visa forms',
    kind: 'image',
    rule: sizely.image().format('jpg').printSize(30, 40).maxSize('100KB'),
    code: `sizely.image()
  .format('jpg')
  .printSize(30, 40) // mm at 300 dpi
  .maxSize('100KB')`,
  },
  {
    id: 'avatar',
    name: 'Profile picture',
    context: 'Square avatar for an account page',
    kind: 'image',
    rule: sizely.image().format('webp', 'jpeg').dimensions(512, 512).maxSize('200KB'),
    code: `sizely.image()
  .format('webp', 'jpeg')
  .dimensions(512, 512)
  .maxSize('200KB')`,
  },
  {
    id: 'social-card',
    name: 'Social share image',
    context: 'Link previews on social networks',
    kind: 'image',
    rule: sizely.image().format('jpeg').dimensions(1200, 630).maxSize('300KB'),
    focus: { x: 0.5, y: 0.38 },
    code: `sizely.image()
  .format('jpeg')
  .dimensions(1200, 630)
  .maxSize('300KB')
  .fit(file, { focus: { x: 0.5, y: 0.38 } })`,
  },
  {
    id: 'light-photo',
    name: 'Lighter photo upload',
    context: 'Chat apps, marketplaces, support tickets',
    kind: 'image',
    rule: sizely.image().format('webp', 'jpeg').maxDimensions(2048, 2048).maxSize('1MB'),
    code: `sizely.image()
  .format('webp', 'jpeg')
  .maxDimensions(2048, 2048)
  .maxSize('1MB')`,
  },
  {
    id: 'portal-pdf',
    name: 'Scanned PDF',
    context: 'Government and HR portals with a 1 MB cap',
    kind: 'pdf',
    rule: sizely.pdf().maxSize('1MB'),
    code: `import { pdfEngine } from 'sizely/pdf'

sizely.pdf()
  .maxSize('1MB')
  .fit(file, { pdfEngine: pdfEngine() })`,
  },
]
