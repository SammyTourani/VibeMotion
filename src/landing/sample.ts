// The landing page replays the sample clip with the editor's own engine.
// sample-data.json holds what the models produced (Whisper's words, the VAD
// pauses, the tracked face); the EDL, camera path and captions below are
// computed from it at runtime by the same code the editor and export use.
// Regenerate with scripts/make-landing-data.mjs.

import data from './sample-data.json';
import { buildEdl } from '../edit/edl';
import { findFillers } from '../edit/fillers';
import { buildCameraPath, type TrackPoint } from '../reframe/track';
import { deadzoneFor } from '../reframe/crop';
import { captionWords } from '../captions/words';
import type { FrameSettings, Word } from '../project/types';
import type { FrameSpec } from '../render/compose';

export const SAMPLE_SRC = data.source;
export const words: Word[] = data.words;
export const fillerIds = findFillers(words, data.fillers);

export const edl = buildEdl({
  duration: data.source.duration,
  words,
  wordEdits: {},
  fillerIds,
  silences: data.silences,
  padding: data.padding,
  untranscribed: [],
  rangeOps: [],
});

const track: TrackPoint[] = data.face.map(([t, x, y, w, h]) => ({ t: t!, x: x!, y: y!, w: w!, h: h! }));
export const facePath = track;
export const camera = buildCameraPath(track, data.source.duration, data.sceneCuts, deadzoneFor(data.source.width, data.source.height, '9:16'));

export const capWords = captionWords(words, edl, {}, []);

export const frame: FrameSettings = {
  aspect: '9:16',
  mode: 'auto',
  manualX: 0.5,
  manualY: 0.5,
  punchIn: true,
  punchAmount: 1.12,
};

export function sampleSpec(outW = 1080, outH = 1920): FrameSpec {
  return { srcW: data.source.width, srcH: data.source.height, outW, outH, aspect: '9:16', frame, camera };
}

export const peaks = data.peaks;
export const peaksPerSecond = data.peaksPerSecond;

/** Seconds cut, and how many fillers went, for the copy. */
export const stats = {
  source: data.source.duration,
  output: edl.outDuration,
  cut: data.source.duration - edl.outDuration,
  fillers: edl.wordStatus.filter((s) => s === 'filler').length,
  pauses: data.silences.length,
};

export const BASE = import.meta.env.BASE_URL;
export const SAMPLE_VIDEO = `${BASE}sample/sample.mp4`;
export const SAMPLE_POSTER = `${BASE}sample/poster.jpg`;
export const SAMPLE_WIDE = `${BASE}sample/frame-wide.jpg`;
