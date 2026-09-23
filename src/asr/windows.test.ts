import { describe, expect, it } from 'vitest';
import { planWindows, refineWords } from './windows';
import { frameDb } from '../edit/vad';
import { concat, noise, sine } from '../test/signals';
import type { Word } from '../project/types';

const FS = 16000;
const talk = (s: number, seed: number) => {
  const t = sine(180 + seed * 7, s, FS, 0.25);
  const n = noise(s, FS, 0.05, seed);
  return t.map((v, i) => v + n[i]!);
};
const quiet = (s: number, seed: number) => noise(s, FS, 0.002, seed);

describe('planWindows', () => {
  it('uses one window for short audio', () => {
    expect(planWindows(new Float32Array(10), 20)).toEqual([{ start: 0, end: 20 }]);
  });

  it('splits long audio at quiet points, never over 30 s', () => {
    // 70 s of speech with pauses at 13-14 s, 27-28 s, 44-45 s and 58-59 s
    const x = concat(
      talk(13, 1), quiet(1, 2), talk(13, 3), quiet(1, 4), talk(16, 5), quiet(1, 6), talk(13, 7), quiet(1, 8), talk(11, 9),
    );
    const total = x.length / FS;
    const wins = planWindows(frameDb(x, FS), total);
    const pauses = [
      [13, 14],
      [27, 28],
      [44, 45],
      [58, 59],
    ];
    expect(wins[0]!.start).toBe(0);
    expect(wins[wins.length - 1]!.end).toBeCloseTo(total, 5);
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i]!;
      expect(w.end - w.start).toBeLessThanOrEqual(30 + 1e-9);
      if (i > 0) expect(w.start).toBe(wins[i - 1]!.end);
      if (i < wins.length - 1) {
        // every internal boundary falls inside a pause
        expect(pauses.some(([a, b]) => w.end > a! && w.end < b!)).toBe(true);
      }
    }
  });
});

describe('refineWords', () => {
  const W = (id: string, start: number, end: number): Word => ({ id, text: id, start, end });

  it('pulls a word end back out of the following pause', () => {
    const out = refineWords([W('a', 1, 4)], [{ start: 1.8, end: 4 }], () => 0.5);
    expect(out[0]!.end).toBeCloseTo(1.86);
  });

  it('moves a word start forward out of the preceding pause', () => {
    const out = refineWords([W('a', 1, 3)], [{ start: 0.5, end: 2 }], () => 0.5);
    expect(out[0]!.start).toBeCloseTo(1.96);
  });

  it('drops words that sit entirely in silence (hallucinations)', () => {
    const out = refineWords([W('a', 1, 2), W('thanks', 5, 6)], [{ start: 4, end: 7 }], (s) => (s > 4 ? 0 : 1));
    expect(out.map((w) => w.id)).toEqual(['a']);
  });
});
