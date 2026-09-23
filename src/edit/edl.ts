// The edit decision list: which parts of the source survive, and how source
// time maps to output time. Pure and deterministic, so the preview, the
// export, the captions and the tests all agree on every cut.
//
// Cuts come from, in order:
//   1. pauses (VAD) longer than the minimum, shortened to `padding` a side
//   2. words: auto-detected fillers and words the user struck through
//   3. voiced sounds between words that Whisper skipped (optional)
//   4. timeline cuts/restores, applied in the order the user made them
// Finally every kept word is protected: no cut ever lands inside one.

import type { Interval, RangeOp, Word } from '../project/types';
import { clampTo, complement, normalize, overlap, subtract, union } from './intervals';

/** Cuts shorter than this are not worth a jump cut. */
export const MIN_CUT = 0.03;
/** Kept slivers shorter than this (with no word in them) are dropped. */
export const MIN_KEEP = 0.08;

export type WordStatus = 'kept' | 'filler' | 'deleted' | 'removed';

export interface EdlInput {
  duration: number;
  words: readonly Word[];
  wordEdits: Readonly<Record<string, 'cut' | 'keep'>>;
  /** Auto-detected fillers (only pass these when filler removal is on). */
  fillerIds: ReadonlySet<string>;
  /** Detected pauses (only pass these when silence removal is on). */
  silences: readonly Interval[];
  padding: number;
  /** Voiced spans between words to cut (only when that option is on). */
  untranscribed: readonly Interval[];
  rangeOps: readonly RangeOp[];
}

export interface Edl {
  duration: number;
  kept: Interval[];
  cuts: Interval[];
  outStarts: number[];
  outDuration: number;
  /** Per word index. */
  wordStatus: WordStatus[];
  srcToOut(t: number): number;
  outToSrc(t: number): number;
  /** Index of the kept segment containing source time t, or -1. */
  segmentAtSrc(t: number): number;
  /** Index of the kept segment playing at output time t. */
  segmentAtOut(t: number): number;
  /** If t is inside a cut, where playback resumes (null at the end). */
  resumeAfter(t: number): number | null;
}

/** Word ids the EDL removes: user cuts, plus fillers the user did not keep. */
export function cutWordFlags(input: Pick<EdlInput, 'words' | 'wordEdits' | 'fillerIds'>): boolean[] {
  return input.words.map((w) => {
    const edit = input.wordEdits[w.id];
    if (edit === 'cut') return true;
    if (edit === 'keep') return false;
    return input.fillerIds.has(w.id);
  });
}

export function buildEdl(input: EdlInput): Edl {
  const { duration, words, padding } = input;
  const n = words.length;
  const isCut = cutWordFlags(input);

  let cuts: Interval[] = [];

  // 1. Pauses. A pause at the very start or end is cut right to the edge,
  //    keeping `padding` next to the speech.
  for (const s of input.silences) {
    const a = s.start <= 1e-6 ? 0 : s.start + padding;
    const b = s.end >= duration - 1e-6 ? duration : s.end - padding;
    if (b - a >= MIN_CUT) cuts.push({ start: a, end: b });
  }

  // 2. Words. A run of cut words takes the surrounding pause with it, leaving
  //    at most `padding` of pause on each side, like one natural breath.
  for (let i = 0; i < n; i++) {
    if (!isCut[i]) continue;
    let j = i;
    while (j + 1 < n && isCut[j + 1]) j++;
    const prevEnd = i > 0 ? words[i - 1]!.end : 0;
    const nextStart = j + 1 < n ? words[j + 1]!.start : duration;
    const a = Math.max(prevEnd, Math.min(words[i]!.start, prevEnd + padding));
    const b = Math.min(nextStart, Math.max(words[j]!.end, nextStart - padding));
    if (b > a) cuts.push({ start: a, end: b });
    i = j;
  }

  // 3. Untranscribed sounds.
  cuts.push(...input.untranscribed);
  cuts = normalize(cuts);

  // 4. Timeline edits, in order.
  for (const op of input.rangeOps) {
    const r = { start: Math.min(op.start, op.end), end: Math.max(op.start, op.end) };
    cuts = op.kind === 'cut' ? union(cuts, [r]) : subtract(cuts, [r]);
  }

  // Protect every kept word.
  const keptWords: Interval[] = [];
  for (let i = 0; i < n; i++) {
    if (!isCut[i]) keptWords.push({ start: words[i]!.start, end: words[i]!.end });
  }
  cuts = subtract(cuts, keptWords);
  cuts = clampTo(cuts, 0, duration).filter((c) => c.end - c.start >= MIN_CUT);

  // Drop kept slivers that hold no word; they would flash on screen.
  let kept = complement(cuts, 0, duration).filter(
    (k) => k.end - k.start >= MIN_KEEP || keptWords.some((w) => overlap(w, k) > 0),
  );
  kept = normalize(kept);
  cuts = complement(kept, 0, duration);

  const outStarts: number[] = [];
  let acc = 0;
  for (const k of kept) {
    outStarts.push(acc);
    acc += k.end - k.start;
  }
  const outDuration = acc;

  const wordStatus: WordStatus[] = words.map((w, i) => {
    const len = Math.max(1e-6, w.end - w.start);
    let inCut = 0;
    for (const c of cuts) {
      if (c.start >= w.end) break;
      inCut += overlap(c, w);
    }
    const removed = w.end - w.start <= 1e-6 ? isInside(cuts, w.start) : inCut > len * 0.5;
    if (!removed) return 'kept';
    const edit = input.wordEdits[w.id];
    if (edit === 'cut') return 'deleted';
    if (isCut[i] && input.fillerIds.has(w.id)) return 'filler';
    return 'removed';
  });

  const lastKeptAtOrBefore = (t: number): number => {
    let lo = 0;
    let hi = kept.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (kept[mid]!.start <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  const srcToOut = (t: number): number => {
    if (kept.length === 0) return 0;
    const k = lastKeptAtOrBefore(t);
    if (k < 0) return 0;
    const seg = kept[k]!;
    if (t < seg.end) return outStarts[k]! + (t - seg.start);
    return outStarts[k]! + (seg.end - seg.start);
  };

  const segmentAtOut = (t: number): number => {
    if (kept.length === 0) return -1;
    const tt = Math.min(Math.max(0, t), outDuration);
    let lo = 0;
    let hi = kept.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (outStarts[mid]! <= tt) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  const outToSrc = (t: number): number => {
    if (kept.length === 0) return 0;
    const k = segmentAtOut(t);
    const seg = kept[k]!;
    const tt = Math.min(Math.max(0, t), outDuration);
    return Math.min(seg.end, seg.start + (tt - outStarts[k]!));
  };

  const segmentAtSrc = (t: number): number => {
    const k = lastKeptAtOrBefore(t);
    if (k < 0) return -1;
    return t < kept[k]!.end ? k : -1;
  };

  const resumeAfter = (t: number): number | null => {
    if (segmentAtSrc(t) >= 0) return t;
    const k = lastKeptAtOrBefore(t);
    const next = kept[k + 1];
    return next ? next.start : null;
  };

  return {
    duration,
    kept,
    cuts,
    outStarts,
    outDuration,
    wordStatus,
    srcToOut,
    outToSrc,
    segmentAtSrc,
    segmentAtOut,
    resumeAfter,
  };
}

function isInside(list: readonly Interval[], t: number): boolean {
  for (const i of list) {
    if (t >= i.start && t < i.end) return true;
    if (i.start > t) break;
  }
  return false;
}

/**
 * Voiced sounds in the gaps between words, as cut intervals: likely fillers
 * or false starts that Whisper did not transcribe.
 */
export function untranscribedSounds(
  words: readonly Word[],
  duration: number,
  voicedSpanIn: (start: number, end: number) => Interval | null,
  opts: { minGap?: number; minVoiced?: number; pad?: number } = {},
): Interval[] {
  const minGap = opts.minGap ?? 0.25;
  const minVoiced = opts.minVoiced ?? 0.1;
  const pad = opts.pad ?? 0.04;
  const out: Interval[] = [];
  const gaps: Interval[] = [];
  let prev = 0;
  for (const w of words) {
    if (w.start - prev >= minGap) gaps.push({ start: prev, end: w.start });
    prev = Math.max(prev, w.end);
  }
  if (duration - prev >= minGap) gaps.push({ start: prev, end: duration });
  for (const g of gaps) {
    // Stay clear of the neighbouring words.
    const inner = { start: g.start + pad, end: g.end - pad };
    if (inner.end - inner.start < minVoiced) continue;
    const span = voicedSpanIn(inner.start, inner.end);
    if (span && span.end - span.start >= minVoiced) {
      out.push({ start: Math.max(inner.start, span.start - pad), end: Math.min(inner.end, span.end + pad) });
    }
  }
  return out;
}
