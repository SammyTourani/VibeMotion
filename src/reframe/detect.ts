// Face detection for auto-reframe: MediaPipe's BlazeFace (short range) over
// frames sampled ~5 times a second with a small Mediabunny CanvasSink.
//
// BlazeFace short-range is trained on square, selfie-distance images, so a
// 16:9 frame squeezed into its 128x128 input makes faces tiny. We run it on
// overlapping square tiles instead and merge the results.

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { CanvasSink, type InputVideoTrack } from 'mediabunny';
import type { FaceAnalysis, FaceBox } from '../project/types';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export class FacesCancelled extends Error {
  constructor() {
    super('Face analysis cancelled');
    this.name = 'FacesCancelled';
  }
}

let detector: Promise<FaceDetector> | null = null;
let quieted = false;

/**
 * MediaPipe's WebAssembly prints Google-style info and warning lines
 * ("W0923 21:37:14.214 gl_context.cc:1119] ...") and startup chatter to the
 * console. Drop exactly those; its errors (E/F lines) still come through.
 */
function quietMediaPipeLogs() {
  if (quieted) return;
  quieted = true;
  const glog = /^[IW]\d{4} \d\d:\d\d:\d\d/;
  const chatter = /^(INFO: Created TensorFlow Lite|Graph successfully started running)/;
  for (const level of ['log', 'info', 'warn', 'debug'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === 'string' && (glog.test(first) || chatter.test(first))) return;
      original(...args);
    };
  }
}

function getDetector(): Promise<FaceDetector> {
  quietMediaPipeLogs();
  detector ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    try {
      return await make('GPU');
    } catch {
      return await make('CPU');
    }
  })();
  detector.catch(() => {
    detector = null;
  });
  return detector;
}

interface Tile {
  x: number;
  y: number;
  size: number;
}

/** Overlapping square tiles covering the frame (a single tile for square-ish frames). */
export function tilesFor(w: number, h: number): Tile[] {
  const size = Math.min(w, h);
  const long = Math.max(w, h);
  if (long / size < 1.2) return [{ x: 0, y: 0, size }];
  const n = Math.ceil(long / size) + 1;
  const step = (long - size) / (n - 1);
  return Array.from({ length: n }, (_, i) =>
    w >= h ? { x: Math.round(i * step), y: 0, size } : { x: 0, y: Math.round(i * step), size },
  );
}

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

/** Keeps the most confident box among overlapping ones. */
export function mergeBoxes(boxes: FaceBox[]): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const out: FaceBox[] = [];
  for (const b of sorted) if (!out.some((o) => iou(o, b) > 0.3)) out.push(b);
  return out;
}

export async function analyzeFaces(
  track: InputVideoTrack,
  duration: number,
  frameW: number,
  frameH: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<FaceAnalysis> {
  const det = await getDetector();
  const interval = duration > 900 ? 0.5 : duration > 300 ? 0.33 : 0.2;
  const scale = Math.min(1, 720 / Math.max(frameW, frameH));
  const w = Math.max(2, Math.round(frameW * scale));
  const h = Math.max(2, Math.round(frameH * scale));
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 });

  const times: number[] = [];
  for (let t = 0; t < duration; t += interval) times.push(+t.toFixed(3));
  const tiles = tilesFor(w, h);
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = 256;
  const tctx = tileCanvas.getContext('2d', { willReadFrequently: false })!;
  const thumb = document.createElement('canvas');
  thumb.width = 32;
  thumb.height = 18;
  const thctx = thumb.getContext('2d', { willReadFrequently: true })!;

  const frames: FaceAnalysis['frames'] = [];
  const sceneCuts: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  let i = 0;
  for await (const wc of sink.canvasesAtTimestamps(times)) {
    if (signal?.aborted) throw new FacesCancelled();
    const t = times[i]!;
    i++;
    if (!wc) {
      frames.push({ t, faces: [] });
      continue;
    }
    const src = wc.canvas as CanvasImageSource;
    const found: FaceBox[] = [];
    for (const tile of tiles) {
      tctx.drawImage(src, tile.x, tile.y, tile.size, tile.size, 0, 0, 256, 256);
      const res = det.detect(tileCanvas);
      for (const d of res.detections) {
        const bb = d.boundingBox;
        if (!bb) continue;
        const k = tile.size / 256;
        found.push({
          x: (tile.x + bb.originX * k) / w,
          y: (tile.y + bb.originY * k) / h,
          w: (bb.width * k) / w,
          h: (bb.height * k) / h,
          score: d.categories[0]?.score ?? 0,
        });
      }
    }
    frames.push({ t, faces: mergeBoxes(found) });

    // Hard scene cuts: a big jump in a tiny luma thumbnail between samples.
    thctx.drawImage(src, 0, 0, 32, 18);
    const px = thctx.getImageData(0, 0, 32, 18).data;
    if (prev) {
      let diff = 0;
      for (let p = 0; p < px.length; p += 4) {
        const a = 0.299 * px[p]! + 0.587 * px[p + 1]! + 0.114 * px[p + 2]!;
        const b = 0.299 * prev[p]! + 0.587 * prev[p + 1]! + 0.114 * prev[p + 2]!;
        diff += Math.abs(a - b);
      }
      if (diff / (px.length / 4) > 48) sceneCuts.push(t);
    }
    prev = px;

    onProgress?.(i / times.length);
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return { interval, frames, sceneCuts };
}
