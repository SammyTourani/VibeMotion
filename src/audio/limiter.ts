// True-peak measurement and a look-ahead true-peak limiter.
//
// Sample peaks under-read what a DAC (or a lossy encoder) produces between
// samples. We estimate inter-sample peaks with 4x polyphase interpolation
// (windowed sinc, 12 taps per phase, as in BS.1770 Annex 2), then compute the
// gain each sample needs, look ahead so the gain is already down when a peak
// arrives, and release smoothly.

const TAPS = 12;
const HALF = TAPS / 2;

function sinc(x: number): number {
  if (Math.abs(x) < 1e-9) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Coefficients for the three in-between phases (1/4, 2/4, 3/4). */
const PHASES: Float64Array[] = [1, 2, 3].map((p) => {
  const frac = p / 4;
  const c = new Float64Array(TAPS);
  let sum = 0;
  for (let k = 0; k < TAPS; k++) {
    const offset = k - (HALF - 1); // taps at n-5 .. n+6
    const u = frac - offset;
    const w = Math.abs(u) < HALF ? 0.5 * (1 + Math.cos((Math.PI * u) / HALF)) : 0;
    c[k] = sinc(u) * w;
    sum += c[k]!;
  }
  for (let k = 0; k < TAPS; k++) c[k] = c[k]! / sum;
  return c;
});

/** Per-sample peak estimate across channels, including the 3 inter-sample points after each sample. */
export function peakEnvelope(channels: readonly Float32Array[]): Float32Array {
  const len = channels[0]?.length ?? 0;
  const env = new Float32Array(len);
  for (const x of channels) {
    for (let n = 0; n < len; n++) {
      let p = Math.abs(x[n]!);
      for (const c of PHASES) {
        let acc = 0;
        for (let k = 0; k < TAPS; k++) {
          const idx = n + k - (HALF - 1);
          if (idx >= 0 && idx < len) acc += x[idx]! * c[k]!;
        }
        const a = Math.abs(acc);
        if (a > p) p = a;
      }
      if (p > env[n]!) env[n] = p;
    }
  }
  return env;
}

export function truePeak(channels: readonly Float32Array[]): number {
  const env = peakEnvelope(channels);
  let m = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > m) m = env[i]!;
  return m;
}

export const dbToLin = (db: number) => 10 ** (db / 20);
export const linToDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export interface LimiterOptions {
  ceilingDb?: number;
  lookahead?: number;
  release?: number;
}

/**
 * Limits in place so that the true peak stays under `ceilingDb` (default
 * -1 dBTP). Returns the maximum gain reduction applied, in dB (<= 0).
 */
export function limitTruePeak(channels: Float32Array[], fs: number, opts: LimiterOptions = {}): number {
  const len = channels[0]?.length ?? 0;
  if (len === 0) return 0;
  // Aim slightly under the ceiling: gain changes themselves nudge peaks.
  const ceiling = dbToLin((opts.ceilingDb ?? -1) - 0.15);
  const L = Math.max(1, Math.round((opts.lookahead ?? 0.005) * fs));
  const relCoef = 1 - Math.exp(-1 / ((opts.release ?? 0.08) * fs));

  const env = peakEnvelope(channels);
  const req = new Float32Array(len);
  let any = false;
  for (let n = 0; n < len; n++) {
    const g = env[n]! > ceiling ? ceiling / env[n]! : 1;
    req[n] = g;
    if (g < 1) any = true;
  }
  if (!any) return 0;

  // h[n] = min(req[n .. n+L-1]) via a monotonic deque.
  const h = new Float32Array(len);
  const dq = new Int32Array(len);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let n = 0; n < len; n++) {
    const end = Math.min(len - 1, n + L - 1);
    while (next <= end) {
      while (tail > head && req[dq[tail - 1]!]! >= req[next]!) tail--;
      dq[tail++] = next;
      next++;
    }
    while (dq[head]! < n) head++;
    h[n] = req[dq[head]!]!;
  }

  // Box-average over the last L values: a ramp that reaches each peak's
  // required gain exactly when the peak arrives (never later).
  const s = new Float32Array(len);
  let acc = L; // L samples of unity gain "before" the start
  for (let n = 0; n < len; n++) {
    acc += h[n]!;
    const drop = n - L;
    acc -= drop >= 0 ? h[drop]! : 1;
    s[n] = Math.min(1, acc / L);
  }

  // Release: fall instantly with s, recover slowly.
  let g = 1;
  let minG = 1;
  for (let n = 0; n < len; n++) {
    const target = s[n]!;
    g = target < g ? target : g + (target - g) * relCoef;
    if (g < minG) minG = g;
    for (const c of channels) c[n] = c[n]! * g;
  }
  return linToDb(minG);
}
