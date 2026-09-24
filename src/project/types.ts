// The serializable edit state. Everything the user can change lives here, so
// autosave, undo/redo and "save project" all work on the same object.

export type Aspect = '9:16' | '1:1' | '4:5' | '16:9';
export type CaptionStyleId = 'punch' | 'karaoke' | 'clean' | 'story' | 'terminal' | 'box';
export type ReframeMode = 'auto' | 'center' | 'manual';

export interface Interval {
  start: number;
  end: number;
}

export interface Word {
  /** Stable id, e.g. "w12". Edits refer to words by id. */
  id: string;
  /** Text as recognised, trimmed, punctuation attached ("Hello,"). */
  text: string;
  /** Source time in seconds. */
  start: number;
  end: number;
}

export interface Transcript {
  words: Word[];
  /** ISO 639-1 code, e.g. "en". */
  language: string;
  modelId: string;
  task: 'transcribe' | 'translate';
  createdAt: number;
}

export interface SourceMeta {
  name: string;
  size: number;
  lastModified: number;
  fingerprint: string;
  /** Seconds. */
  duration: number;
  /** Display size, after rotation metadata is applied. */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  sampleRate: number;
  channels: number;
}

export interface FaceBox {
  /** Normalised to the display frame, 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface FaceAnalysis {
  /** Seconds between samples. */
  interval: number;
  frames: { t: number; faces: FaceBox[] }[];
  /** Source times of hard scene cuts. */
  sceneCuts: number[];
}

export interface RangeOp {
  kind: 'cut' | 'restore';
  start: number;
  end: number;
}

export interface TightenSettings {
  removeSilences: boolean;
  /** Pauses at least this long (s) are shortened. */
  minSilence: number;
  /** Seconds of pause kept on each side of a silence cut. */
  padding: number;
  /** dB above the noise floor that counts as sound. */
  sensitivity: number;
  removeFillers: boolean;
  /** Filler words to remove, e.g. ["um", "uh", "you know"]. */
  fillers: string[];
  /** Cut voiced sounds between words that Whisper did not transcribe. */
  cutUntranscribed: boolean;
}

export interface CaptionSettings {
  enabled: boolean;
  style: CaptionStyleId;
  /** Multiplier on the style's base size. */
  size: number;
  /** Vertical centre of the caption block, 0 (top) .. 1 (bottom). */
  position: number;
  wordsPerLine: number;
  lines: 1 | 2;
  uppercase: boolean;
  textColor: string;
  highlightColor: string;
  /** Word ids that always use the highlight colour. */
  emphasized: string[];
}

export interface FrameSettings {
  aspect: Aspect;
  mode: ReframeMode;
  /** Manual crop centre, 0..1 of the source frame. */
  manualX: number;
  manualY: number;
  punchIn: boolean;
  /** Zoom factor on alternate segments, e.g. 1.12. */
  punchAmount: number;
}

export interface AudioSettings {
  normalize: boolean;
  music: {
    name: string;
    /** dB relative to the voice. */
    volume: number;
    duck: boolean;
    fadeIn: number;
    fadeOut: number;
  } | null;
}

export interface Project {
  version: 1;
  source: SourceMeta;
  transcript: Transcript | null;
  /** User overrides per word: struck through, or kept despite an auto cut. */
  wordEdits: Record<string, 'cut' | 'keep'>;
  /** Spelling fixes per word id. Changes caption text only. */
  textFixes: Record<string, string>;
  /** Timeline cuts and restores, applied in order. */
  rangeOps: RangeOp[];
  tighten: TightenSettings;
  captions: CaptionSettings;
  frame: FrameSettings;
  audio: AudioSettings;
  faces: FaceAnalysis | null;
  /** A chosen clip (source seconds): everything outside it is cut. */
  clip?: Interval | null;
  updatedAt: number;
}
