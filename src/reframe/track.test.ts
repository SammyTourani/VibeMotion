import { describe, expect, it } from 'vitest';
import { buildCameraPath, cameraAt, primaryTrack, springStep, targetAt } from './track';
import { baseCrop, cropRect, deadzoneFor } from './crop';
import type { FaceAnalysis } from '../project/types';

const face = (x: number, y: number, s: number, score = 0.9) => ({ x: x - s / 2, y: y - s / 2, w: s, h: s, score });

describe('primaryTrack', () => {
  it('picks the larger, more persistent face', () => {
    const frames = Array.from({ length: 50 }, (_, i) => ({
      t: i * 0.2,
      faces: i % 5 === 0 ? [face(0.7, 0.4, 0.2), face(0.2, 0.5, 0.25)] : [face(0.7, 0.4, 0.2)],
    }));
    const pts = primaryTrack({ interval: 0.2, frames, sceneCuts: [] })!;
    expect(pts.length).toBe(50);
    expect(pts.every((p) => Math.abs(p.x - 0.7) < 1e-9)).toBe(true);
  });

  it('follows one face as it moves', () => {
    const frames = Array.from({ length: 30 }, (_, i) => ({ t: i * 0.2, faces: [face(0.3 + i * 0.01, 0.4, 0.2)] }));
    const pts = primaryTrack({ interval: 0.2, frames, sceneCuts: [] })!;
    expect(pts.length).toBe(30);
  });

  it('returns null when there are no faces', () => {
    const a: FaceAnalysis = { interval: 0.2, frames: [{ t: 0, faces: [] }], sceneCuts: [] };
    expect(primaryTrack(a)).toBeNull();
  });
});

describe('camera path', () => {
  it('interpolates targets and holds through long gaps', () => {
    const pts = [
      { t: 0, x: 0.2, y: 0.5, w: 0.1, h: 0.2 },
      { t: 1, x: 0.4, y: 0.5, w: 0.1, h: 0.2 },
      { t: 5, x: 0.8, y: 0.5, w: 0.1, h: 0.2 },
    ];
    expect(targetAt(pts, 0.5).x).toBeCloseTo(0.3);
    expect(targetAt(pts, 3).x).toBeCloseTo(0.4);
    expect(targetAt(pts, 9).x).toBeCloseTo(0.8);
  });

  it('spring settles on the goal without overshoot', () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 300; i++) {
      [x, v] = springStep(x, v, 1, 4, 1 / 30);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(1, 4);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('ignores jitter inside the deadzone', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ t: i * 0.2, x: 0.5 + (i % 2 ? 0.01 : -0.01), y: 0.5, w: 0.1, h: 0.2 }));
    const path = buildCameraPath(pts, 10, [], { deadzoneX: 0.03, deadzoneY: 0.03 });
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of path.xs) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    expect(hi - lo).toBeLessThan(0.001);
  });

  it('moves smoothly to a new position and settles there', () => {
    const pts = [
      { t: 0, x: 0.3, y: 0.5, w: 0.1, h: 0.2 },
      { t: 2, x: 0.3, y: 0.5, w: 0.1, h: 0.2 },
      { t: 2.2, x: 0.7, y: 0.5, w: 0.1, h: 0.2 },
      { t: 8, x: 0.7, y: 0.5, w: 0.1, h: 0.2 },
    ];
    const path = buildCameraPath(pts, 8, [], { deadzoneX: 0.03, deadzoneY: 0.03 });
    expect(cameraAt(path, 1).x).toBeCloseTo(0.3, 3);
    expect(cameraAt(path, 7.5).x).toBeCloseTo(0.7, 2);
    // no single-frame jumps: max per-frame velocity is bounded
    let maxStep = 0;
    for (let i = 1; i < path.xs.length; i++) maxStep = Math.max(maxStep, Math.abs(path.xs[i]! - path.xs[i - 1]!));
    expect(maxStep).toBeLessThan(0.03);
  });

  it('never lets a fast-moving face leave the frame', () => {
    // Crosses 40% of the frame in one second: a spring alone lags far behind.
    const pts = Array.from({ length: 41 }, (_, i) => ({ t: i * 0.1, x: 0.3 + Math.min(1, i / 10) * 0.4, y: 0.5, w: 0.12, h: 0.21 }));
    const halfW = 0.316 / 2 / 1.35;
    const path = buildCameraPath(pts, 4, [], { deadzoneX: 0.03, deadzoneY: 0.03, halfW, halfH: 0.37 });
    for (let t = 0; t <= 4; t += 1 / 30) {
      const cam = cameraAt(path, t);
      const face = targetAt(pts, t);
      expect(face.x - face.w / 2).toBeGreaterThanOrEqual(cam.x - halfW - 1e-3);
      expect(face.x + face.w / 2).toBeLessThanOrEqual(cam.x + halfW + 1e-3);
    }
  });

  it('cuts instead of panning at a scene cut', () => {
    const pts = [
      { t: 0, x: 0.2, y: 0.5, w: 0.1, h: 0.2 },
      { t: 3, x: 0.2, y: 0.5, w: 0.1, h: 0.2 },
      { t: 3.01, x: 0.8, y: 0.5, w: 0.1, h: 0.2 },
      { t: 6, x: 0.8, y: 0.5, w: 0.1, h: 0.2 },
    ];
    const path = buildCameraPath(pts, 6, [3.1], { deadzoneX: 0.03, deadzoneY: 0.03 });
    expect(cameraAt(path, 3.2).x).toBeCloseTo(0.8, 2);
  });
});

describe('crop', () => {
  it('fits the output aspect inside the source', () => {
    expect(baseCrop(1920, 1080, '9:16')).toEqual({ w: 607.5, h: 1080 });
    expect(baseCrop(1080, 1920, '16:9')).toEqual({ w: 1080, h: 607.5 });
    expect(baseCrop(1920, 1080, '16:9')).toEqual({ w: 1920, h: 1080 });
  });

  it('clamps the crop to the frame', () => {
    const r = cropRect(1920, 1080, '9:16', 0.99, 0.5);
    expect(r.x + r.w).toBeCloseTo(1920);
    const l = cropRect(1920, 1080, '9:16', 0, 0.5);
    expect(l.x).toBe(0);
  });

  it('zooms around the centre', () => {
    const r = cropRect(1920, 1080, '9:16', 0.5, 0.5, 1.2);
    expect(r.h).toBeCloseTo(900);
    expect(r.y).toBeCloseTo(90);
  });

  it('scales the deadzone with the crop', () => {
    const dz = deadzoneFor(1920, 1080, '9:16');
    expect(dz.deadzoneX).toBeCloseTo((0.09 * 607.5) / 1920);
    expect(dz.halfW).toBeCloseTo(607.5 / 1920 / 2 / 1.35);
  });
});
