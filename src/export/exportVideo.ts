// MP4 export, entirely in the browser: Mediabunny muxes H.264 (WebCodecs) +
// AAC into an MP4 held in memory.
//
// Audio: the kept segments are decoded, spliced with 10 ms crossfades, mixed
// with the (ducked) music bed, normalized to -14 LUFS and true-peak limited
// at -1 dBTP. Video: frame i sits at i/fps; its source frame comes from
// outToSrc() through CanvasSink.canvasesAtTimestamps (sequential decode),
// and is drawn by the same compositor as the preview.

import {
  AudioBufferSink,
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type InputAudioTrack,
  type VideoCodec,
} from 'mediabunny';
import type { Edl } from '../edit/edl';
import type { Project } from '../project/types';
import type { ProbedMedia } from '../media/probe';
import { spliceSegments, type SegmentAudio } from '../audio/splice';
import { integratedLoudness, normalizationGain } from '../audio/lufs';
import { limitTruePeak } from '../audio/limiter';
import { mixMusic, speechRegions } from '../audio/duck';
import { buildCaptionLayout } from '../captions/render';
import { loadStyleFonts } from '../captions/fonts';
import { captionWords } from '../captions/words';
import { cropAt, drawComposite } from '../render/compose';
import { frameSpec } from '../editor/derive';

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

export interface ExportProgress {
  stage: 'audio' | 'video' | 'finalize';
  /** 0..1 over the whole export. */
  fraction: number;
  frame?: number;
  frames?: number;
  /** Seconds left, once there's enough data to guess. */
  eta?: number | null;
}

export interface ExportOptions {
  project: Project;
  edl: Edl;
  media: ProbedMedia;
  /** 1 = 1080p, 2/3 = 720p. */
  scale: number;
  fps: number;
  music: AudioBuffer | null;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  loudness: number | null;
  warnings: string[];
}

const TARGET_LUFS = -14;

async function pickVideoCodec(w: number, h: number, fps: number, warnings: string[]): Promise<VideoCodec> {
  if (await canEncodeVideo('avc', { width: w, height: h, frameRate: fps })) return 'avc';
  for (const c of ['vp9', 'av1'] as VideoCodec[]) {
    if (await canEncodeVideo(c, { width: w, height: h, frameRate: fps })) {
      warnings.push(`This browser can't encode H.264, so the video track is ${c.toUpperCase()}. Some older players may not open it.`);
      return c;
    }
  }
  throw new Error("This browser can't encode video. Use a current version of Chrome, Edge or Safari to export.");
}

async function pickAudioCodec(sampleRate: number, warnings: string[]): Promise<AudioCodec> {
  const opts = { numberOfChannels: 2, sampleRate };
  if (await canEncodeAudio('aac', opts)) return 'aac';
  // No native AAC (e.g. Firefox, Chromium on Linux): use Mediabunny's WASM AAC encoder.
  try {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    if (await canEncodeAudio('aac', opts)) return 'aac';
  } catch {
    /* fall through to Opus */
  }
  if (await canEncodeAudio('opus', opts)) {
    warnings.push("This browser can't encode AAC, so the audio is Opus. It plays in browsers and most apps, but not every editor.");
    return 'opus';
  }
  throw new Error("This browser can't encode audio for MP4.");
}

async function resample(channels: Float32Array[], from: number, to: number): Promise<Float32Array[]> {
  if (from === to || channels[0]!.length === 0) return channels;
  const frames = Math.round((channels[0]!.length * to) / from);
  const ctx = new OfflineAudioContext(channels.length, frames, to);
  const buf = ctx.createBuffer(channels.length, channels[0]!.length, from);
  channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return channels.map((_, i) => out.getChannelData(i).slice());
}

/** Decodes [start, end] of the track to stereo PCM at the track's rate. */
async function decodeRange(
  sink: AudioBufferSink,
  start: number,
  end: number,
  fs: number,
): Promise<{ pcm: Float32Array[]; start: number }> {
  const bufs: { buffer: AudioBuffer; timestamp: number }[] = [];
  for await (const wb of sink.buffers(Math.max(0, start), end)) bufs.push({ buffer: wb.buffer, timestamp: wb.timestamp });
  if (!bufs.length) return { pcm: [new Float32Array(1), new Float32Array(1)], start };
  const t0 = bufs[0]!.timestamp;
  const last = bufs[bufs.length - 1]!;
  const n = Math.ceil((last.timestamp + last.buffer.duration - t0) * fs) + 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const { buffer, timestamp } of bufs) {
    const off = Math.round((timestamp - t0) * fs);
    const ch = buffer.numberOfChannels;
    const c0 = buffer.getChannelData(0);
    const c1 = ch > 1 ? buffer.getChannelData(1) : c0;
    // 5.1 and up: fold the centre (dialogue) channel into both sides.
    const cc = ch >= 3 ? buffer.getChannelData(2) : null;
    for (let i = 0; i < buffer.length && off + i < n; i++) {
      const c = cc ? cc[i]! * 0.7071 : 0;
      L[off + i] = c0[i]! + c;
      R[off + i] = c1[i]! + c;
    }
  }
  return { pcm: [L, R], start: t0 };
}

export async function renderAudio(
  project: Project,
  edl: Edl,
  track: InputAudioTrack,
  music: AudioBuffer | null,
  onProgress: (f: number) => void,
  signal: AbortSignal,
): Promise<{ channels: Float32Array[]; sampleRate: number; loudness: number | null }> {
  const srcRate = await track.getSampleRate();
  const sink = new AudioBufferSink(track);
  const margin = 0.03;
  const segs: SegmentAudio[] = [];
  for (let k = 0; k < edl.kept.length; k++) {
    if (signal.aborted) throw new ExportCancelled();
    const seg = edl.kept[k]!;
    const d = await decodeRange(sink, seg.start - margin, seg.end + margin, srcRate);
    segs.push({ pcm: d.pcm, pcmStart: d.start, start: seg.start, end: seg.end });
    onProgress(((k + 1) / edl.kept.length) * 0.6);
  }
  let channels: Float32Array[] = spliceSegments(segs, srcRate, 2);
  let fs = srcRate;
  if (fs !== 44100 && fs !== 48000) {
    channels = await resample(channels, fs, 48000);
    fs = 48000;
  }

  if (music && project.audio.music) {
    let m: Float32Array[] = Array.from({ length: music.numberOfChannels }, (_, i) => music.getChannelData(i));
    if (music.sampleRate !== fs) m = await resample(m, music.sampleRate, fs);
    const words = captionWords(project.transcript?.words ?? [], edl, {}, []);
    const s = project.audio.music;
    mixMusic(channels, m, fs, speechRegions(words), { volumeDb: s.volume, duck: s.duck, fadeIn: s.fadeIn, fadeOut: s.fadeOut });
  }
  onProgress(0.75);

  let loudness: number | null = null;
  if (project.audio.normalize) {
    loudness = integratedLoudness(channels, fs);
    const g = normalizationGain(loudness, TARGET_LUFS);
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] = c[i]! * g;
  }
  // Always limit: normalization can push peaks over, and so can a loud source.
  limitTruePeak(channels, fs, { ceilingDb: -1 });
  onProgress(1);
  return { channels, sampleRate: fs, loudness };
}

export async function exportMp4(o: ExportOptions): Promise<ExportResult> {
  const { project, edl, media, signal } = o;
  const warnings: string[] = [];
  const spec = frameSpec(project, o.scale);
  const W = spec.outW;
  const H = spec.outH;
  const fps = o.fps;
  const frames = Math.max(1, Math.round(edl.outDuration * fps));
  if (edl.kept.length === 0) throw new Error('Everything is cut, so there is nothing to export.');

  o.onProgress({ stage: 'audio', fraction: 0 });
  const audioTrack = media.audio!;
  const audio = await renderAudio(project, edl, audioTrack, o.music, (f) => o.onProgress({ stage: 'audio', fraction: f * 0.08 }), signal);
  if (signal.aborted) throw new ExportCancelled();

  const videoCodec = await pickVideoCodec(W, H, fps, warnings);
  const audioCodec = await pickAudioCodec(audio.sampleRate, warnings);

  await loadStyleFonts(project.captions.style);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const words = captionWords(project.transcript?.words ?? [], edl, project.textFixes, project.captions.emphasized);
  const layout =
    project.captions.enabled && words.length
      ? buildCaptionLayout(ctx, words, project.captions, W, H, project.frame.aspect)
      : null;

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality('high'),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality('high') });
  output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: project.source.name.replace(/\.[^.]+$/, ''), comment: 'Edited with VibeMotion' });

  const abort = async () => {
    await output.cancel().catch(() => undefined);
    throw new ExportCancelled();
  };

  try {
    await output.start();

    // Audio is fed in one-second chunks just ahead of the video, so the muxer interleaves.
    const fs = audio.sampleRate;
    const total = audio.channels[0]!.length;
    const chunk = fs;
    let audioPos = 0;
    const pushAudioUntil = async (t: number) => {
      const until = Math.min(total, Math.round(t * fs));
      while (audioPos < until) {
        const n = Math.min(chunk, total - audioPos);
        const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: fs });
        buf.copyToChannel(audio.channels[0]!.subarray(audioPos, audioPos + n) as Float32Array<ArrayBuffer>, 0);
        buf.copyToChannel(audio.channels[1]!.subarray(audioPos, audioPos + n) as Float32Array<ArrayBuffer>, 1);
        await audioSource.add(buf);
        audioPos += n;
      }
    };

    const long = Math.max(project.source.width, project.source.height);
    const sink = new CanvasSink(
      media.video,
      long > 3840 ? { width: Math.round((project.source.width * 3840) / long), poolSize: 2 } : { poolSize: 2 },
    );
    const timestamps = function* () {
      for (let i = 0; i < frames; i++) yield edl.outToSrc((i + 0.5) / fps);
    };

    const started = performance.now();
    let i = 0;
    let lastSource: CanvasImageSource | null = null;
    for await (const wc of sink.canvasesAtTimestamps(timestamps())) {
      if (signal.aborted) await abort();
      const tOut = i / fps;
      const tMid = (i + 0.5) / fps;
      const tSrc = edl.outToSrc(tMid);
      const seg = edl.segmentAtOut(tMid);
      const src: CanvasImageSource | null = (wc?.canvas as CanvasImageSource | undefined) ?? lastSource;
      if (src) {
        drawComposite(ctx, src, spec, cropAt(spec, tSrc, seg), layout, tOut, 1);
        lastSource = src;
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      await pushAudioUntil(tOut + 1);
      await videoSource.add(tOut, 1 / fps);
      i++;
      if (i % 3 === 0 || i === frames) {
        const elapsed = (performance.now() - started) / 1000;
        const perFrame = elapsed / i;
        o.onProgress({
          stage: 'video',
          fraction: 0.08 + (i / frames) * 0.9,
          frame: i,
          frames,
          eta: i > 15 ? perFrame * (frames - i) + 1 : null,
        });
      }
      if (i >= frames) break;
    }
    if (signal.aborted) await abort();
    await pushAudioUntil(Infinity);
    videoSource.close();
    audioSource.close();
    o.onProgress({ stage: 'finalize', fraction: 0.99 });
    await output.finalize();
  } catch (err) {
    if (err instanceof ExportCancelled) throw err;
    await output.cancel().catch(() => undefined);
    throw err;
  }

  const buffer = (output.target as BufferTarget).buffer!;
  o.onProgress({ stage: 'finalize', fraction: 1 });
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    width: W,
    height: H,
    fps,
    duration: edl.outDuration,
    videoCodec,
    audioCodec,
    loudness: audio.loudness,
    warnings,
  };
}
