# VibeMotion

A short-form video editor that runs entirely in the browser: Whisper transcription (transformers.js, WebGPU/WASM), pause and filler removal, text-based editing, face-tracked reframing (MediaPipe), canvas captions, and MP4 export (Mediabunny + WebCodecs). Static site on GitHub Pages at `https://sammytourani.github.io/VibeMotion/`. There is no server, API, database or secret, and there must never be one.

The previous Next.js/Remotion/Supabase app is preserved at git tag `legacy-nextjs`.

## Commands

```sh
pnpm dev          # Vite on http://localhost:5311/VibeMotion/
pnpm preview      # built site on http://localhost:5312/VibeMotion/
pnpm typecheck    # TypeScript 7 (tsgo), app + node configs
pnpm test         # Vitest unit tests for the pure modules
pnpm build
pnpm e2e          # build + Playwright against `vite preview`, in Google Chrome
node scripts/make-sample.mjs        # regenerate public/sample/sample.mp4 (macOS say + ffmpeg)
node scripts/make-landing-data.mjs  # regenerate src/landing/sample-data.json (needs pnpm dev)
node scripts/screenshots.mjs        # public/og.png + docs/*.jpg (needs pnpm preview)
```

Ports 5311/5312 are reserved for this repo. `base` is `/VibeMotion/` (case-sensitive); always test under it.

## Architecture

- `src/edit/edl.ts` is the single source of truth for time. `buildEdl()` turns the words, VAD pauses, auto fillers, word edits and timeline range ops into kept segments with `srcToOut`/`outToSrc`. Preview, export, captions and subtitles all go through it. Never compute cut times elsewhere.
- `Project` (`src/project/types.ts`) is the whole serializable edit state. Edits go through `edit()` in `src/editor/store.ts` (undoable, with coalescing for slider drags). Transcript and face data arrive through `setBase()`, which applies to every history snapshot.
- Derived data (EDL, caption words, camera path) is memoized in `src/editor/derive.ts` on immutable inputs.
- `src/render/compose.ts` draws a frame (crop, punch-in, captions) in output pixels. The editor preview, the export and the landing page all use it, so they can't drift apart.
- The playhead lives in `src/editor/transport.ts`, outside React state; subscribers update the DOM directly.
- Heavy code is lazy: the editor, Mediabunny, MediaPipe (`reframe/detect.ts`), transformers.js (the ASR worker) and WebLLM (the clip worker) never load on the landing page (about 90 KB gzip of JS).
- `src/clips/` is the opt-in "Find the best clips" (videos of 90 s or more, WebGPU with `shader-f16`). WebLLM runs Qwen3.5 0.8B inside `llm.worker.ts` via `CreateMLCEngine`; `CreateWebWorkerMLCEngine` would pull the 6 MB library into the main thread as well. The code splits the transcript into 20-60 s passages at the longest pauses and the model only chooses passage numbers (a JSON-schema `enum`), so it can't invent times. The chosen range is `Project.clip`, which `buildEdl()` applies like any other cut.
- Pure modules with unit tests: `edit/`, `captions/layout`, `reframe/track`+`crop`, `audio/`, `asr/windows`, `export/subtitles`, `clips/prompt`. Keep new logic pure and tested where possible.

## Things that bit us (don't relearn them)

- transformers.js 4.3 **does not detect language** (it assumes English). `asr.worker.ts` runs one decoder step and picks the top language token.
- transformers.js 4.3's `progress_total` resolves per-module dtypes to the fp32 encoder when sizing, overstating fp16 loads by about 80 MB. The worker computes progress from per-file `progress` events instead.
- ONNX Runtime's WebAssembly loads from jsDelivr (5.5 MB brotli). `vite.config.ts` drops the unused 27 MB copy from `dist`. `env.useWasmCache = false` avoids a noisy Cache API failure.
- fp16 encoder + q4f16 decoder on `shader-f16` GPUs matched fp32/q4 output on the sample at half the download. Without `shader-f16`, it's fp32/q4; without WebGPU, q8 on WASM.
- **AAC priming**: WebCodecs doesn't report the encoder delay (2112 samples on macOS), so audio would lag by about 44 ms. `measureEncoderDelay()` round-trips a tone burst, and the audio source starts at `-delay` so Mediabunny writes an edit list.
- Whisper stretches sentence-final words into the next pause. `refineWords()` snaps word edges out of VAD pauses before the EDL is built.
- A fresh canvas is 300×150. When resizing, compare **both** dimensions; a 300 px-wide container otherwise leaves the height at 150.
- MediaPipe prints glog `I…`/`W…` lines to the console; `detect.ts` filters exactly those (E/F lines still show).
- Playwright's bundled Chromium has no H.264/AAC. E2E uses `channel: 'chrome'`, where headless WebGPU works (Metal on macOS).
- Chrome 153 **segfaults its browser process** when an automated download completes (headless and headed, with either CDP download behaviour). `e2e/fixtures.ts` captures downloads at the app boundary instead (the Blob handed to `<a download>`).
- The Vite dev server hot-reloads open pages when files change, which breaks scripts mid-run. Use `pnpm preview` for anything scripted.
- WebLLM with Qwen 3.x: `extra_body: { enable_thinking: false }` still prepends an empty `<think></think>` block, so strip it before `JSON.parse`.
- The 0.8B model can't be trusted with ranges. Asked for sentence ranges, it listed a two-sentence clip for every sentence until `max_tokens` cut the JSON off. Asked for a title in the same prompt, it titled the video "The 3 Best TikTok Clips". Hence passages chosen by number, `maxItems` on the array, salvaging complete objects from truncated output, and a separate title prompt that never mentions clips.
- The clip worker is terminated after each answer to free about 1.6 GB of GPU memory. The weights stay in the Cache API store `webllm/model`, so asking again only reloads them.

## Design system

The page is an editing suite, not a marketing site. Colour is semantic, borrowed from broadcast colour bars: **yellow `#FFD426` = now / active / primary action, cyan `#2BD4E0` = kept, magenta `#FF3D8B` = cut**. Never use them decoratively. Surfaces: graphite `#1C1D20`, panel `#26282C`, hairline `#36383D`; text paper `#F2F2EE`, muted `#9C9D9B`. Type is Archivo (variable, with the width axis); timecodes use tabular numerals, never a monospace face. Tokens live in `src/styles/base.css`.

Copy is plain and specific, in sentence case and active voice. Buttons say what they do ("Export MP4"). Avoid hype words, all-caps labels, arrows glued onto button text, and emoji. Errors say what happened and what to do.

## Verification

"Done" means proven: `pnpm typecheck && pnpm test && pnpm build`, then `pnpm e2e`. The E2E suite exports the sample MP4 and checks it with `ffprobe` (H.264 1080×1920, AAC, duration within 0.1 s of the EDL), checks SRT timings are in output time, and screenshots the landing page and editor at 1440, 1280 and 390 px. Look at the screenshots. Two slow tests are opt-in: `VM_E2E_WASM=1` (transcription without WebGPU) and `VM_E2E_CLIPS=1` (clip suggestions on a generated 90 s talk; 453 MB model). Run the second after touching `src/clips/`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes `dist` to GitHub Pages on pushes to `main`. `ci.yml` typechecks, tests and builds on every push and PR. Agents commit locally only; the owner pushes and manages Pages settings.
