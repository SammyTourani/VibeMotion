// Transcription worker: Whisper via transformers.js, on WebGPU when the
// browser has it and WebAssembly otherwise. Windows are transcribed one at a
// time, so progress is real and cancel takes effect at the next window.

import { env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { AsrDevice } from './models';
import type { AsrEvent, AsrRequest, RawWord } from './protocol';

env.allowLocalModels = false;
// ORT's WebAssembly comes from jsDelivr with year-long immutable caching, so
// the HTTP cache already keeps it. transformers.js's extra Cache API copy
// fails in some profiles and only adds a warning.
env.useWasmCache = false;

const RATE = 16000;
let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedKey = '';
const cancelled = new Set<number>();

const post = (e: AsrEvent) => (self as unknown as { postMessage(m: AsrEvent): void }).postMessage(e);

async function load(req: Extract<AsrRequest, { type: 'load' }>) {
  const key = `${req.repo}|${req.device}|${JSON.stringify(req.dtype)}`;
  if (asr && loadedKey === key) {
    post({ type: 'ready', device: req.device });
    return;
  }
  if (asr) {
    await asr.dispose();
    asr = null;
  }
  const created = await pipeline('automatic-speech-recognition', req.repo, {
    device: req.device,
    dtype: req.dtype as never,
    progress_callback: (p) => {
      if (p.status === 'progress_total') post({ type: 'download', loaded: p.loaded, total: p.total });
    },
  });
  asr = created as AutomaticSpeechRecognitionPipeline;
  if (req.device === 'webgpu') {
    // First run compiles the GPU shaders; do it now, not on the user's audio.
    post({ type: 'status', message: 'Preparing the GPU' });
    await asr(new Float32Array(RATE), { language: 'en' });
  }
  loadedKey = key;
  post({ type: 'ready', device: req.device as AsrDevice });
}

/**
 * transformers.js (v4.3) does not detect language yet; it silently assumes
 * English. Run one decoder step from <|startoftranscript|> and take the most
 * likely language token, the same way Whisper itself does.
 */
async function detectLanguage(audio: Float32Array): Promise<string> {
  const p = asr!;
  const gen = (p.model as unknown as { generation_config: Record<string, unknown> }).generation_config;
  const langToId = gen.lang_to_id as Record<string, number> | undefined;
  const sot = gen.decoder_start_token_id as number | undefined;
  if (!langToId || sot === undefined) return 'en';
  const inputs = (await (p.processor as unknown as (a: Float32Array) => Promise<{ input_features: Tensor }>)(audio));
  const decoderIds = new Tensor('int64', BigInt64Array.from([BigInt(sot)]), [1, 1]);
  const out = (await (p.model as unknown as (x: object) => Promise<Record<string, Tensor>>)({
    input_features: inputs.input_features,
    decoder_input_ids: decoderIds,
  }));
  const logits = out.logits!;
  const vocab = logits.dims[logits.dims.length - 1]!;
  const data = logits.data as Float32Array;
  const offset = data.length - vocab;
  let best = 'en';
  let bestScore = -Infinity;
  for (const [token, id] of Object.entries(langToId)) {
    const s = data[offset + id]!;
    if (s > bestScore) {
      bestScore = s;
      best = token.replace(/^<\|/, '').replace(/\|>$/, '');
    }
  }
  for (const t of Object.values(out)) (t as { dispose?: () => void }).dispose?.();
  return best;
}

async function transcribe(req: Extract<AsrRequest, { type: 'transcribe' }>) {
  const p = asr;
  if (!p) throw new Error('The speech model is not loaded yet.');
  const { job, audio, windows, task } = req;
  let language = req.language;

  if (language === 'auto') {
    const first = windows.find((w) => w.speech) ?? windows[0]!;
    const slice = audio.subarray(Math.round(first.start * RATE), Math.round(Math.min(first.end, first.start + 30) * RATE));
    language = await detectLanguage(slice);
    post({ type: 'language', job, language });
  }

  for (let i = 0; i < windows.length; i++) {
    if (cancelled.has(job)) {
      cancelled.delete(job);
      post({ type: 'cancelled', job });
      return;
    }
    const w = windows[i]!;
    let words: RawWord[] = [];
    if (w.speech) {
      const slice = audio.subarray(Math.round(w.start * RATE), Math.round(w.end * RATE));
      const res = (await p(slice, { return_timestamps: 'word', language, task })) as {
        chunks?: { text: string; timestamp: [number, number | null] }[];
      };
      const span = w.end - w.start;
      words = (res.chunks ?? [])
        .map((c) => {
          const a = Math.max(0, c.timestamp[0] ?? 0);
          const b = Math.min(span, c.timestamp[1] ?? span);
          return { text: c.text.trim(), start: w.start + a, end: w.start + Math.max(a, b) };
        })
        .filter((x) => x.text.length > 0);
    }
    post({ type: 'window', job, index: i, count: windows.length, words });
  }
  post({ type: 'done', job, language });
}

self.addEventListener('message', (e: MessageEvent<AsrRequest>) => {
  const req = e.data;
  if (req.type === 'cancel') {
    cancelled.add(req.job);
    return;
  }
  const run = req.type === 'load' ? load(req) : transcribe(req);
  run.catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', job: req.type === 'transcribe' ? req.job : undefined, message });
  });
});
