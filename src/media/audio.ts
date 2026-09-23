// Decodes the audio track with Mediabunny and resamples it to 16 kHz mono for
// transcription, silence detection and the waveform. Audio is resampled in
// 30 s chunks with a little pre- and post-roll so chunk edges never ring,
// which keeps memory flat on long files.

import { AudioBufferSink, type InputAudioTrack } from 'mediabunny';

export const ASR_RATE = 16000;
const CHUNK_SEC = 30;
const ROLL_SEC = 0.1;

export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

async function resample(mono: Float32Array, srcRate: number): Promise<Float32Array> {
  if (srcRate === ASR_RATE) return mono.slice();
  const frames = Math.max(1, Math.round((mono.length * ASR_RATE) / srcRate));
  const ctx = new OfflineAudioContext(1, frames, ASR_RATE);
  const buf = ctx.createBuffer(1, mono.length, srcRate);
  buf.copyToChannel(mono as Float32Array<ArrayBuffer>, 0);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

export async function decodeAudio16k(
  track: InputAudioTrack,
  duration: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const srcRate = await track.getSampleRate();
  const out = new Float32Array(Math.ceil(duration * ASR_RATE) + 1);
  const chunk = Math.round(CHUNK_SEC * srcRate);
  const roll = Math.round(ROLL_SEC * srcRate);

  // Rolling mono buffer of source-rate samples, starting at source sample `bufStart`.
  let buf = new Float32Array(chunk + roll * 4);
  let bufLen = 0;
  let bufStart = 0;
  // Next chunk to emit starts at this source sample.
  let next = 0;

  const ensure = (extra: number) => {
    if (bufLen + extra <= buf.length) return;
    const grown = new Float32Array(Math.max(buf.length * 2, bufLen + extra));
    grown.set(buf.subarray(0, bufLen));
    buf = grown;
  };

  const emit = async (final: boolean) => {
    // Emit whole chunks while we have post-roll for them (or everything at the end).
    while (true) {
      const available = bufStart + bufLen;
      const chunkEnd = next + chunk;
      if (!final && available < chunkEnd + roll) return;
      if (next >= available) return;
      const from = Math.max(bufStart, next - roll);
      const to = Math.min(available, chunkEnd + roll);
      const span = buf.subarray(from - bufStart, to - bufStart);
      const res = await resample(span, srcRate);
      const skip = Math.round(((next - from) * ASR_RATE) / srcRate);
      const keep = Math.round(((Math.min(chunkEnd, available) - next) * ASR_RATE) / srcRate);
      const at = Math.round((next * ASR_RATE) / srcRate);
      const piece = res.subarray(skip, Math.min(res.length, skip + keep));
      out.set(piece.subarray(0, Math.max(0, Math.min(piece.length, out.length - at))), at);
      next = chunkEnd;
      // Drop what no future chunk needs (keep pre-roll).
      const dropTo = Math.max(bufStart, next - roll);
      const drop = dropTo - bufStart;
      if (drop > 0) {
        buf.copyWithin(0, drop, bufLen);
        bufLen -= drop;
        bufStart = dropTo;
      }
      if (final && next >= available) return;
    }
  };

  const sink = new AudioBufferSink(track);
  let lastReport = 0;
  for await (const { buffer, timestamp } of sink.buffers()) {
    if (signal?.aborted) throw new Cancelled();
    const channels = buffer.numberOfChannels;
    const n = buffer.length;
    // Place by timestamp: fill small gaps with silence, drop overlaps.
    const at = Math.round(timestamp * srcRate);
    const end = bufStart + bufLen;
    if (at > end) {
      const gap = Math.min(at - end, srcRate * 5);
      ensure(gap);
      buf.fill(0, bufLen, bufLen + gap);
      bufLen += gap;
    }
    const skip = Math.max(0, bufStart + bufLen - at);
    if (skip < n) {
      ensure(n - skip);
      const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
      for (let i = skip; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += data[c]![i]!;
        buf[bufLen++] = s / channels;
      }
    }
    await emit(false);
    const t = timestamp + buffer.duration;
    if (onProgress && t - lastReport > 0.5) {
      lastReport = t;
      onProgress(Math.min(1, t / duration));
    }
  }
  await emit(true);
  onProgress?.(1);
  return out;
}

/** Max |sample| per bucket, for the waveform. */
export function computePeaks(samples: Float32Array, rate = ASR_RATE, perSecond = 100): Float32Array {
  const hop = Math.max(1, Math.round(rate / perSecond));
  const n = Math.ceil(samples.length / hop);
  const out = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let m = 0;
    const end = Math.min(samples.length, (b + 1) * hop);
    for (let i = b * hop; i < end; i++) {
      const v = Math.abs(samples[i]!);
      if (v > m) m = v;
    }
    out[b] = m;
  }
  return out;
}
