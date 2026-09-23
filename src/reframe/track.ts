// Turns raw face detections into a smooth virtual camera, the way a camera
// operator would move: ignore small wobbles (deadzone), re-centre on real
// moves with a critically damped spring (no overshoot), and cut instead of
// pan when the shot itself cuts.

import type { FaceAnalysis, FaceBox } from '../project/types';

export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  /** Face width, normalised to the frame width. */
  w: number;
  /** Face height, normalised to the frame height. */
  h: number;
}

interface Track {
  points: (TrackPoint & { area: number; score: number })[];
  last: FaceBox & { t: number };
  weight: number;
}

/**
 * The primary face: the track with the most (area x confidence) over time,
 * which favours whoever is biggest and on screen the longest.
 */
export function primaryTrack(analysis: FaceAnalysis, maxGap = 1.2): TrackPoint[] | null {
  const tracks: Track[] = [];
  for (const frame of analysis.frames) {
    const faces = [...frame.faces].sort((a, b) => b.w * b.h - a.w * a.h);
    const used = new Set<Track>();
    for (const f of faces) {
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      let best: Track | null = null;
      let bestD = Infinity;
      for (const tr of tracks) {
        if (used.has(tr) || frame.t - tr.last.t > maxGap) continue;
        const lx = tr.last.x + tr.last.w / 2;
        const ly = tr.last.y + tr.last.h / 2;
        const d = Math.hypot(cx - lx, cy - ly);
        const limit = 0.6 * Math.max(tr.last.h, f.h) + 0.03;
        if (d < limit && d < bestD) {
          best = tr;
          bestD = d;
        }
      }
      const point = { t: frame.t, x: cx, y: cy, w: f.w, h: f.h, area: f.w * f.h, score: f.score };
      if (best) {
        best.points.push(point);
        best.last = { ...f, t: frame.t };
        best.weight += point.area * f.score;
        used.add(best);
      } else {
        const tr: Track = { points: [point], last: { ...f, t: frame.t }, weight: point.area * f.score };
        tracks.push(tr);
        used.add(tr);
      }
    }
  }
  if (tracks.length === 0) return null;
  tracks.sort((a, b) => b.weight - a.weight);
  return tracks[0]!.points.map(({ t, x, y, w, h }) => ({ t, x, y, w, h }));
}

/** Target position at time t: interpolated, holding the last known position through gaps. */
export function targetAt(points: readonly TrackPoint[], t: number): TrackPoint {
  if (t <= points[0]!.t) return points[0]!;
  const last = points[points.length - 1]!;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  // Across a long gap, hold rather than glide through where nobody was.
  if (b.t - a.t > 1.5) return a;
  const k = (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

/** One step of a critically damped spring (exact, stable for any dt). */
export function springStep(x: number, v: number, goal: number, omega: number, dt: number): [number, number] {
  const e = Math.exp(-omega * dt);
  const d = x - goal;
  const tmp = (v + omega * d) * dt;
  return [goal + (d + tmp) * e, (v - omega * tmp) * e];
}

export interface CameraPath {
  /** Samples per second. */
  rate: number;
  xs: Float32Array;
  ys: Float32Array;
  /** Face height (normalised) along the path. */
  hs: Float32Array;
}

export interface CameraOptions {
  /** Deadzone half-width, normalised to the source frame. */
  deadzoneX: number;
  deadzoneY: number;
  /**
   * Half the visible crop, normalised. When given, the camera never lets the
   * face leave the frame, however fast it moves (an operator wouldn't).
   */
  halfW?: number;
  halfH?: number;
  /** Spring stiffness, rad/s. ~5 settles in about 0.8 s. */
  omega?: number;
  rate?: number;
}

/** Clamp c so that a box of size `size` centred at `target` stays inside a window of half-size `half` centred at c. */
function keepInside(c: number, target: number, size: number, half: number | undefined): number {
  if (half === undefined) return c;
  const slack = half - size / 2 - size * 0.15;
  if (slack <= 0) return target;
  return Math.min(Math.max(c, target - slack), target + slack);
}

export function buildCameraPath(
  points: readonly TrackPoint[],
  duration: number,
  sceneCuts: readonly number[],
  opts: CameraOptions,
): CameraPath {
  const rate = opts.rate ?? 30;
  const omega = opts.omega ?? 5;
  const n = Math.max(1, Math.ceil(duration * rate) + 1);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const hs = new Float32Array(n);
  const cuts = [...sceneCuts].sort((a, b) => a - b);
  let cutIdx = 0;

  const first = targetAt(points, 0);
  let x = first.x;
  let y = first.y;
  let vx = 0;
  let vy = 0;
  let gx = x;
  let gy = y;
  const dt = 1 / rate;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const tg = targetAt(points, t);
    let jump = false;
    while (cutIdx < cuts.length && cuts[cutIdx]! <= t) {
      jump = true;
      cutIdx++;
    }
    if (jump) {
      x = gx = tg.x;
      y = gy = tg.y;
      vx = vy = 0;
    } else {
      if (Math.abs(tg.x - gx) > opts.deadzoneX) gx = tg.x;
      if (Math.abs(tg.y - gy) > opts.deadzoneY) gy = tg.y;
      if (i > 0) {
        [x, vx] = springStep(x, vx, gx, omega, dt);
        [y, vy] = springStep(y, vy, gy, omega, dt);
        // Hard limit: the face stays in frame. Carry the forced motion as
        // velocity so the spring continues smoothly from there.
        const cx = keepInside(x, tg.x, tg.w, opts.halfW);
        const cy = keepInside(y, tg.y, tg.h, opts.halfH);
        if (cx !== x) {
          vx = (cx - xs[i - 1]!) / dt;
          x = cx;
        }
        if (cy !== y) {
          vy = (cy - ys[i - 1]!) / dt;
          y = cy;
        }
      }
    }
    xs[i] = x;
    ys[i] = y;
    hs[i] = tg.h;
  }
  return { rate, xs, ys, hs };
}

export function cameraAt(path: CameraPath, t: number): { x: number; y: number; h: number } {
  const f = Math.max(0, t * path.rate);
  const i = Math.min(path.xs.length - 1, Math.floor(f));
  const j = Math.min(path.xs.length - 1, i + 1);
  const k = f - i;
  return {
    x: path.xs[i]! + (path.xs[j]! - path.xs[i]!) * k,
    y: path.ys[i]! + (path.ys[j]! - path.ys[i]!) * k,
    h: path.hs[i]! + (path.hs[j]! - path.hs[i]!) * k,
  };
}
