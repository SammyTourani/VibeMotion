// Main-thread handle on the transcription worker.

import { ASR_MODELS, deviceOf, type AsrBackend, type AsrModelId } from './models';
import type { AsrEvent, AsrRequest, RawWord } from './protocol';

export interface TranscribeOptions {
  audio: Float32Array;
  windows: { start: number; end: number; speech: boolean }[];
  language: string;
  task: 'transcribe' | 'translate';
  onWindow?: (index: number, count: number, words: RawWord[]) => void;
  onLanguage?: (language: string) => void;
}

export class AsrCancelled extends Error {
  constructor() {
    super('Transcription cancelled');
    this.name = 'AsrCancelled';
  }
}

export class AsrClient {
  private worker: Worker | null = null;
  private loadedKey = '';
  private job = 0;
  private listeners = new Set<(e: AsrEvent) => void>();
  private rejectPending: ((err: Error) => void) | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module', name: 'asr' });
      this.worker.addEventListener('message', (e: MessageEvent<AsrEvent>) => {
        for (const l of this.listeners) l(e.data);
      });
      this.worker.addEventListener('error', (e) => {
        const err = new Error(e.message || 'The transcription worker crashed.');
        for (const l of this.listeners) l({ type: 'error', message: err.message });
      });
    }
    return this.worker;
  }

  private send(req: AsrRequest, transfer: Transferable[] = []) {
    this.ensureWorker().postMessage(req, transfer);
  }

  private waitFor<T>(handler: (e: AsrEvent, resolve: (v: T) => void, reject: (err: Error) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const done = () => {
        this.listeners.delete(listener);
        this.rejectPending = null;
      };
      const listener = (e: AsrEvent) =>
        handler(
          e,
          (v) => {
            done();
            resolve(v);
          },
          (err) => {
            done();
            reject(err);
          },
        );
      this.listeners.add(listener);
      this.rejectPending = (err) => {
        done();
        reject(err);
      };
    });
  }

  /** Loads (downloading on first use) a model. Resolves when it is ready to transcribe. */
  async load(
    model: AsrModelId,
    backend: AsrBackend,
    onDownload?: (loaded: number, total: number) => void,
    onStatus?: (message: string) => void,
  ): Promise<void> {
    const m = ASR_MODELS[model];
    const key = `${m.repo}|${backend}`;
    if (this.worker && this.loadedKey === key) return;
    const ready = this.waitFor<void>((e, resolve, reject) => {
      if (e.type === 'download') onDownload?.(e.loaded, e.total);
      else if (e.type === 'status') onStatus?.(e.message);
      else if (e.type === 'ready') resolve();
      else if (e.type === 'error' && e.job === undefined) reject(new Error(e.message));
    });
    this.send({ type: 'load', repo: m.repo, device: deviceOf(backend), dtype: m.dtype[backend] });
    await ready;
    this.loadedKey = key;
  }

  async transcribe(opts: TranscribeOptions): Promise<{ words: RawWord[]; language: string }> {
    const job = ++this.job;
    const all: RawWord[][] = [];
    const result = this.waitFor<{ words: RawWord[]; language: string }>((e, resolve, reject) => {
      if (!('job' in e) || e.job !== job) {
        if (e.type === 'error' && e.job === undefined) reject(new Error(e.message));
        return;
      }
      if (e.type === 'language') opts.onLanguage?.(e.language);
      else if (e.type === 'window') {
        all[e.index] = e.words;
        opts.onWindow?.(e.index, e.count, e.words);
      } else if (e.type === 'done') resolve({ words: all.flat(), language: e.language });
      else if (e.type === 'cancelled') reject(new AsrCancelled());
      else if (e.type === 'error') reject(new Error(e.message));
    });
    // Copy: the caller keeps its audio for the waveform and silence detection.
    const audio = opts.audio.slice();
    this.send(
      { type: 'transcribe', job, audio, windows: opts.windows, language: opts.language, task: opts.task },
      [audio.buffer],
    );
    return result;
  }

  /** Stops at the next window. During a model download, stops immediately. */
  cancel(duringLoad: boolean) {
    if (duringLoad) {
      this.terminate();
      return;
    }
    this.send({ type: 'cancel', job: this.job });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.loadedKey = '';
    this.rejectPending?.(new AsrCancelled());
  }
}
