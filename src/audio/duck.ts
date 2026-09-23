// Background music under speech: the music dips while someone is talking
// (known exactly from the word timestamps, not guessed from levels) and comes
// back up in the gaps, with gentle attack/release so it never pumps.

import type { Interval } from '../project/types';
import { normalize } from '../edit/intervals';

/** Speech regions from word times, merging gaps shorter than mergeGap. */
export function speechRegions(words: readonly Interval[], mergeGap = 0.35): Interval[] {
  const merged = normalize(words.map((w) => ({ start: w.start, end: w.end })));
  const out: Interval[] = [];
  for (const r of merged) {
    const last = out[out.length - 1];
    if (last && r.start - last.end < mergeGap) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export interface DuckOptions {
  /** dB applied to the music during speech. */
  duckDb?: number;
  /** Seconds the dip starts before the first word. */
  lead?: number;
  attack?: number;
  release?: number;
}

/** Per-sample linear gain for the music bed. */
export function duckingEnvelope(n: number, fs: number, speech: readonly Interval[], opts: DuckOptions = {}): Float32Array {
  const duck = 10 ** ((opts.duckDb ?? -12) / 20);
  const lead = opts.lead ?? 0.1;
  const att = 1 - Math.exp(-1 / ((opts.attack ?? 0.12) * fs));
  const rel = 1 - Math.exp(-1 / ((opts.release ?? 0.5) * fs));
  const target = new Float32Array(n).fill(1);
  for (const r of speech) {
    const a = Math.max(0, Math.floor((r.start - lead) * fs));
    const b = Math.min(n, Math.ceil(r.end * fs));
    target.fill(duck, a, b);
  }
  const env = new Float32Array(n);
  let g = target[0] ?? 1;
  for (let i = 0; i < n; i++) {
    const tg = target[i]!;
    g += (tg - g) * (tg < g ? att : rel);
    env[i] = g;
  }
  return env;
}

export interface MusicMix {
  /** Music level in dB when nobody is talking. */
  volumeDb: number;
  duck: boolean;
  fadeIn: number;
  fadeOut: number;
}

/**
 * Adds a music bed (looped to length) into `voice`, in place. `music` may
 * have any channel count; it is mapped onto the voice channels.
 */
export function mixMusic(
  voice: Float32Array[],
  music: readonly Float32Array[],
  fs: number,
  speech: readonly Interval[],
  mix: MusicMix,
): void {
  const n = voice[0]?.length ?? 0;
  const mlen = music[0]?.length ?? 0;
  if (n === 0 || mlen === 0) return;
  const base = 10 ** (mix.volumeDb / 20);
  const env = mix.duck ? duckingEnvelope(n, fs, speech) : null;
  const fin = Math.max(0, Math.round(mix.fadeIn * fs));
  const fout = Math.max(0, Math.round(mix.fadeOut * fs));
  for (let ch = 0; ch < voice.length; ch++) {
    const v = voice[ch]!;
    const m = music[Math.min(ch, music.length - 1)]!;
    for (let i = 0; i < n; i++) {
      let g = base * (env ? env[i]! : 1);
      if (i < fin) g *= i / fin;
      if (i >= n - fout) g *= (n - i) / fout;
      v[i] = v[i]! + m[i % mlen]! * g;
    }
  }
}
