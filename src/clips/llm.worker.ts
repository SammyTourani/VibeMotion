// Runs WebLLM entirely in this worker: loading, prompting, parsing. Using
// MLCEngine here (rather than CreateWebWorkerMLCEngine's main-thread proxy)
// keeps the 6 MB library out of the main thread's downloads entirely.

import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';
import {
  CLIP_SYSTEM,
  META_SYSTEM,
  chunkPassages,
  clipPrompt,
  clipSchema,
  mergeClips,
  metaPrompt,
  metaSchema,
  parseClips,
  parseMeta,
  passagesOf,
  type ClipSuggestion,
} from './prompt';
import type { ClipRequest, ClipEvent } from './protocol';

let engine: MLCEngine | null = null;
let loaded = '';
const post = (e: ClipEvent) => (self as unknown as { postMessage(m: ClipEvent): void }).postMessage(e);

async function ask(system: string, user: string, schema: string, temperature: number, maxTokens: number): Promise<string> {
  const reply = await engine!.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object', schema },
    // Qwen 3.x would otherwise "think" before answering; WebLLM switches that off here.
    extra_body: { enable_thinking: false },
  });
  return reply.choices[0]?.message.content ?? '';
}

async function run(req: Extract<ClipRequest, { type: 'run' }>) {
  const initProgressCallback = (r: { progress: number; text: string }) =>
    post({ type: 'progress', stage: 'download', fraction: r.progress, detail: r.text });
  if (!engine) engine = await CreateMLCEngine(req.model, { initProgressCallback });
  else if (loaded !== req.model) await engine.reload(req.model);
  loaded = req.model;
  const temperature = req.attempt > 0 ? 0.8 : 0.3;
  const chunks = chunkPassages(passagesOf(req.sentences));
  const steps = chunks.length + 1;
  const groups: ClipSuggestion[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    post({ type: 'progress', stage: 'read', fraction: i / steps, detail: chunks.length > 1 ? `Part ${i + 1} of ${chunks.length}` : '' });
    const count = chunks.length > 1 ? 2 : 3;
    const text = await ask(CLIP_SYSTEM, clipPrompt(chunks[i]!, count), clipSchema(chunks[i]!, count), temperature, 600);
    groups.push(parseClips(text, chunks[i]!));
  }
  post({ type: 'progress', stage: 'read', fraction: chunks.length / steps, detail: 'Writing a title' });
  const meta = parseMeta(await ask(META_SYSTEM, metaPrompt(req.sentences), metaSchema(), temperature, 200));
  post({ type: 'result', result: { clips: mergeClips(groups, 3), ...meta } });
}

self.addEventListener('message', (e: MessageEvent<ClipRequest>) => {
  if (e.data.type === 'run') {
    run(e.data).catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
  }
});
