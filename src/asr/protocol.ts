import type { AsrDevice } from './models';

export interface RawWord {
  text: string;
  start: number;
  end: number;
}

export type AsrRequest =
  | { type: 'load'; repo: string; device: AsrDevice; dtype: Record<string, string> }
  | {
      type: 'transcribe';
      job: number;
      audio: Float32Array;
      windows: { start: number; end: number; speech: boolean }[];
      /** ISO code, or 'auto' to detect from the first window with speech. */
      language: string;
      task: 'transcribe' | 'translate';
    }
  | { type: 'cancel'; job: number };

export type AsrEvent =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'status'; message: string }
  | { type: 'ready'; device: AsrDevice }
  | { type: 'language'; job: number; language: string }
  | { type: 'window'; job: number; index: number; count: number; words: RawWord[] }
  | { type: 'done'; job: number; language: string }
  | { type: 'cancelled'; job: number }
  | { type: 'error'; job?: number; message: string };
