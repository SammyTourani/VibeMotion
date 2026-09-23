// Reads a file's metadata with Mediabunny and checks that this browser can
// actually decode it, with an error that says what to do when it can't.

import {
  ALL_FORMATS,
  BlobSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import type { SourceMeta } from '../project/types';

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export interface ProbedMedia {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack | null;
  meta: SourceMeta;
}

export function fingerprintOf(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

const CODEC_NAMES: Record<string, string> = {
  avc: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'ProRes',
};

function decodeHelp(codec: string | null): string {
  if (codec === 'hevc') {
    return "This browser can't decode HEVC video. Open it in Chrome or Safari on a Mac, or export it from Photos as 'Most Compatible'.";
  }
  if (codec === 'prores') {
    return "Browsers can't decode ProRes. Export an H.264 MP4 from your editor and drop that in.";
  }
  if (codec === 'av1') {
    return "This browser can't decode AV1 video. Try the latest Chrome, or export the clip as H.264 MP4.";
  }
  const name = codec ? (CODEC_NAMES[codec] ?? codec.toUpperCase()) : 'this';
  return `This browser can't decode ${name} video. Try Chrome, or export the clip as an H.264 MP4.`;
}

export async function probeFile(file: File): Promise<ProbedMedia> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) {
      throw new MediaError("This file isn't a video format VibeMotion can read. Use MP4, MOV, WebM or MKV.");
    }
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new MediaError('This file has no video track. Drop a video file instead.');
    const vCodec = await video.getCodec();
    if (!(await video.canDecode())) throw new MediaError(decodeHelp(vCodec));

    const audio = await input.getPrimaryAudioTrack();
    if (!audio) {
      throw new MediaError(
        "This video has no audio track, so there's nothing to transcribe. VibeMotion edits by what's said.",
      );
    }
    const aCodec = await audio.getCodec();
    if (!(await audio.canDecode())) {
      throw new MediaError(
        `This browser can't decode the audio in this file (${aCodec ?? 'unknown codec'}). Export it with AAC audio and try again.`,
      );
    }

    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new MediaError('This video appears to be empty.');
    const width = await video.getDisplayWidth();
    const height = await video.getDisplayHeight();
    const rotation = await video.getRotation();
    let fps = 30;
    try {
      const m = await video.computeFrameRateMetrics({ targetPacketCount: 120 });
      fps = m.bestGuessFrameRate || 30;
    } catch {
      const stats = await video.computePacketStats(120);
      fps = stats.averagePacketRate || 30;
    }
    const meta: SourceMeta = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      fingerprint: fingerprintOf(file),
      duration,
      width,
      height,
      rotation,
      fps: Math.min(120, Math.max(1, fps)),
      videoCodec: vCodec,
      audioCodec: aCodec,
      hasAudio: true,
      sampleRate: await audio.getSampleRate(),
      channels: await audio.getNumberOfChannels(),
    };
    return { input, video, audio, meta };
  } catch (err) {
    input.dispose();
    if (err instanceof MediaError) throw err;
    throw new MediaError(
      `Couldn't read this file (${err instanceof Error ? err.message : String(err)}). If it plays elsewhere, re-export it as an H.264 MP4.`,
    );
  }
}
