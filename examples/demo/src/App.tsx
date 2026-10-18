import { FitError, formatSize, type CheckResult, type FileInfo, type Locale, type PdfEngine, type RuleSpec } from 'sizely'
import type { PdfCompressResult } from 'sizely/pdf'
import { useSizely } from 'sizely/react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Dimensioned } from './components/Dimensioned'
import { SizeMeter } from './components/SizeMeter'
import { DEMO_RULES, type DemoRule } from './rules'
import { samplePortrait, sampleScan } from './samples'

const REPO = 'https://github.com/educls/sizely'

function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url
}

function sidesOk(spec: RuleSpec, info: FileInfo) {
  const ok = (value: number | undefined, exact?: number, max?: number, min?: number) =>
    value === undefined ||
    ((exact === undefined || value === exact) && (max === undefined || value <= max) && (min === undefined || value >= min))
  return {
    widthOk: ok(info.width, spec.width, spec.maxWidth, spec.minWidth),
    heightOk: ok(info.height, spec.height, spec.maxHeight, spec.minHeight),
  }
}

function Preview({ file, url, info, title }: { file: Blob; url: string | null; info: FileInfo; title: string }) {
  if (!url) return null
  if (info.kind === 'image') return <img className="preview" src={url} alt={title} />
  if (info.kind === 'pdf') {
    return (
      <object className="preview preview-pdf" data={url} type="application/pdf" aria-label={title}>
        <div className="pdf-fallback">
          <strong>PDF</strong>
          <span>{info.pages ?? '?'} pages, {formatSize(file.size)}</span>
        </div>
      </object>
    )
  }
  return <div className="pdf-fallback">This file type isn't previewable.</div>
}

export function App() {
  const [ruleId, setRuleId] = useState(DEMO_RULES[0]!.id)
  const [locale, setLocale] = useState<Locale>('en')
  const [file, setFile] = useState<File | null>(null)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [pdfReport, setPdfReport] = useState<PdfCompressResult | null>(null)
  const [loadingSample, setLoadingSample] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const demo = DEMO_RULES.find((r) => r.id === ruleId)!

  // Wraps the MIT engine from sizely/pdf so the demo can show per-image details.
  // It's loaded on first use: photo-only visitors never download the PDF code.
  const pdfEngine = useMemo<PdfEngine>(
    () => ({
      async compress(blob, options) {
        const { compressPdf } = await import('sizely/pdf')
        const result = await compressPdf(blob, options)
        setPdfReport(result)
        return result.blob
      },
    }),
    [],
  )

  const { fit, status, result, issues, error, reset } = useSizely(demo.rule, { locale, pdfEngine, focus: demo.focus })

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setPdfReport(null)
    setElapsed(null)
    demo.rule.check(file, { locale }).then((c) => !cancelled && setCheck(c))
    const started = performance.now()
    fit(file).then((r) => {
      if (!cancelled && r) setElapsed(Math.round(performance.now() - started))
    })
    return () => {
      cancelled = true
    }
  }, [file, demo, locale, fit])

  const originalUrl = useObjectUrl(file)
  const fixedUrl = useObjectUrl(result?.changed ? result.file : null)

  const choose = useCallback((next: File | undefined | null) => {
    if (next) setFile(next)
  }, [])

  const loadSample = async (which: 'photo' | 'scan') => {
    setLoadingSample(which)
    try {
      const sample = which === 'photo' ? await samplePortrait() : await sampleScan()
      if (which === 'scan') setRuleId('portal-pdf')
      else if (demo.kind === 'pdf') setRuleId(DEMO_RULES[0]!.id)
      setFile(sample)
    } finally {
      setLoadingSample(null)
    }
  }

  const clear = () => {
    reset()
    setFile(null)
    setCheck(null)
    setPdfReport(null)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  const limit = demo.rule.spec.maxSize
  const scale = Math.max(file?.size ?? 0, (limit ?? 0) * 1.6, 1)
  const after = result?.info
  const fitError = error instanceof FitError ? error : null

  return (
    <>
      <header className="top">
        <a className="brand" href={REPO} aria-label="sizely on GitHub">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7" />
            <rect x="10" y="10" width="12" height="12" />
          </svg>
          sizely
        </a>
        <nav>
          <a href={`${REPO}#readme`}>Docs</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </header>

      <main>
        <section className="intro">
          <h1>Stop rejecting uploads. Fix them.</h1>
          <p>
            Your form wants a 100 KB JPEG. Your user has a 4 MB photo from their phone. sizely checks the file
            against your rule and fixes it right in the browser, before upload. Nothing leaves the device.
          </p>
          <InstallCommand />
        </section>

        <section className="bench" aria-label="Try it">
          <aside className="rules">
            <fieldset>
              <legend>Rule</legend>
              {DEMO_RULES.map((r) => (
                <RuleOption key={r.id} demo={r} checked={r.id === ruleId} onSelect={() => setRuleId(r.id)} />
              ))}
            </fieldset>
            <pre className="code" aria-label="Rule code">
              <code>{demo.code}</code>
            </pre>
            <fieldset className="locale">
              <legend>Error messages in</legend>
              <div className="segmented">
                {(['en', 'pt-BR'] as const).map((l) => (
                  <label key={l}>
                    <input type="radio" name="locale" checked={locale === l} onChange={() => setLocale(l)} />
                    <span>{l === 'en' ? 'English' : 'Português'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </aside>

          <div
            className="stage"
            data-dragging={dragging || undefined}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                choose(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            {!file ? (
              <div className="empty">
                <div className="target" aria-hidden="true">
                  <span />
                </div>
                <h2>Drop a photo or PDF here</h2>
                <p>It's checked against the rule on the left and fixed on your device.</p>
                <button type="button" className="primary" onClick={() => inputRef.current?.click()}>
                  Choose a file
                </button>
                <div className="samples">
                  <span>No file handy? Try a sample:</span>
                  <button type="button" onClick={() => loadSample('photo')} disabled={!!loadingSample}>
                    {loadingSample === 'photo' ? 'Generating…' : 'Phone photo, 4 MB'}
                  </button>
                  <button type="button" onClick={() => loadSample('scan')} disabled={!!loadingSample}>
                    {loadingSample === 'scan' ? 'Generating…' : 'Scanned contract, 14 MB'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="stage-bar">
                  <span className="file-name" title={file.name}>
                    {file.name}
                  </span>
                  <button type="button" onClick={() => inputRef.current?.click()}>
                    Use another file
                  </button>
                  <button type="button" onClick={clear}>
                    Clear
                  </button>
                </div>

                <div className="compare">
                  <article className="side" aria-label="Your file">
                    <h3>Your file</h3>
                    {check && (
                      <>
                        <Dimensioned width={check.info.width} height={check.info.height} {...sidesOk(demo.rule.spec, check.info)}>
                          <Preview file={file} url={originalUrl} info={check.info} title="Original file" />
                        </Dimensioned>
                        <SizeMeter label="Size" size={file.size} limit={limit} scale={scale} />
                        {check.ok ? (
                          <p className="verdict ok">Already passes this rule.</p>
                        ) : (
                          <div className="verdict bad">
                            <p>A plain validator would stop here:</p>
                            <ul>
                              {check.issues.map((issue) => (
                                <li key={issue.code}>{issue.message}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </article>

                  <article className="side side-after" aria-label="Fixed file" aria-live="polite">
                    <h3>What sizely uploads</h3>
                    {status === 'working' && (
                      <div className="working">
                        <span className="spinner" aria-hidden="true" />
                        Fixing on your device…
                      </div>
                    )}
                    {status === 'done' && result && after && (
                      <>
                        <Dimensioned width={after.width} height={after.height}>
                          <Preview
                            file={result.file}
                            url={result.changed ? fixedUrl : originalUrl}
                            info={after}
                            title="Fixed file"
                          />
                        </Dimensioned>
                        <SizeMeter
                          label="Size"
                          size={result.file.size}
                          limit={limit}
                          scale={scale}
                          from={result.changed ? file.size : undefined}
                        />
                        {result.changed ? (
                          <>
                            <p className="headline-stat">
                              <strong>{smallerText(file.size, result.file.size)}</strong>
                              {elapsed !== null && <span>, fixed in {elapsed.toLocaleString('en')} ms</span>}
                            </p>
                            <ol className="steps">
                              {result.steps.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ol>
                            {pdfReport && <PdfImages report={pdfReport} />}
                            <a className="primary download" href={fixedUrl ?? '#'} download={result.file.name}>
                              Download {result.file.name}
                            </a>
                          </>
                        ) : (
                          <p className="verdict ok">Nothing to fix, so the original file is uploaded as is.</p>
                        )}
                      </>
                    )}
                    {status === 'error' && (
                      <div className="verdict bad">
                        <p>{fitError?.reason === 'gave_up' ? 'Got as close as the rule allows, but:' : "This one can't be fixed:"}</p>
                        <ul>
                          {(issues.length ? issues : [{ code: 'error', message: String(error) }]).map((issue) => (
                            <li key={issue.code}>{issue.message}</li>
                          ))}
                        </ul>
                        {fitError?.reason === 'gave_up' && fitError.bestEffort && (
                          <p className="hint">Closest result: {formatSize(fitError.bestEffort.size)}.</p>
                        )}
                      </div>
                    )}
                  </article>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="use">
          <h2>Use it in your app</h2>
          <div className="use-grid">
            <p>
              One rule validates on the server and fixes on the client. Messages are written for your users, in English or
              Portuguese. The core is about 7 KB gzipped with no dependencies.
            </p>
            <pre className="code">
              <code>{`import { sizely } from 'sizely'
import { useSizely } from 'sizely/react'

const photo = sizely.image()
  .format('jpg').dimensions(600, 800).maxSize('100KB')

const { fit, result, issues } = useSizely(photo)
// <input type="file" onChange={(e) => fit(e.target.files[0])} />`}</code>
            </pre>
          </div>
        </section>
      </main>

      <footer>
        <span>MIT licensed.</span>
        <a href={REPO}>Star sizely on GitHub</a>
      </footer>
    </>
  )
}

/** "62% smaller" for modest wins, "373× smaller" when a percentage would round to 100. */
function smallerText(before: number, after: number) {
  const reduction = 1 - after / before
  if (reduction >= 0.95) return `${Math.round(before / after).toLocaleString('en')}× smaller`
  return `${Math.round(reduction * 100)}% smaller`
}

function RuleOption({ demo, checked, onSelect }: { demo: DemoRule; checked: boolean; onSelect: () => void }) {
  return (
    <label className="rule">
      <input type="radio" name="rule" checked={checked} onChange={onSelect} />
      <span className="rule-text">
        <span className="rule-name">{demo.name}</span>
        <span className="rule-context">{demo.context}</span>
        <span className="rule-spec">{demo.rule.describe()}</span>
      </span>
    </label>
  )
}

function PdfImages({ report }: { report: PdfCompressResult }) {
  const changed = report.images.filter((i) => i.status === 'recompressed')
  if (!changed.length) return null
  return (
    <details className="pdf-images">
      <summary>
        {changed.length} {changed.length === 1 ? 'image' : 'images'} inside the PDF recompressed, text untouched
      </summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Image</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {report.images.map((img) => (
            <tr key={img.ref}>
              <td>{img.width}×{img.height}</td>
              <td>{formatSize(img.originalBytes)}</td>
              <td>
                {img.status === 'recompressed'
                  ? `${img.newWidth}×${img.newHeight}, ${formatSize(img.newBytes!)}`
                  : `kept (${img.reason})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function InstallCommand() {
  const [copied, setCopied] = useState(false)
  const command = 'npm install sizely'
  return (
    <div className="install">
      <code>{command}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          } catch {
            /* clipboard blocked: the command is still selectable */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
