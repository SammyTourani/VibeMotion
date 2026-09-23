// The frame compositor shared by the preview, the export and the landing
// page: crop (face-tracked or fixed), punch-in zoom on alternate segments,
// then captions. Everything is drawn in output pixels (e.g. 1080x1920); the
// preview just scales the context, so line breaks match the export exactly.

import type { Aspect, FrameSettings } from '../project/types';
import { cropRect, type Rect } from '../reframe/crop';
import { cameraAt, type CameraPath } from '../reframe/track';
import { drawCaptions, type CaptionLayout } from '../captions/render';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameSpec {
  srcW: number;
  srcH: number;
  outW: number;
  outH: number;
  aspect: Aspect;
  frame: FrameSettings;
  camera: CameraPath | null;
}

/** Zoom for a kept segment: punch in on every other one to hide the jump cut. */
export function zoomFor(frame: FrameSettings, segment: number): number {
  return frame.punchIn && segment % 2 === 1 ? frame.punchAmount : 1;
}

export function cropAt(spec: FrameSpec, tSrc: number, segment: number): Rect {
  const { frame } = spec;
  const zoom = zoomFor(frame, Math.max(0, segment));
  let cx = 0.5;
  let cy = 0.5;
  let faceY: number | null = null;
  if (frame.mode === 'auto' && spec.camera) {
    const c = cameraAt(spec.camera, tSrc);
    cx = c.x;
    faceY = c.y;
  } else if (frame.mode === 'manual') {
    cx = frame.manualX;
    cy = frame.manualY;
  }
  const base = cropRect(spec.srcW, spec.srcH, spec.aspect, cx, cy, zoom);
  if (faceY !== null) {
    // Put the face a little above the middle of the crop (headroom), when
    // the crop is shorter than the frame and can move vertically.
    const hNorm = base.h / spec.srcH;
    return cropRect(spec.srcW, spec.srcH, spec.aspect, cx, faceY + 0.12 * hNorm, zoom);
  }
  return base;
}

export function drawComposite(
  ctx: Ctx,
  source: CanvasImageSource,
  spec: FrameSpec,
  crop: Rect,
  captions: CaptionLayout | null,
  tOut: number,
  scale = 1,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, spec.outW, spec.outH);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, spec.outW, spec.outH);
  if (captions) drawCaptions(ctx, captions, tOut);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
