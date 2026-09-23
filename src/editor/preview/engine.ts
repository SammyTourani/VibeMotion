// Preview playback. A hidden <video> plays the source; every presented frame
// is composited onto the canvas (crop, punch-in, captions) through the same
// code the export uses. Cuts are skipped by seeking just before playback
// reaches them.

import { buildCaptionLayout, type CaptionLayout } from '../../captions/render';
import type { CaptionWord } from '../../captions/layout';
import { cropAt, drawComposite, type FrameSpec } from '../../render/compose';
import { integratedLoudness, normalizationGain } from '../../audio/lufs';
import { speechRegions } from '../../audio/duck';
import type { Edl } from '../../edit/edl';
import type { Aspect, CaptionSettings, Interval, Project } from '../../project/types';
import { deriveCaptionWords, deriveEdl, frameSpec } from '../derive';
import { getState, useEditor } from '../store';
import { transport, type TransportDriver } from '../transport';
import { drawSafeZone } from './safezone';

const LOOKAHEAD = 0.03;

export class PreviewEngine implements TransportDriver {
  private ctx: CanvasRenderingContext2D;
  private measure: CanvasRenderingContext2D;
  private rvfc = 0;
  private raf = 0;
  private disposed = false;
  private layoutKey: unknown[] = [];
  private layout: CaptionLayout | null = null;
  private audioCtx: AudioContext | null = null;
  private voiceGain: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private loudKey: unknown[] = [];
  private loudGain = 1;
  private unsub: () => void;
  private seeking = false;
  /** Until the user plays or seeks, the playhead rests on the first kept frame. */
  private touched = false;
  fontsVersion = 0;

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.measure = document.createElement('canvas').getContext('2d')!;
    video.addEventListener('seeked', this.onSeeked);
    video.addEventListener('loadeddata', this.onSeeked);
    video.addEventListener('pause', this.onPauseEvent);
    video.addEventListener('ended', this.onPauseEvent);
    transport.attach(this);
    this.unsub = useEditor.subscribe((s, prev) => {
      if (s.history?.present !== prev.history?.present || s.analysis !== prev.analysis || s.ui.safeZone !== prev.ui.safeZone) {
        if (!this.video.paused) return;
        if (!this.snapToStart()) this.draw();
      }
      if (s.music !== prev.music) this.setupMusic();
    });
    this.loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.rvfc) this.video.cancelVideoFrameCallback(this.rvfc);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('loadeddata', this.onSeeked);
    this.video.removeEventListener('pause', this.onPauseEvent);
    this.video.removeEventListener('ended', this.onPauseEvent);
    this.unsub();
    this.musicEl?.pause();
    void this.audioCtx?.close();
    transport.attach(null);
  }

  private project(): Project | null {
    return getState().history?.present ?? null;
  }

  private edl(): Edl | null {
    const p = this.project();
    return p ? deriveEdl(p, getState().analysis) : null;
  }

  // ---------- TransportDriver ----------

  /** Parks the playhead on output time 0 until the user takes over. Returns true if it seeked. */
  private snapToStart(): boolean {
    if (this.touched || this.video.readyState < 1) return false;
    const edl = this.edl();
    const first = edl?.kept[0];
    if (!first || Math.abs(this.video.currentTime - first.start) < 0.002) return false;
    this.seeking = true;
    this.video.currentTime = first.start + 0.001;
    return true;
  }

  play() {
    const edl = this.edl();
    if (!edl || edl.kept.length === 0) return;
    this.touched = true;
    this.ensureAudio();
    const t = this.video.currentTime;
    const out = edl.srcToOut(t);
    if (out >= edl.outDuration - 0.05) this.video.currentTime = edl.kept[0]!.start;
    else {
      const r = edl.resumeAfter(t);
      if (r !== null && r > t) this.video.currentTime = r;
    }
    void this.video.play().catch(() => {
      /* autoplay policy: the user can press play again */
    });
    if (this.musicEl) void this.musicEl.play().catch(() => undefined);
    transport.update(this.video.currentTime, edl.srcToOut(this.video.currentTime), true);
  }

  pause() {
    this.video.pause();
    this.musicEl?.pause();
    this.publish(false);
  }

  seekSrc(t: number) {
    const p = this.project();
    if (!p) return;
    const clamped = Math.min(Math.max(0, t), p.source.duration - 0.001);
    this.touched = true;
    this.seeking = true;
    this.video.currentTime = clamped;
    const edl = this.edl();
    transport.update(clamped, edl ? edl.srcToOut(clamped) : clamped);
  }

  seekOut(t: number) {
    const edl = this.edl();
    if (!edl) return;
    this.seekSrc(edl.outToSrc(Math.min(Math.max(0, t), edl.outDuration)) + 1e-4);
  }

  setRate(r: number) {
    this.video.playbackRate = r;
  }

  // ---------- internals ----------

  private onSeeked = () => {
    this.seeking = false;
    if (this.snapToStart()) return;
    this.draw();
    this.publish();
  };

  private onPauseEvent = () => {
    this.musicEl?.pause();
    this.publish(false);
  };

  private publish(playing = !this.video.paused) {
    const edl = this.edl();
    const t = this.video.currentTime;
    transport.update(t, edl ? edl.srcToOut(t) : t, playing);
  }

  /** Skip cuts: when playback is about to enter one, jump to where it resumes. */
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.video.paused || this.seeking) return;
    const edl = this.edl();
    if (!edl) return;
    const t = this.video.currentTime;
    const k = edl.segmentAtSrc(t + LOOKAHEAD);
    if (k < 0) {
      const next = edl.resumeAfter(t + LOOKAHEAD);
      if (next === null) {
        this.pause();
        this.video.currentTime = Math.max(0, edl.kept[edl.kept.length - 1]!.end - 0.01);
        return;
      }
      if (next > t) {
        this.seeking = true;
        this.video.currentTime = next;
      }
    }
    this.syncMusic(edl.srcToOut(t));
  };

  private frameLoop = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (this.disposed) return;
    this.rvfc = this.video.requestVideoFrameCallback(this.frameLoop);
    // Playing: the presented frame's own time. Paused (after a seek): the time
    // the user asked for, so captions show the word they clicked.
    this.draw(this.video.paused ? undefined : meta.mediaTime);
    this.publish();
  };

  startFrameLoop() {
    if (!this.rvfc) this.rvfc = this.video.requestVideoFrameCallback(this.frameLoop);
  }

  private captionLayout(words: CaptionWord[], settings: CaptionSettings, spec: FrameSpec, aspect: Aspect): CaptionLayout | null {
    if (!settings.enabled || words.length === 0) return null;
    const key = [words, settings, spec.outW, spec.outH, aspect, this.fontsVersion];
    if (this.layout && key.every((k, i) => k === this.layoutKey[i])) return this.layout;
    this.layout = buildCaptionLayout(this.measure, words, settings, spec.outW, spec.outH, aspect);
    this.layoutKey = key;
    return this.layout;
  }

  invalidateLayout() {
    this.fontsVersion++;
    this.draw();
  }

  draw(mediaTime?: number) {
    const p = this.project();
    if (!p || this.video.readyState < 2) return;
    const edl = this.edl()!;
    const spec = frameSpec(p);
    const t = mediaTime ?? this.video.currentTime;
    const seg = edl.segmentAtSrc(t);
    const tOut = edl.srcToOut(t);
    const crop = cropAt(spec, t, seg >= 0 ? seg : edl.segmentAtOut(tOut));
    const words = deriveCaptionWords(p, edl);
    const layout = this.captionLayout(words, p.captions, spec, p.frame.aspect);
    const scale = this.canvas.width / spec.outW;
    drawComposite(this.ctx, this.video, spec, crop, seg >= 0 ? layout : null, tOut, scale);
    if (seg < 0) this.drawCutBadge(scale, spec);
    if (getState().ui.safeZone) drawSafeZone(this.ctx, spec, scale);
  }

  /** When paused inside a cut (e.g. scrubbing the timeline), say so on the frame. */
  private drawCutBadge(scale: number, spec: FrameSpec) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = 'rgba(22, 23, 25, 0.55)';
    ctx.fillRect(0, 0, spec.outW, spec.outH);
    ctx.strokeStyle = '#FF3D8B';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, spec.outW - 12, spec.outH - 12);
    ctx.fillStyle = '#FF3D8B';
    ctx.font = `700 ${Math.round(spec.outW * 0.05)}px "Archivo Variable", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Cut from the edit', spec.outW / 2, spec.outH * 0.1);
    ctx.restore();
  }

  // ---------- audio ----------

  private ensureAudio() {
    if (this.audioCtx) {
      void this.audioCtx.resume();
      return;
    }
    try {
      this.audioCtx = new AudioContext();
      const src = this.audioCtx.createMediaElementSource(this.video);
      this.voiceGain = this.audioCtx.createGain();
      src.connect(this.voiceGain).connect(this.audioCtx.destination);
      this.applyLoudness();
      this.setupMusic();
    } catch {
      this.audioCtx = null;
    }
  }

  /** Loudness normalization, estimated from the 16 kHz analysis audio. */
  applyLoudness() {
    const p = this.project();
    const a = getState().analysis;
    if (!p || !a || !this.voiceGain) return;
    const edl = this.edl()!;
    const key = [edl.kept, a.audio, p.audio.normalize];
    if (!key.every((k, i) => k === this.loudKey[i])) {
      this.loudKey = key;
      if (!p.audio.normalize) this.loudGain = 1;
      else {
        const kept = keptAudio(a.audio, edl.kept);
        // The export is stereo; a centred mono voice reads 3 dB louder there.
        const lufs = integratedLoudness([kept], 16000) + 3.01;
        this.loudGain = Math.min(normalizationGain(lufs), 4);
      }
    }
    this.voiceGain.gain.value = this.loudGain;
  }

  private setupMusic() {
    const m = getState().music;
    this.musicEl?.pause();
    this.musicEl = null;
    if (!m || !this.audioCtx) return;
    const el = new Audio(m.url);
    el.loop = true;
    const src = this.audioCtx.createMediaElementSource(el);
    this.musicGain = this.audioCtx.createGain();
    this.musicGain.gain.value = 0;
    src.connect(this.musicGain).connect(this.audioCtx.destination);
    this.musicEl = el;
    if (!this.video.paused) void el.play().catch(() => undefined);
  }

  private speechKey: unknown = null;
  private speech: Interval[] = [];

  private syncMusic(tOut: number) {
    this.applyLoudness();
    const el = this.musicEl;
    const p = this.project();
    const s = p?.audio.music;
    if (!el || !this.musicGain || !s || !p || !this.audioCtx) return;
    const dur = el.duration || 0;
    if (dur > 0) {
      const want = tOut % dur;
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
    }
    const edl = this.edl()!;
    const words = deriveCaptionWords(p, edl);
    if (this.speechKey !== words) {
      this.speechKey = words;
      this.speech = speechRegions(words);
    }
    let g = 10 ** (s.volume / 20);
    if (s.duck && this.speech.some((r) => tOut >= r.start - 0.1 && tOut <= r.end)) g *= 10 ** (-12 / 20);
    if (s.fadeIn > 0) g *= Math.min(1, tOut / s.fadeIn);
    if (s.fadeOut > 0) g *= Math.min(1, Math.max(0, (edl.outDuration - tOut) / s.fadeOut));
    this.musicGain.gain.setTargetAtTime(g * this.loudGain, this.audioCtx.currentTime, 0.08);
  }
}

function keptAudio(audio: Float32Array, kept: readonly Interval[]): Float32Array {
  let n = 0;
  for (const k of kept) n += Math.max(0, Math.round(k.end * 16000) - Math.round(k.start * 16000));
  const out = new Float32Array(n);
  let o = 0;
  for (const k of kept) {
    const a = Math.round(k.start * 16000);
    const b = Math.min(audio.length, Math.round(k.end * 16000));
    out.set(audio.subarray(a, b), o);
    o += Math.max(0, b - a);
  }
  return out;
}
