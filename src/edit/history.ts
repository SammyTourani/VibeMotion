// Undo/redo over immutable snapshots. Snapshots share structure (the word
// list is never copied), so keeping a few hundred is cheap.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Consecutive commits with the same key inside the window merge into one step. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 300;
export const COALESCE_MS = 900;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function commit<T>(
  h: History<T>,
  next: T,
  opts: { coalesce?: string; now?: number } = {},
): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const key = opts.coalesce ?? null;
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = h.past.length >= HISTORY_LIMIT ? h.past.slice(1) : h.past.slice();
  past.push(h.present);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const past = h.past.slice(0, -1);
  const prev = h.past[h.past.length - 1] as T;
  return { past, present: prev, future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...future] = h.future as [T, ...T[]];
  return { past: [...h.past, h.present], present: next, future, lastKey: null, lastAt: 0 };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
