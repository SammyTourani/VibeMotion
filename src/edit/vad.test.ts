import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, detectSilences, frameDb, voicedDuration, voicedSpan } from './vad';
import { concat, noise, sine } from '../test/signals';

const FS = 16000;

// speech-like bursts over a quiet room-tone floor
function clip() {
  const room = (s: number) => noise(s, FS, 0.002, 7);
  const talk = (s: number) => {
    const t = sine(220, s, FS, 0.3);
    const n = noise(s, FS, 0.05, 3);
    return t.map((v, i) => v + n[i]!);
  };
  return concat(room(0.5), talk(1.0), room(0.8), talk(0.6), room(0.2), talk(0.7), room(1.2));
}

describe('vad', () => {
  it('measures 20 ms frames in dBFS', () => {
    const db = frameDb(sine(1000, 1, FS, 1), FS);
    expect(db.length).toBe(50);
    // full-scale sine: mean square 0.5 = -3.01 dBFS
    expect(db[10]).toBeCloseTo(-3.01, 1);
  });

  it('sets the threshold a margin above the noise floor, below speech', () => {
    const db = frameDb(clip(), FS);
    const th = adaptiveThreshold(db, 12);
    expect(th.noiseFloor).toBeLessThan(-45);
    expect(th.threshold).toBeGreaterThan(th.noiseFloor + 3 - 1e-6);
    expect(th.threshold).toBeLessThan(th.speechLevel - 10 + 1e-6);
  });

  it('caps the threshold in noisy recordings so speech still splits from pauses', () => {
    const noisy = concat(noise(1, FS, 0.05, 1), sine(200, 1, FS, 0.2), noise(1, FS, 0.05, 2));
    const th = adaptiveThreshold(frameDb(noisy, FS), 40);
    expect(th.threshold).toBeLessThanOrEqual(th.speechLevel - 10 + 1e-6);
  });

  it('finds pauses of at least the minimum length, and only those', () => {
    const db = frameDb(clip(), FS);
    const { threshold } = adaptiveThreshold(db, 12);
    const s = detectSilences(db, { minSilence: 0.4, threshold });
    // leading 0.5 s, the 0.8 s pause, and the trailing 1.2 s. The 0.2 s gap is too short.
    expect(s.length).toBe(3);
    expect(s[0]!.start).toBe(0);
    expect(s[0]!.end).toBeCloseTo(0.5, 1);
    expect(s[1]!.start).toBeCloseTo(1.5, 1);
    expect(s[1]!.end).toBeCloseTo(2.3, 1);
    expect(s[2]!.end).toBeCloseTo(clip().length / FS, 1);
  });

  it('ignores a click inside a pause', () => {
    const x = concat(noise(0.5, FS, 0.002, 1), sine(1000, 0.02, FS, 0.8), noise(0.6, FS, 0.002, 2), sine(300, 0.5, FS, 0.3));
    const db = frameDb(x, FS);
    const s = detectSilences(db, { minSilence: 0.4, threshold: -40 });
    expect(s[0]!.start).toBe(0);
    expect(s[0]!.end).toBeGreaterThan(1.0);
  });

  it('reports voiced time and span inside a range', () => {
    const db = frameDb(clip(), FS);
    const { threshold } = adaptiveThreshold(db, 12);
    expect(voicedDuration(db, threshold, 0, 0.5)).toBe(0);
    expect(voicedDuration(db, threshold, 0.5, 1.5)).toBeGreaterThan(0.9);
    const span = voicedSpan(db, threshold, 0.2, 1.8)!;
    expect(span.start).toBeCloseTo(0.5, 1);
    expect(span.end).toBeCloseTo(1.5, 1);
    expect(voicedSpan(db, threshold, 1.6, 2.2)).toBeNull();
  });
});
