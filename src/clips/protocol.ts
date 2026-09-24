import type { ClipResult, Sentence } from './prompt';

/** `attempt` > 0 means "Suggest again": sample more freely for variety. */
export type ClipRequest = { type: 'run'; model: string; sentences: Sentence[]; attempt: number };

export type ClipEvent =
  | { type: 'progress'; stage: 'download' | 'read'; fraction: number | null; detail: string }
  | { type: 'result'; result: ClipResult }
  | { type: 'error'; message: string };
