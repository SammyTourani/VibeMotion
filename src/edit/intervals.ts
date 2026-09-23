import type { Interval } from '../project/types';

const EPS = 1e-9;

/** Sorts and merges overlapping or touching intervals. Drops empty ones. */
export function normalize(list: readonly Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end - i.start > EPS)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end + EPS) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function union(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  return normalize([...a, ...b]);
}

/** a minus b. Both inputs may be unnormalized. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const A = normalize(a);
  const B = normalize(b);
  const out: Interval[] = [];
  let j = 0;
  for (const seg of A) {
    let start = seg.start;
    const end = seg.end;
    while (j < B.length && B[j]!.end <= start) j++;
    let k = j;
    while (k < B.length && B[k]!.start < end) {
      const cut = B[k]!;
      if (cut.start > start) out.push({ start, end: Math.min(cut.start, end) });
      start = Math.max(start, cut.end);
      if (start >= end) break;
      k++;
    }
    if (start < end - EPS) out.push({ start, end });
  }
  return out;
}

export function clampTo(list: readonly Interval[], lo: number, hi: number): Interval[] {
  return normalize(
    list.map((i) => ({ start: Math.max(lo, i.start), end: Math.min(hi, i.end) })),
  );
}

/** The gaps between intervals inside [lo, hi]. */
export function complement(list: readonly Interval[], lo: number, hi: number): Interval[] {
  return subtract([{ start: lo, end: hi }], list);
}

export function totalLength(list: readonly Interval[]): number {
  let t = 0;
  for (const i of list) t += i.end - i.start;
  return t;
}

/** Index of the interval containing t, or -1. List must be normalized. */
export function indexAt(list: readonly Interval[], t: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const it = list[mid]!;
    if (t < it.start) hi = mid - 1;
    else if (t >= it.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function overlap(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}
