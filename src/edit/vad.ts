// Energy-based voice activity detection on the 16 kHz mono signal.
//
// Loudness is measured in 20 ms frames (dBFS). The threshold adapts to the
// recording: it sits a margin above the noise floor (a low percentile of the
// frame energies), capped below the typical speech level so that noisy rooms
// still split into speech and pauses.

import type { Interval } from '../project/types';

export const FRAME_SEC = 0.02;
const FLOOR_DB = -100;

export function frameDb(samples: Float32Array, sampleRate: number, frameSec = FRAME_SEC): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate * frameSec));
  const n = Math.ceil(samples.length / hop);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const a = f * hop;
    const b = Math.min(samples.length, a + hop);
    let acc = 0;
    for (let i = a; i < b; i++) {
      const s = samples[i]!;
      acc += s * s;
    }
    const ms = acc / Math.max(1, b - a);
    out[f] = ms > 0 ? Math.max(FLOOR_DB, 10 * Math.log10(ms)) : FLOOR_DB;
  }
  return out;
}

export function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return FLOOR_DB;
  const sorted = Float32Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}

export interface VadThreshold {
  noiseFloor: number;
  speechLevel: number;
  threshold: number;
}

/**
 * margin: dB above the noise floor that counts as sound (the "sensitivity"
 * setting; lower = more is treated as sound, so fewer cuts).
 */
export function adaptiveThreshold(db: Float32Array, margin = 12): VadThreshold {
  const noiseFloor = Math.max(-90, percentile(db, 0.1));
  const speechLevel = percentile(db, 0.9);
  let threshold = noiseFloor + margin;
  // Never demand more than "speech minus 10 dB": in noisy recordings the
  // floor sits close to speech and a fixed margin would call everything
  // silence.
  threshold = Math.min(threshold, speechLevel - 10);
  // ...but keep at least 3 dB above the floor so hiss is never "speech".
  threshold = Math.max(threshold, noiseFloor + 3);
  return { noiseFloor, speechLevel, threshold };
}

export interface SilenceOptions {
  minSilence: number;
  threshold: number;
  frameSec?: number;
  /** Voiced blips shorter than this inside a pause are ignored (clicks). */
  maxBlip?: number;
}

/** Pauses of at least minSilence seconds, in seconds. */
export function detectSilences(db: Float32Array, opts: SilenceOptions): Interval[] {
  const frameSec = opts.frameSec ?? FRAME_SEC;
  const maxBlipFrames = Math.round((opts.maxBlip ?? 0.06) / frameSec);
  const voiced = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) voiced[i] = db[i]! > opts.threshold ? 1 : 0;

  // Remove short voiced blips surrounded by silence.
  let i = 0;
  while (i < voiced.length) {
    if (voiced[i]) {
      let j = i;
      while (j < voiced.length && voiced[j]) j++;
      const len = j - i;
      const silentBefore = i === 0 || !voiced[i - 1];
      const silentAfter = j === voiced.length || !voiced[j];
      if (len <= maxBlipFrames && silentBefore && silentAfter && i > 0 && j < voiced.length) {
        voiced.fill(0, i, j);
      }
      i = j;
    } else {
      i++;
    }
  }

  const out: Interval[] = [];
  i = 0;
  while (i < voiced.length) {
    if (!voiced[i]) {
      let j = i;
      while (j < voiced.length && !voiced[j]) j++;
      const start = i * frameSec;
      const end = j * frameSec;
      if (end - start >= opts.minSilence - 1e-9) out.push({ start, end });
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

/** Seconds of voiced audio inside [start, end). */
export function voicedDuration(db: Float32Array, threshold: number, start: number, end: number, frameSec = FRAME_SEC): number {
  const a = Math.max(0, Math.floor(start / frameSec));
  const b = Math.min(db.length, Math.ceil(end / frameSec));
  let n = 0;
  for (let i = a; i < b; i++) if (db[i]! > threshold) n++;
  return n * frameSec;
}

/** The voiced span inside [start, end), or null. */
export function voicedSpan(db: Float32Array, threshold: number, start: number, end: number, frameSec = FRAME_SEC): Interval | null {
  const a = Math.max(0, Math.floor(start / frameSec));
  const b = Math.min(db.length, Math.ceil(end / frameSec));
  let first = -1;
  let last = -1;
  for (let i = a; i < b; i++) {
    if (db[i]! > threshold) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  return { start: Math.max(start, first * frameSec), end: Math.min(end, (last + 1) * frameSec) };
}
