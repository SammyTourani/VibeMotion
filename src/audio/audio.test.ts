import { describe, expect, it } from 'vitest';
import { integratedLoudness, kWeighting, normalizationGain } from './lufs';
import { dbToLin, limitTruePeak, linToDb, truePeak } from './limiter';
import { spliceSegments } from './splice';
import { duckingEnvelope, mixMusic, speechRegions } from './duck';
import { concat, sine } from '../test/signals';

describe('K-weighting', () => {
  it('matches the BS.1770 reference coefficients at 48 kHz', () => {
    const [shelf, hp] = kWeighting(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 8);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 8);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 8);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 8);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 8);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 8);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 8);
  });
});

describe('integrated loudness', () => {
  it('reads a stereo -20 dBFS 997 Hz sine at -20 LUFS', () => {
    const s = sine(997, 5, 48000, dbToLin(-20));
    expect(integratedLoudness([s, s], 48000)).toBeCloseTo(-20, 1);
  });

  it('reads a mono 0 dBFS 997 Hz sine at -3.01 LUFS (EBU Tech 3341)', () => {
    const s = sine(997, 5, 48000, 1);
    expect(integratedLoudness([s], 48000)).toBeCloseTo(-3.01, 1);
  });

  it('works at 44.1 kHz too', () => {
    const s = sine(997, 5, 44100, dbToLin(-20));
    expect(integratedLoudness([s, s], 44100)).toBeCloseTo(-20, 1);
  });

  it('gates out silence', () => {
    const tone = sine(997, 5, 48000, dbToLin(-20));
    const x = concat(tone, new Float32Array(48000 * 5));
    // The silent blocks are gated. The three 400 ms blocks straddling the
    // tone's end hold 75/50/25% of it and pass the relative gate, as the
    // standard specifies: mean energy 48.5/50 of the tone -> -20.13 LUFS.
    expect(integratedLoudness([x, x], 48000)).toBeCloseTo(-20 + 10 * Math.log10(48.5 / 50), 2);
  });

  it('computes the normalization gain to -14 LUFS', () => {
    expect(linToDb(normalizationGain(-20))).toBeCloseTo(6);
    expect(normalizationGain(-Infinity)).toBe(1);
    expect(linToDb(normalizationGain(-60))).toBeCloseTo(20);
  });
});

describe('true peak', () => {
  it('sees the inter-sample peak a sample peak misses', () => {
    // fs/4 sine at 45 degrees: every sample is at 0.707, the waveform peaks at 1.0
    const s = sine(12000, 0.1, 48000, 1, Math.PI / 4);
    let samplePeak = 0;
    for (const v of s) samplePeak = Math.max(samplePeak, Math.abs(v));
    expect(samplePeak).toBeCloseTo(Math.SQRT1_2, 3);
    expect(linToDb(truePeak([s]))).toBeGreaterThan(-0.3);
  });
});

describe('limiter', () => {
  it('keeps the true peak under -1 dBTP', () => {
    const fs = 48000;
    const loud = sine(440, 1, fs, dbToLin(4));
    const burst = sine(3000, 0.3, fs, dbToLin(6));
    const x = concat(sine(200, 0.5, fs, 0.3), loud, burst, sine(200, 0.5, fs, 0.3));
    const y = x.slice();
    const reduction = limitTruePeak([y], fs, { ceilingDb: -1 });
    expect(reduction).toBeLessThan(-4);
    expect(linToDb(truePeak([y]))).toBeLessThanOrEqual(-1 + 0.05);
  });

  it('leaves quiet audio untouched', () => {
    const x = sine(440, 0.5, 48000, 0.2);
    const y = x.slice();
    expect(limitTruePeak([y], 48000)).toBe(0);
    expect(y).toEqual(x);
  });

  it('recovers after a peak (release)', () => {
    const fs = 48000;
    const x = concat(sine(440, 0.1, fs, 2), sine(440, 1, fs, 0.3));
    const y = x.slice();
    limitTruePeak([y], fs, { ceilingDb: -1, release: 0.05 });
    // well after the peak, the quiet part is back at (near) unity gain
    const rms = (a: Float32Array) => {
      let acc = 0;
      for (let i = Math.round(0.7 * fs); i < Math.round(0.9 * fs); i++) acc += a[i]! * a[i]!;
      return Math.sqrt(acc);
    };
    expect(rms(y) / rms(x)).toBeGreaterThan(0.95);
  });
});

describe('splice', () => {
  const fs = 48000;

  it('produces exactly the EDL duration', () => {
    const src = sine(300, 10, fs, 0.5);
    const segs = [
      { pcm: [src], pcmStart: 0, start: 1, end: 2.5 },
      { pcm: [src], pcmStart: 0, start: 4, end: 5.25 },
    ];
    const out = spliceSegments(segs, fs, 1);
    expect(out[0]!.length).toBe(Math.round(2.75 * fs));
  });

  it('joins without clicks', () => {
    // Two segments with a phase jump at the join: without a crossfade this clicks.
    const src = sine(440, 10, fs, 0.8);
    const segs = [
      { pcm: [src], pcmStart: 0, start: 1, end: 2.0003 },
      { pcm: [src], pcmStart: 0, start: 5.0011, end: 6 },
    ];
    const out = spliceSegments(segs, fs, 1)[0]!;
    // largest sample-to-sample step anywhere must stay near a clean 440 Hz sine's
    const cleanStep = 0.8 * 2 * Math.PI * (440 / fs);
    let maxStep = 0;
    for (let i = 1; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(out[i]! - out[i - 1]!));
    expect(maxStep).toBeLessThan(cleanStep * 2);
  });

  it('upmixes mono to the requested channel count', () => {
    const src = sine(300, 2, fs, 0.5);
    const out = spliceSegments([{ pcm: [src], pcmStart: 0, start: 0, end: 1 }], fs, 2);
    expect(out.length).toBe(2);
    expect(out[1]![1000]).toBe(out[0]![1000]);
  });
});

describe('ducking', () => {
  it('merges close words into speech regions', () => {
    expect(speechRegions([
      { start: 0, end: 1 },
      { start: 1.2, end: 2 },
      { start: 3, end: 4 },
    ])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('dips during speech and recovers in gaps', () => {
    const fs = 1000;
    const env = duckingEnvelope(6000, fs, [{ start: 2, end: 3 }], { duckDb: -12, attack: 0.05, release: 0.2 });
    expect(env[1000]).toBeCloseTo(1, 3);
    expect(linToDb(env[2900]!)).toBeCloseTo(-12, 0);
    expect(env[5900]).toBeGreaterThan(0.95);
  });

  it('mixes a looped, faded music bed into the voice', () => {
    const fs = 1000;
    const voice = [new Float32Array(4000)];
    const music = [new Float32Array(1000).fill(0.5)];
    mixMusic(voice, music, fs, [], { volumeDb: -6, duck: false, fadeIn: 1, fadeOut: 1 });
    expect(voice[0]![0]).toBe(0);
    expect(voice[0]![2000]).toBeCloseTo(0.5 * dbToLin(-6), 5);
    expect(voice[0]![3999]).toBeLessThan(0.01);
  });
});
