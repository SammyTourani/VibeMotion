import type { Aspect } from '../project/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ASPECTS: Record<Aspect, number> = {
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
};

export const OUTPUT_SIZES: Record<Aspect, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
};

/** The largest rectangle of the output aspect that fits in the source. */
export function baseCrop(srcW: number, srcH: number, aspect: Aspect): { w: number; h: number } {
  const a = ASPECTS[aspect];
  if (srcW / srcH > a) return { w: srcH * a, h: srcH };
  return { w: srcW, h: srcW / a };
}

/**
 * Crop rectangle in source pixels. `cx`, `cy` are the desired centre
 * (normalised); the rectangle is clamped to stay inside the frame.
 */
export function cropRect(srcW: number, srcH: number, aspect: Aspect, cx: number, cy: number, zoom = 1): Rect {
  const base = baseCrop(srcW, srcH, aspect);
  const w = base.w / zoom;
  const h = base.h / zoom;
  const x = Math.min(Math.max(cx * srcW - w / 2, 0), srcW - w);
  const y = Math.min(Math.max(cy * srcH - h / 2, 0), srcH - h);
  return { x, y, w, h };
}

/**
 * Camera limits for an aspect: the deadzone (normalised, scaled to how much
 * of the frame the crop shows) and the crop's half-size for keeping the face
 * in frame, allowing for the tightest punch-in.
 */
export function deadzoneFor(srcW: number, srcH: number, aspect: Aspect, maxZoom = 1.35) {
  const base = baseCrop(srcW, srcH, aspect);
  return {
    deadzoneX: (0.09 * base.w) / srcW,
    deadzoneY: (0.07 * base.h) / srcH,
    halfW: base.w / srcW / 2 / maxZoom,
    halfH: base.h / srcH / 2 / maxZoom,
  };
}
