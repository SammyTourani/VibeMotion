import { create } from 'zustand';
import type { Interval, Project, Word } from '../project/types';
import type { ProbedMedia } from '../media/probe';
import type { VadThreshold } from '../edit/vad';
import { commit, createHistory, redo as redoH, undo as undoH, type History } from '../edit/history';
import type { AsrModelId } from '../asr/models';
import type { Capabilities } from '../lib/capabilities';

export type InspectorTab = 'tighten' | 'captions' | 'frame' | 'audio';

export interface JobState {
  state: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  label: string;
  /** 0..1, or null while indeterminate. */
  progress: number | null;
  detail?: string;
  error?: string;
}

export const IDLE: JobState = { state: 'idle', label: '', progress: null };

export interface Analysis {
  /** 16 kHz mono. */
  audio: Float32Array;
  /** 20 ms frame energies, dBFS. */
  db: Float32Array;
  vad: VadThreshold;
  /** Max |sample| per 10 ms. */
  peaks: Float32Array;
}

export interface EditorState {
  phase: 'empty' | 'opening' | 'open' | 'error';
  openError: string | null;
  file: File | null;
  url: string | null;
  media: ProbedMedia | null;
  analysis: Analysis | null;
  history: History<Project> | null;
  jobs: { audio: JobState; asr: JobState; faces: JobState };
  /** Words arriving while transcription runs. */
  liveWords: Word[] | null;
  /** A saved project for this file, offered for restore. */
  restore: { project: Project; updatedAt: number } | null;
  prefs: { model: AsrModelId; language: string; translate: boolean };
  caps: Capabilities | null;
  music: { name: string; buffer: AudioBuffer; url: string } | null;
  ui: {
    tab: InspectorTab;
    safeZone: boolean;
    emphasize: boolean;
    exportOpen: boolean;
    shortcutsOpen: boolean;
    search: string;
  };
  /** Selected word range (indices, inclusive). */
  selection: { a: number; b: number } | null;
  /** Selected timeline range (source seconds). */
  rangeSel: Interval | null;
}

export const useEditor = create<EditorState>(() => ({
  phase: 'empty',
  openError: null,
  file: null,
  url: null,
  media: null,
  analysis: null,
  history: null,
  jobs: { audio: IDLE, asr: IDLE, faces: IDLE },
  liveWords: null,
  restore: null,
  prefs: { model: 'fast', language: 'auto', translate: false },
  caps: null,
  music: null,
  ui: { tab: 'tighten', safeZone: false, emphasize: false, exportOpen: false, shortcutsOpen: false, search: '' },
  selection: null,
  rangeSel: null,
}));

export const getState = useEditor.getState;
export const setState = useEditor.setState;

export function project(): Project | null {
  return getState().history?.present ?? null;
}

/** An undoable edit. `coalesce` merges rapid repeats (slider drags) into one step. */
export function edit(recipe: (p: Project) => Project, coalesce?: string) {
  const h = getState().history;
  if (!h) return;
  const next = recipe(h.present);
  if (next === h.present) return;
  setState({ history: commit(h, { ...next, updatedAt: Date.now() }, { coalesce }) });
}

/** A change to the project's base data (transcript, face track) that isn't an edit: applied to every snapshot. */
export function setBase(patch: Partial<Project>) {
  const h = getState().history;
  if (!h) return;
  const apply = (p: Project): Project => ({ ...p, ...patch });
  setState({
    history: {
      ...h,
      present: { ...apply(h.present), updatedAt: Date.now() },
      past: h.past.map(apply),
      future: h.future.map(apply),
    },
  });
}

export function resetHistory(p: Project) {
  setState({ history: createHistory(p) });
}

export function undo() {
  const h = getState().history;
  if (h) setState({ history: undoH(h), selection: null });
}

export function redo() {
  const h = getState().history;
  if (h) setState({ history: redoH(h), selection: null });
}

export function setJob(key: keyof EditorState['jobs'], job: Partial<JobState>) {
  const jobs = getState().jobs;
  setState({ jobs: { ...jobs, [key]: { ...jobs[key], ...job } } });
}

export function setUi(patch: Partial<EditorState['ui']>) {
  setState({ ui: { ...getState().ui, ...patch } });
}
