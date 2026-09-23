// Deterministic synthetic signals for DSP tests.

export function sine(freq: number, seconds: number, fs: number, amp = 1, phase = 0): Float32Array {
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs + phase);
  return x;
}

/** Seeded white noise (mulberry32) so tests never flake. */
export function noise(seconds: number, fs: number, amp: number, seed = 1): Float32Array {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rand() * 2 - 1) * amp;
  return x;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function add(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}
