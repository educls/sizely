/**
 * The default image engine: decodes with `createImageBitmap` and encodes
 * with (Offscreen)Canvas. Runs in browsers and web workers.
 */

import { mimeOf } from '../shared/formats'
import type { DecodedImage, DrawPlan, ImageEngine } from '../shared/types'

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('sizely: 2D canvas is not available')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

function toBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Halves the crop step by step until one more halving would undershoot the
 * target. A single big drawImage downscale aliases badly in most browsers.
 */
function stepDown(source: CanvasImageSource, plan: DrawPlan) {
  let current = source
  let sx = plan.sx
  let sy = plan.sy
  let sw = plan.sw
  let sh = plan.sh
  while (sw / 2 >= plan.dw && sh / 2 >= plan.dh) {
    const w = Math.max(1, Math.round(sw / 2))
    const h = Math.max(1, Math.round(sh / 2))
    const temp = makeCanvas(w, h)
    context(temp).drawImage(current, sx, sy, sw, sh, 0, 0, w, h)
    current = temp
    sx = 0
    sy = 0
    sw = w
    sh = h
  }
  return { source: current, sx, sy, sw, sh }
}

/** Default engine: createImageBitmap + (Offscreen)Canvas. Browser and web workers. */
export function canvasEngine(): ImageEngine {
  return {
    async decode(blob: Blob, options = {}): Promise<DecodedImage> {
      const imageOrientation = options.applyOrientation === false ? 'none' : 'from-image'
      const bitmap = await createImageBitmap(blob, { imageOrientation } as ImageBitmapOptions)
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      }
    },

    async fromPixels(rgba, width, height): Promise<DecodedImage> {
      const bitmap = await createImageBitmap(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height))
      return { width, height, source: bitmap, close: () => bitmap.close() }
    },

    async encode(image, plan, { format, quality, background }) {
      const canvas = makeCanvas(plan.width, plan.height)
      const ctx = context(canvas)
      const letterboxed =
        plan.dx > 0.5 || plan.dy > 0.5 || plan.dw < plan.width - 0.5 || plan.dh < plan.height - 0.5
      if (format === 'jpeg' || letterboxed) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, plan.width, plan.height)
      }
      const { source, sx, sy, sw, sh } = stepDown(image.source as CanvasImageSource, plan)
      ctx.drawImage(source, sx, sy, sw, sh, plan.dx, plan.dy, plan.dw, plan.dh)

      const type = mimeOf(format)
      const blob = await toBlob(canvas, type, quality)
      if (!blob) throw new Error(`sizely: could not encode ${type}`)
      // Browsers silently fall back to PNG for formats they can't encode.
      if (blob.type !== type) throw new Error(`sizely: this browser cannot encode ${type}`)
      return blob
    },
  }
}

export function defaultEngine(): ImageEngine {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(
      'sizely: no image engine available in this environment. ' +
        'Run in a browser/web worker, or pass { engine } to fit().',
    )
  }
  return canvasEngine()
}
