// Everything computed from the project: the EDL, caption words, the camera
// path. Each function is memoized on its (immutable) inputs, so React
// components can call them freely on every render.

import { buildEdl, untranscribedSounds, type Edl } from '../edit/edl';
import { adaptiveThreshold, detectSilences, voicedSpan } from '../edit/vad';
import { findFillers } from '../edit/fillers';
import { captionWords } from '../captions/words';
import type { CaptionWord } from '../captions/layout';
import { buildCameraPath, primaryTrack, type CameraPath } from '../reframe/track';
import { deadzoneFor, OUTPUT_SIZES } from '../reframe/crop';
import type { Aspect, FaceAnalysis, Interval, Project, RangeOp, Word } from '../project/types';
import type { FrameSpec } from '../render/compose';
import { useEditor, type Analysis } from './store';

function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let prev: A | null = null;
  let value: R;
  return (...args: A) => {
    if (prev && prev.length === args.length && prev.every((x, i) => Object.is(x, args[i]))) return value;
    prev = args;
    value = fn(...args);
    return value;
  };
}

const NO_WORDS: Word[] = [];
const NO_INTERVALS: Interval[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

export const vadFor = memo((db: Float32Array, sensitivity: number) => adaptiveThreshold(db, sensitivity));

export const silencesFor = memo((db: Float32Array, threshold: number, minSilence: number) =>
  detectSilences(db, { minSilence, threshold }),
);

export const fillersFor = memo((words: readonly Word[], fillers: readonly string[], on: boolean) =>
  on ? findFillers(words, fillers) : NO_IDS,
);

const untranscribedFor = memo(
  (words: readonly Word[], duration: number, db: Float32Array, threshold: number, on: boolean): Interval[] =>
    on ? untranscribedSounds(words, duration, (s, e) => voicedSpan(db, threshold, s, e)) : NO_INTERVALS,
);

const buildFor = (
  duration: number,
  words: readonly Word[],
  wordEdits: Readonly<Record<string, 'cut' | 'keep'>>,
  fillerIds: ReadonlySet<string>,
  silences: readonly Interval[],
  padding: number,
  untranscribed: readonly Interval[],
  rangeOps: readonly RangeOp[],
  clip: Interval | null,
) => buildEdl({ duration, words, wordEdits, fillerIds, silences, padding, untranscribed, rangeOps, clip });
const edlFor = memo(buildFor);
// A second cache for the EDL ignoring the chosen clip, so asking for both
// doesn't make them evict each other.
const fullEdlFor = memo(buildFor);

/** The EDL; `withClip: false` ignores the chosen clip (the whole video). */
export function deriveEdl(p: Project, a: Analysis | null, withClip = true): Edl {
  const words = p.transcript?.words ?? NO_WORDS;
  const t = p.tighten;
  const vad = a ? vadFor(a.db, t.sensitivity) : null;
  const silences = a && vad && t.removeSilences ? silencesFor(a.db, vad.threshold, t.minSilence) : NO_INTERVALS;
  const fillerIds = fillersFor(words, t.fillers, t.removeFillers);
  const unt = a && vad ? untranscribedFor(words, p.source.duration, a.db, vad.threshold, t.cutUntranscribed) : NO_INTERVALS;
  const clip = withClip ? (p.clip ?? null) : null;
  return (withClip ? edlFor : fullEdlFor)(p.source.duration, words, p.wordEdits, fillerIds, silences, t.padding, unt, p.rangeOps, clip);
}

/** All pauses VAD found, regardless of settings (for the timeline and transcript). */
export function derivePauses(p: Project, a: Analysis | null): Interval[] {
  if (!a) return NO_INTERVALS;
  const vad = vadFor(a.db, p.tighten.sensitivity);
  return silencesFor(a.db, vad.threshold, p.tighten.minSilence);
}

const captionWordsFor = memo(
  (words: readonly Word[], edl: Edl, fixes: Readonly<Record<string, string>>, emphasized: readonly string[]) =>
    captionWords(words, edl, fixes, emphasized),
);

export function deriveCaptionWords(p: Project, edl: Edl): CaptionWord[] {
  return captionWordsFor(p.transcript?.words ?? NO_WORDS, edl, p.textFixes, p.captions.emphasized);
}

const cameraFor = memo(
  (faces: FaceAnalysis | null, duration: number, srcW: number, srcH: number, aspect: Aspect): CameraPath | null => {
    if (!faces) return null;
    const pts = primaryTrack(faces);
    if (!pts) return null;
    return buildCameraPath(pts, duration, faces.sceneCuts, deadzoneFor(srcW, srcH, aspect));
  },
);

export function deriveCamera(p: Project): CameraPath | null {
  return cameraFor(p.faces, p.source.duration, p.source.width, p.source.height, p.frame.aspect);
}

/** Whether face tracking found anyone (null while unknown). */
export function faceFound(p: Project): boolean | null {
  if (!p.faces) return null;
  return p.faces.frames.some((f) => f.faces.length > 0);
}

export function outputSize(aspect: Aspect, scale = 1): { w: number; h: number } {
  const s = OUTPUT_SIZES[aspect];
  // Even dimensions keep every H.264 encoder happy.
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  return { w: even(s.w), h: even(s.h) };
}

export function frameSpec(p: Project, scale = 1): FrameSpec {
  const out = outputSize(p.frame.aspect, scale);
  return {
    srcW: p.source.width,
    srcH: p.source.height,
    outW: out.w,
    outH: out.h,
    aspect: p.frame.aspect,
    frame: p.frame,
    camera: deriveCamera(p),
  };
}

// ---- hooks ----

export function useProject(): Project | null {
  return useEditor((s) => s.history?.present ?? null);
}

export function useEdl(): Edl | null {
  const p = useProject();
  const a = useEditor((s) => s.analysis);
  return p ? deriveEdl(p, a) : null;
}
