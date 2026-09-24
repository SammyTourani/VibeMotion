// On-device "Find the best clips" with WebLLM (Qwen3.5, q4f16), all in a
// worker. Loaded only when someone asks for it.

import type { ClipResult, Sentence } from './prompt';
import type { ClipEvent, ClipRequest } from './protocol';

export const CLIP_MODELS = {
  quick: {
    id: 'Qwen3.5-0.8B-q4f16_1-MLC',
    label: 'Quick',
    /** Measured: the weights (447 MB) plus the WebGPU library (6 MB). */
    downloadMB: 453,
    blurb: 'Qwen3.5 0.8B, a small model: treat its picks as a starting point.',
  },
} as const;

export type ClipModelId = keyof typeof CLIP_MODELS;

export class ClipsCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'ClipsCancelled';
  }
}

/** Needs WebGPU with 16-bit floats (the q4f16 build). */
export async function clipFinderSupported(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    return !!adapter?.features.has('shader-f16');
  } catch {
    return false;
  }
}

/** WebLLM keeps weights in the "webllm/model" Cache API store, keyed by URL. */
export async function clipModelCached(model: ClipModelId): Promise<boolean> {
  try {
    if (!(await caches.has('webllm/model'))) return false;
    const keys = await (await caches.open('webllm/model')).keys();
    return keys.some((r) => r.url.includes(`/${CLIP_MODELS[model].id}/`) && /(tensor|ndarray)-cache\.json/.test(r.url));
  } catch {
    return false;
  }
}

let worker: Worker | null = null;

export function findClips(
  sentences: readonly Sentence[],
  model: ClipModelId,
  attempt: number,
  onProgress: (stage: 'download' | 'read', fraction: number | null, detail: string) => void,
  signal: AbortSignal,
): Promise<ClipResult> {
  worker ??= new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module', name: 'clips' });
  const w = worker;
  return new Promise<ClipResult>((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
    };
    // Release the model (about 1.6 GB of GPU memory) once it has answered, so
    // it doesn't sit there during editing and export. The weights stay in the
    // browser's cache, so asking again only reloads them.
    const release = () => {
      w.terminate();
      if (worker === w) worker = null;
    };
    const onMessage = (e: MessageEvent<ClipEvent>) => {
      const ev = e.data;
      if (ev.type === 'progress') onProgress(ev.stage, ev.fraction, ev.detail);
      else if (ev.type === 'result') {
        done();
        release();
        resolve(ev.result);
      } else {
        done();
        release();
        reject(new Error(ev.message));
      }
    };
    const onAbort = () => {
      done();
      w.terminate();
      worker = null;
      reject(new ClipsCancelled());
    };
    w.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    w.postMessage({ type: 'run', model: CLIP_MODELS[model].id, sentences: [...sentences], attempt } satisfies ClipRequest);
  });
}
