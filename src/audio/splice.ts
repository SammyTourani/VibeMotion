// Joins the kept segments into one continuous track. Every join gets a short
// equal-power crossfade centred on the cut (10 ms by default): long enough
// that no click survives, short enough that no syllable blurs. Output length
// is fixed by the EDL, so audio and video stay frame-accurate.

export interface SegmentAudio {
  /** Decoded audio covering at least [start - margin, end + margin]. */
  pcm: Float32Array[];
  /** Source time (s) of pcm[c][0]. */
  pcmStart: number;
  /** Kept range, source seconds. */
  start: number;
  end: number;
}

export function spliceSegments(
  segs: readonly SegmentAudio[],
  fs: number,
  channels: number,
  xfade = 0.01,
  edgeFade = 0.005,
): Float32Array[] {
  const bounds: number[] = [0];
  let cum = 0;
  for (const s of segs) {
    cum += s.end - s.start;
    bounds.push(Math.round(cum * fs));
  }
  const total = bounds[bounds.length - 1]!;
  const out = Array.from({ length: channels }, () => new Float32Array(total));

  const read = (seg: SegmentAudio, ch: number, outIndex: number, segOutStart: number): number => {
    const src = seg.pcm[Math.min(ch, seg.pcm.length - 1)]!;
    const srcStart = Math.round((seg.start - seg.pcmStart) * fs);
    const idx = srcStart + (outIndex - segOutStart);
    if (idx < 0) return src[0] ?? 0;
    if (idx >= src.length) return src[src.length - 1] ?? 0;
    return src[idx]!;
  };

  const half = Math.max(1, Math.round((xfade * fs) / 2));
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]!;
    const a = bounds[k]!;
    const b = bounds[k + 1]!;
    for (let ch = 0; ch < channels; ch++) {
      const o = out[ch]!;
      for (let n = a; n < b; n++) o[n] = read(seg, ch, n, a);
    }
  }

  // Crossfade across each join, reading each side past its edge into the
  // decode margin (the audio that was cut) for the overlap.
  for (let k = 0; k + 1 < segs.length; k++) {
    const left = segs[k]!;
    const right = segs[k + 1]!;
    const B = bounds[k + 1]!;
    const lo = Math.max(bounds[k]!, B - half);
    const hi = Math.min(bounds[k + 2]!, B + half);
    const span = hi - lo;
    if (span <= 1) continue;
    for (let n = lo; n < hi; n++) {
      const w = (n - lo + 0.5) / span;
      const gOut = Math.cos((w * Math.PI) / 2);
      const gIn = Math.sin((w * Math.PI) / 2);
      for (let ch = 0; ch < channels; ch++) {
        const x = read(left, ch, n, bounds[k]!);
        const y = read(right, ch, n, B);
        out[ch]![n] = x * gOut + y * gIn;
      }
    }
  }

  // Short fades at the very start and end.
  const edge = Math.min(Math.round(edgeFade * fs), Math.floor(total / 2));
  for (let ch = 0; ch < channels; ch++) {
    const o = out[ch]!;
    for (let n = 0; n < edge; n++) {
      const g = (n + 0.5) / edge;
      o[n] = o[n]! * g;
      o[total - 1 - n] = o[total - 1 - n]! * g;
    }
  }
  return out;
}
