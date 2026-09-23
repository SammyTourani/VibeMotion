// Editor actions: opening media, running the analysis pipeline, and every
// edit the UI can make. Components call these; they never touch the store's
// internals directly.

import { probeFile, MediaError } from '../media/probe';
import { computePeaks, decodeAudio16k, Cancelled } from '../media/audio';
import { adaptiveThreshold, detectSilences, frameDb, voicedDuration } from '../edit/vad';
import { planWindows, refineWords } from '../asr/windows';
import { AsrCancelled, AsrClient } from '../asr/client';
import { ASR_MODELS } from '../asr/models';
import { asrBackendFor, detectCapabilities } from '../lib/capabilities';
import { newProject, isProject } from '../project/defaults';
import { loadMusic, loadProject, saveMusic, saveProject, deleteMusic } from '../project/persist';
import type { CaptionSettings, FrameSettings, Project, TightenSettings, Word, AudioSettings } from '../project/types';
import { settingsForStyle } from '../captions/styles';
import { loadStyleFonts } from '../captions/fonts';
import { deriveEdl, fillersFor } from './derive';
import {
  edit,
  getState,
  IDLE,
  project,
  resetHistory,
  setBase,
  setJob,
  setState,
  setUi,
  useEditor,
} from './store';
import { transport } from './transport';
import { fetchSample } from '../app/handoff';

const asr = new AsrClient();
let facesAbort: AbortController | null = null;
let audioAbort: AbortController | null = null;
let asrLoading = false;
let openToken = 0;

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function initEditor() {
  if (!getState().caps) {
    const caps = await detectCapabilities();
    setState({ caps });
  }
}

/** URL overrides for testing: #/edit?asr=wasm */
function forcedBackend() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const v = q.get('asr');
  return v === 'wasm' || v === 'webgpu' || v === 'webgpu-f16' ? v : null;
}

export function currentBackend() {
  return forcedBackend() ?? asrBackendFor(getState().caps);
}

function cancelAll() {
  facesAbort?.abort();
  audioAbort?.abort();
  if (getState().jobs.asr.state === 'running') asr.cancel(asrLoading);
  facesAbort = null;
  audioAbort = null;
}

export function closeProject() {
  cancelAll();
  transport.reset();
  const s = getState();
  if (s.url) URL.revokeObjectURL(s.url);
  if (s.music) URL.revokeObjectURL(s.music.url);
  s.media?.input.dispose();
  setState({
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
    music: null,
    selection: null,
    rangeSel: null,
  });
}

export async function openFile(file: File) {
  closeProject();
  const token = ++openToken;
  setState({ phase: 'opening', file });
  await initEditor();
  try {
    const media = await probeFile(file);
    if (token !== openToken) {
      media.input.dispose();
      return;
    }
    const url = URL.createObjectURL(file);
    const saved = await loadProject(media.meta.fingerprint);
    const fresh = newProject(media.meta);
    resetHistory(fresh);
    setState({
      phase: 'open',
      media,
      url,
      restore: saved && (saved.project.transcript || saved.project.rangeOps.length) ? saved : null,
    });
    void loadStyleFonts(fresh.captions.style);
    await analyzeAudio(token);
    if (token !== openToken) return;
    // With a restore offer pending, wait for the user's answer
    // (acceptRestore/declineRestore start whatever is still missing).
    if (!getState().restore) {
      if (!project()?.transcript) void transcribe();
      if (!project()?.faces) void analyzeFaces();
    }
  } catch (err) {
    if (token !== openToken) return;
    setState({ phase: 'error', openError: err instanceof MediaError ? err.message : errorText(err) });
  }
}

export async function openSample() {
  setState({ phase: 'opening', openError: null });
  try {
    await openFile(await fetchSample());
  } catch (err) {
    setState({ phase: 'error', openError: errorText(err) });
  }
}

async function analyzeAudio(token: number) {
  const media = getState().media;
  if (!media?.audio) return;
  audioAbort = new AbortController();
  setJob('audio', { state: 'running', label: 'Reading audio', progress: 0 });
  try {
    const audio = await decodeAudio16k(
      media.audio,
      media.meta.duration,
      (f) => setJob('audio', { progress: f }),
      audioAbort.signal,
    );
    if (token !== openToken) return;
    const db = frameDb(audio, 16000);
    const vad = adaptiveThreshold(db, 12);
    const peaks = computePeaks(audio);
    setState({ analysis: { audio, db, vad, peaks } });
    setJob('audio', { state: 'done', progress: 1 });
  } catch (err) {
    if (err instanceof Cancelled) return;
    setJob('audio', { state: 'error', error: errorText(err) });
    throw err;
  }
}

export async function acceptRestore() {
  const s = getState();
  const saved = s.restore;
  if (!saved || !s.media) return;
  const p: Project = { ...saved.project, source: s.media.meta, updatedAt: Date.now() };
  resetHistory(p);
  setState({ restore: null });
  void loadStyleFonts(p.captions.style);
  if (p.audio.music) {
    const m = await loadMusic(p.source.fingerprint);
    if (m) await attachMusic(new File([m.blob], m.name), false);
  }
  if (!p.transcript) void transcribe();
  if (!p.faces) void analyzeFaces();
}

export function declineRestore() {
  setState({ restore: null });
  void transcribe();
  if (!project()?.faces) void analyzeFaces();
}

// ---------- transcription ----------

export async function transcribe() {
  const s = getState();
  const media = s.media;
  if (!media || s.jobs.asr.state === 'running') return;
  if (!s.analysis) {
    // Audio analysis still running: wait for it.
    await new Promise<void>((resolve) => {
      const unsub = useEditor.subscribe((st) => {
        if (st.analysis || st.jobs.audio.state === 'error' || !st.media) {
          unsub();
          resolve();
        }
      });
    });
  }
  const analysis = getState().analysis;
  if (!analysis) return;
  const { prefs } = getState();
  const backend = currentBackend();
  const model = ASR_MODELS[prefs.model];
  setState({ liveWords: [] });
  setJob('asr', {
    state: 'running',
    label: 'Loading the speech model',
    progress: null,
    detail: `${model.label} model, up to ${model.downloadMB[backend]} MB the first time. Your browser keeps it after that.`,
    error: undefined,
  });
  // Files start at different moments; the measured model size keeps the bar
  // from jumping backwards as each one begins.
  const expected = Math.max(1, (model.downloadMB[backend] - 5.5) * 1e6);
  try {
    asrLoading = true;
    await asr.load(
      prefs.model,
      backend,
      (loaded, total) => {
        const denom = Math.max(total, expected);
        setJob('asr', {
          label: 'Downloading the speech model',
          progress: Math.min(1, loaded / denom),
          detail: `${(loaded / 1e6).toFixed(0)} of ${(denom / 1e6).toFixed(0)} MB. Your browser keeps it after this.`,
        });
      },
      (message) => setJob('asr', { label: message, progress: null, detail: 'Compiling for your GPU, a few seconds.' }),
    );
    asrLoading = false;

    const duration = media.meta.duration;
    const vad = analysis.vad;
    const windows = planWindows(analysis.db, duration).map((w) => ({
      ...w,
      speech: voicedDuration(analysis.db, vad.threshold, w.start, w.end) > 0.15,
    }));
    setJob('asr', {
      label: 'Transcribing',
      progress: 0,
      detail: windows.length > 1 ? `Part 1 of ${windows.length}` : undefined,
    });
    const result = await asr.transcribe({
      audio: analysis.audio,
      windows,
      language: prefs.language,
      task: prefs.translate ? 'translate' : 'transcribe',
      onWindow: (i, n, words) => {
        const live = getState().liveWords ?? [];
        setState({
          liveWords: [
            ...live,
            ...words.map((w, k) => ({ id: `live${i}-${k}`, text: w.text, start: w.start, end: w.end })),
          ],
        });
        setJob('asr', {
          progress: (i + 1) / n,
          detail: n > 1 ? `Part ${Math.min(n, i + 2)} of ${n}` : undefined,
        });
      },
    });

    // Snap word edges out of pauses, then give the words stable ids.
    const pauses = detectSilences(analysis.db, { minSilence: 0.3, threshold: vad.threshold });
    const refined = refineWords(
      result.words.map((w, i) => ({ id: String(i), ...w })),
      pauses,
      (a, b) => voicedDuration(analysis.db, vad.threshold, a, b),
    );
    const words: Word[] = refined.map((w, i) => ({ ...w, id: `w${i}` }));
    const current = project();
    if (!current) return;
    const retranscribed = !!current.transcript;
    const next: Project = {
      ...current,
      transcript: {
        words,
        language: result.language,
        modelId: model.repo,
        task: prefs.translate ? 'translate' : 'transcribe',
        createdAt: Date.now(),
      },
    };
    if (retranscribed) {
      // Old word ids no longer mean anything: start the edit history over.
      resetHistory({ ...next, wordEdits: {}, textFixes: {}, captions: { ...next.captions, emphasized: [] } });
    } else {
      setBase({ transcript: next.transcript });
    }
    setState({ liveWords: null });
    setJob('asr', { state: 'done', progress: 1, detail: undefined });
  } catch (err) {
    asrLoading = false;
    setState({ liveWords: null });
    if (err instanceof AsrCancelled) {
      setJob('asr', { state: 'cancelled', label: 'Transcription stopped', progress: null, detail: undefined });
      return;
    }
    setJob('asr', { state: 'error', label: "Transcription didn't finish", error: errorText(err), progress: null });
  }
}

export function cancelTranscription() {
  if (getState().jobs.asr.state !== 'running') return;
  asr.cancel(asrLoading);
  if (asrLoading) {
    asrLoading = false;
    setState({ liveWords: null });
    setJob('asr', { state: 'cancelled', label: 'Transcription stopped', progress: null, detail: undefined });
  }
}

export function setAsrPrefs(patch: Partial<ReturnType<typeof getState>['prefs']>) {
  setState({ prefs: { ...getState().prefs, ...patch } });
}

// ---------- faces ----------

export async function analyzeFaces() {
  const s = getState();
  const media = s.media;
  if (!media || s.jobs.faces.state === 'running') return;
  facesAbort?.abort();
  const abort = new AbortController();
  facesAbort = abort;
  setJob('faces', { state: 'running', label: 'Finding faces', progress: 0, error: undefined });
  try {
    const { analyzeFaces: run } = await import('../reframe/detect');
    const faces = await run(
      media.video,
      media.meta.duration,
      media.meta.width,
      media.meta.height,
      (f) => setJob('faces', { progress: f }),
      abort.signal,
    );
    if (abort.signal.aborted) return;
    setBase({ faces });
    setJob('faces', { state: 'done', progress: 1 });
  } catch (err) {
    if (abort.signal.aborted) return;
    setJob('faces', {
      state: 'error',
      label: "Face tracking isn't available",
      error: errorText(err),
      progress: null,
    });
  }
}

// ---------- word edits ----------

function wordsOf(p: Project): Word[] {
  return p.transcript?.words ?? [];
}

export function cutWords(a: number, b: number) {
  edit((p) => {
    const words = wordsOf(p);
    const wordEdits = { ...p.wordEdits };
    for (let i = Math.max(0, a); i <= Math.min(b, words.length - 1); i++) wordEdits[words[i]!.id] = 'cut';
    return { ...p, wordEdits };
  });
}

export function restoreWords(a: number, b: number) {
  const analysis = getState().analysis;
  edit((p) => {
    const words = wordsOf(p);
    const edl = deriveEdl(p, analysis);
    const fillers = fillersFor(words, p.tighten.fillers, p.tighten.removeFillers);
    const wordEdits = { ...p.wordEdits };
    let needsRange = false;
    const lo = Math.max(0, a);
    const hi = Math.min(b, words.length - 1);
    for (let i = lo; i <= hi; i++) {
      const w = words[i]!;
      if (fillers.has(w.id)) wordEdits[w.id] = 'keep';
      else delete wordEdits[w.id];
      if (edl.wordStatus[i] === 'removed') needsRange = true;
    }
    const rangeOps = needsRange
      ? [...p.rangeOps, { kind: 'restore' as const, start: words[lo]!.start, end: words[hi]!.end }]
      : p.rangeOps;
    return { ...p, wordEdits, rangeOps };
  });
}

/** Delete key: cuts the range, or restores it if it's all cut already. */
export function toggleWords(a: number, b: number) {
  const p = project();
  if (!p) return;
  const edl = deriveEdl(p, getState().analysis);
  let anyKept = false;
  for (let i = a; i <= b; i++) if (edl.wordStatus[i] === 'kept') anyKept = true;
  if (anyKept) cutWords(a, b);
  else restoreWords(a, b);
}

export function fixWord(id: string, text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  edit((p) => {
    const original = p.transcript?.words.find((w) => w.id === id)?.text;
    const textFixes = { ...p.textFixes };
    if (!clean || clean === original) delete textFixes[id];
    else textFixes[id] = clean;
    return { ...p, textFixes };
  });
}

export function toggleEmphasis(id: string) {
  edit((p) => {
    const set = new Set(p.captions.emphasized);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return { ...p, captions: { ...p.captions, emphasized: [...set] } };
  });
}

// ---------- timeline ranges ----------

function overlapFrac(w: Word, s: number, e: number) {
  const o = Math.max(0, Math.min(w.end, e) - Math.max(w.start, s));
  return o / Math.max(1e-6, w.end - w.start);
}

export function cutRange(start: number, end: number) {
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  if (e - s < 0.02) return;
  edit((p) => {
    const wordEdits = { ...p.wordEdits };
    for (const w of wordsOf(p)) if (overlapFrac(w, s, e) >= 0.5) wordEdits[w.id] = 'cut';
    return { ...p, wordEdits, rangeOps: [...p.rangeOps, { kind: 'cut', start: s, end: e }] };
  });
}

export function restoreRange(start: number, end: number) {
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  if (e - s < 0.02) return;
  edit((p) => {
    const words = wordsOf(p);
    const fillers = fillersFor(words, p.tighten.fillers, p.tighten.removeFillers);
    const wordEdits = { ...p.wordEdits };
    for (const w of words) {
      if (overlapFrac(w, s, e) < 0.5) continue;
      if (fillers.has(w.id)) wordEdits[w.id] = 'keep';
      else delete wordEdits[w.id];
    }
    return { ...p, wordEdits, rangeOps: [...p.rangeOps, { kind: 'restore', start: s, end: e }] };
  });
}

// ---------- settings ----------

export function setTighten(patch: Partial<TightenSettings>, coalesce?: string) {
  edit((p) => ({ ...p, tighten: { ...p.tighten, ...patch } }), coalesce);
}

export function setCaptions(patch: Partial<CaptionSettings>, coalesce?: string) {
  if (patch.style) void loadStyleFonts(patch.style);
  edit((p) => ({ ...p, captions: { ...p.captions, ...patch } }), coalesce);
}

export function chooseCaptionStyle(id: CaptionSettings['style']) {
  void loadStyleFonts(id);
  edit((p) => ({ ...p, captions: settingsForStyle(id, p.captions) }));
}

export function setFrame(patch: Partial<FrameSettings>, coalesce?: string) {
  edit((p) => ({ ...p, frame: { ...p.frame, ...patch } }), coalesce);
}

export function setAudio(patch: Partial<AudioSettings>, coalesce?: string) {
  edit((p) => ({ ...p, audio: { ...p.audio, ...patch } }), coalesce);
}

// ---------- music ----------

export async function attachMusic(file: File, persist = true) {
  const buf = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 48000, 48000);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch {
    throw new Error("This browser can't read that audio file. Use MP3, WAV, M4A or OGG.");
  }
  const prev = getState().music;
  if (prev) URL.revokeObjectURL(prev.url);
  setState({ music: { name: file.name, buffer: decoded, url: URL.createObjectURL(file) } });
  const p = project();
  if (!p) return;
  if (!p.audio.music || p.audio.music.name !== file.name) {
    setAudio({ music: { name: file.name, volume: -14, duck: true, fadeIn: 1, fadeOut: 2 } });
  }
  if (persist) await saveMusic({ fingerprint: p.source.fingerprint, name: file.name, blob: file });
}

export async function removeMusic() {
  const s = getState();
  if (s.music) URL.revokeObjectURL(s.music.url);
  setState({ music: null });
  setAudio({ music: null });
  const p = project();
  if (p) await deleteMusic(p.source.fingerprint);
}

// ---------- project files ----------

export function projectJson(): string {
  const p = project();
  return p ? JSON.stringify(p) : '{}';
}

export async function openProjectFile(file: File): Promise<string | null> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return "That file isn't a VibeMotion project.";
  }
  if (!isProject(data)) return "That file isn't a VibeMotion project.";
  const media = getState().media;
  if (!media) return 'Open the video first, then open its project.';
  if (data.source.fingerprint !== media.meta.fingerprint) {
    if (Math.abs(data.source.duration - media.meta.duration) > 0.5) {
      return `This project belongs to "${data.source.name}", not this video.`;
    }
  }
  resetHistory({ ...data, source: media.meta, updatedAt: Date.now() });
  setState({ restore: null });
  if (getState().jobs.asr.state === 'running') cancelTranscription();
  void loadStyleFonts(data.captions.style);
  return null;
}

// ---------- autosave ----------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: Project | null = null;

export function startAutosave(): () => void {
  return useEditor.subscribe((s) => {
    const p = s.history?.present;
    if (!p || p === lastSaved || s.restore) return;
    if (!p.transcript && p.rangeOps.length === 0) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      lastSaved = p;
      saveProject(p).catch(() => {
        /* storage full or blocked: editing still works */
      });
    }, 600);
  });
}

export { setUi };
