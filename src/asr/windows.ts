// Splits audio into windows of at most 30 s (Whisper's context) at the
// quietest point available, so no word is ever split between two windows.
// Windows are transcribed one after another, which gives honest progress
// (window i of n), a clean cancel point, and bounded memory on long files.

import type { Interval, Word } from '../project/types';
import { FRAME_SEC } from '../edit/vad';

export interface WindowPlan {
  start: number;
  end: number;
}

export function smoothDb(db: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(db.length);
  let acc = 0;
  let count = 0;
  // running mean over [i - radius, i + radius]
  for (let i = 0; i < Math.min(db.length, radius); i++) {
    acc += db[i]!;
    count++;
  }
  for (let i = 0; i < db.length; i++) {
    const add = i + radius;
    if (add < db.length) {
      acc += db[add]!;
      count++;
    }
    const drop = i - radius - 1;
    if (drop >= 0) {
      acc -= db[drop]!;
      count--;
    }
    out[i] = acc / count;
  }
  return out;
}

export function planWindows(
  db: Float32Array,
  totalSec: number,
  opts: { maxSec?: number; minSec?: number; frameSec?: number } = {},
): WindowPlan[] {
  const maxSec = opts.maxSec ?? 30;
  const minSec = opts.minSec ?? 12;
  const frameSec = opts.frameSec ?? FRAME_SEC;
  if (totalSec <= maxSec) return [{ start: 0, end: totalSec }];

  // Quiet = low energy over ~300 ms, not a single quiet frame mid-word.
  const smooth = smoothDb(db, Math.max(1, Math.round(0.15 / frameSec)));
  const out: WindowPlan[] = [];
  let pos = 0;
  while (totalSec - pos > maxSec) {
    const lo = Math.ceil((pos + minSec) / frameSec);
    const hi = Math.min(smooth.length - 1, Math.floor((pos + maxSec - 0.25) / frameSec));
    let best = hi;
    let bestScore = Infinity;
    for (let i = lo; i <= hi; i++) {
      // Slight preference for later cut points: fewer, longer windows.
      const score = smooth[i]! - (1.5 * (i - lo)) / Math.max(1, hi - lo);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const cut = Math.min(totalSec, (best + 0.5) * frameSec);
    out.push({ start: pos, end: cut });
    pos = cut;
  }
  out.push({ start: pos, end: totalSec });
  return out;
}

/**
 * Whisper's word timestamps are good but loose at the edges: the last word
 * of a window often stretches to the end of the audio, and words can start
 * inside the preceding pause. Snap word edges out of detected pauses so
 * silence removal can do its job, and drop words that sit entirely in
 * silence (Whisper's classic "Thank you." hallucination).
 */
export function refineWords(
  words: readonly Word[],
  silences: readonly Interval[],
  voicedIn: (start: number, end: number) => number,
): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    let { start, end } = w;
    for (const s of silences) {
      if (s.end <= start || s.start >= end) continue;
      // Pause swallowing the tail of the word: end where the pause begins.
      if (s.start > start + 0.05 && s.end >= end - 0.02) end = Math.max(start + 0.05, s.start + 0.06);
      // Word "starting" inside the pause before it: start where sound begins.
      else if (s.start <= start + 0.02 && s.end < end - 0.05) start = Math.min(end - 0.05, s.end - 0.04);
    }
    const inside = silences.some((s) => s.start <= start + 0.01 && s.end >= end - 0.01);
    if (inside && voicedIn(start, end) < 0.02) continue;
    out.push(start === w.start && end === w.end ? w : { ...w, start, end });
  }
  return out;
}
