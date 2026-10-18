import type { DrawPlan } from './types'

export interface GeometrySpec {
  width?: number
  height?: number
  maxWidth?: number
  maxHeight?: number
  minWidth?: number
  minHeight?: number
  aspect?: { ratio: number; tolerance: number }
  fitMode: 'cover' | 'contain'
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export function aspectMatches(width: number, height: number, ratio: number, tolerance: number) {
  return Math.abs(width / height - ratio) / ratio <= tolerance
}

/**
 * Plans crop, letterbox and scale so an image of `srcW × srcH` satisfies the
 * geometric rules. Pure function: no pixels are touched here.
 */
export function planGeometry(
  srcW: number,
  srcH: number,
  spec: GeometrySpec,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): DrawPlan {
  let sx = 0
  let sy = 0
  let sw = srcW
  let sh = srcH
  let canvasW = srcW
  let canvasH = srcH
  let dx = 0
  let dy = 0

  const exact = spec.width !== undefined && spec.height !== undefined
  const target = exact ? spec.width! / spec.height! : spec.aspect?.ratio
  const tolerance = exact ? 0.001 : (spec.aspect?.tolerance ?? 0)
  const needsAspect = target !== undefined && !aspectMatches(srcW, srcH, target, tolerance)

  if (needsAspect && target !== undefined) {
    const srcRatio = srcW / srcH
    if (spec.fitMode === 'contain') {
      if (srcRatio > target) {
        canvasH = srcW / target
        dy = (canvasH - srcH) / 2
      } else {
        canvasW = srcH * target
        dx = (canvasW - srcW) / 2
      }
    } else if (srcRatio > target) {
      sw = srcH * target
      sx = clamp(focus.x * srcW - sw / 2, 0, srcW - sw)
      canvasW = sw
    } else {
      sh = srcW / target
      sy = clamp(focus.y * srcH - sh / 2, 0, srcH - sh)
      canvasH = sh
    }
  }

  let width: number
  let height: number
  if (exact) {
    width = spec.width!
    height = spec.height!
  } else {
    let scale = 1
    if (spec.maxWidth) scale = Math.min(scale, spec.maxWidth / canvasW)
    if (spec.maxHeight) scale = Math.min(scale, spec.maxHeight / canvasH)
    if (spec.minWidth) scale = Math.max(scale, spec.minWidth / canvasW)
    if (spec.minHeight) scale = Math.max(scale, spec.minHeight / canvasH)
    width = Math.max(1, Math.round(canvasW * scale))
    height = Math.max(1, Math.round(canvasH * scale))
    if (spec.maxWidth) width = Math.min(width, spec.maxWidth)
    if (spec.maxHeight) height = Math.min(height, spec.maxHeight)
  }

  const kx = width / canvasW
  const ky = height / canvasH
  const dw = needsAspect && spec.fitMode === 'contain' ? srcW : sw
  const dh = needsAspect && spec.fitMode === 'contain' ? srcH : sh
  return { width, height, sx, sy, sw, sh, dx: dx * kx, dy: dy * ky, dw: dw * kx, dh: dh * ky }
}

/** Shrinks a plan's output by `factor`, keeping crop and letterbox intact. */
export function scalePlan(plan: DrawPlan, factor: number): DrawPlan {
  const width = Math.max(1, Math.round(plan.width * factor))
  const height = Math.max(1, Math.round(plan.height * factor))
  const kx = width / plan.width
  const ky = height / plan.height
  return {
    ...plan,
    width,
    height,
    dx: plan.dx * kx,
    dy: plan.dy * ky,
    dw: plan.dw * kx,
    dh: plan.dh * ky,
  }
}

export const isIdentity = (plan: DrawPlan, srcW: number, srcH: number) =>
  plan.width === srcW &&
  plan.height === srcH &&
  plan.sx === 0 &&
  plan.sy === 0 &&
  plan.sw === srcW &&
  plan.sh === srcH
