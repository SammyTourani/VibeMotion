// Integrated loudness per ITU-R BS.1770-4 / EBU R128: K-weighting (a high
// shelf plus the RLB high-pass), 400 ms blocks with 75% overlap, an absolute
// gate at -70 LUFS and a relative gate 10 LU below the ungated level.
// Filter coefficients are derived for any sample rate (the standard lists
// them only for 48 kHz), using the same analog prototypes as libebur128.

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function kWeighting(fs: number): [Biquad, Biquad] {
  // Stage 1: high shelf, +4 dB above ~1.5 kHz (head acoustics).
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: RLB high-pass at ~38 Hz.
  const f1 = 38.13547087602444;
  const Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / fs);
  const d = 1 + K1 / Q1 + K1 * K1;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K1 * K1 - 1)) / d,
    a2: (1 - K1 / Q1 + K1 * K1) / d,
  };
  return [shelf, hp];
}

export function biquad(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

/** Mean-square energy of each 400 ms gating block, summed over channels. */
export function blockEnergies(channels: readonly Float32Array[], fs: number): Float64Array {
  const [shelf, hp] = kWeighting(fs);
  const weighted = channels.map((c) => biquad(biquad(c, shelf), hp));
  const len = channels[0]?.length ?? 0;
  const block = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  if (len < block) {
    // Shorter than one block: measure what there is.
    let z = 0;
    for (const w of weighted) {
      let acc = 0;
      for (let i = 0; i < len; i++) acc += w[i]! * w[i]!;
      z += len ? acc / len : 0;
    }
    return Float64Array.of(z);
  }
  // Prefix sums of squares per channel make each block O(1).
  const prefix = weighted.map((w) => {
    const p = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) p[i + 1] = p[i]! + w[i]! * w[i]!;
    return p;
  });
  const nBlocks = Math.floor((len - block) / hop) + 1;
  const out = new Float64Array(nBlocks);
  for (let j = 0; j < nBlocks; j++) {
    const a = j * hop;
    const b = a + block;
    let z = 0;
    for (const p of prefix) z += (p[b]! - p[a]!) / block;
    out[j] = z;
  }
  return out;
}

const toLufs = (z: number) => -0.691 + 10 * Math.log10(z);

/** Integrated loudness in LUFS (-Infinity for silence). */
export function integratedLoudness(channels: readonly Float32Array[], fs: number): number {
  const z = blockEnergies(channels, fs);
  const absGated: number[] = [];
  for (const v of z) if (v > 0 && toLufs(v) > -70) absGated.push(v);
  if (absGated.length === 0) return -Infinity;
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const relThreshold = toLufs(mean(absGated)) - 10;
  const relGated = absGated.filter((v) => toLufs(v) > relThreshold);
  if (relGated.length === 0) return -Infinity;
  return toLufs(mean(relGated));
}

/** Linear gain that brings `measured` LUFS to `target` LUFS, capped at +20 dB. */
export function normalizationGain(measured: number, target = -14, maxBoostDb = 20): number {
  if (!Number.isFinite(measured)) return 1;
  const db = Math.min(maxBoostDb, target - measured);
  return 10 ** (db / 20);
}
