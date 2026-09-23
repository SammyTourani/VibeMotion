#!/usr/bin/env node
// Runs the real pipeline on the sample clip (Whisper, VAD, face tracking) in
// Chrome and saves what the landing page needs to replay it without running
// any models: src/landing/sample-data.json. The landing page then computes
// the EDL, camera path and captions from this with the editor's own code.
//
// Needs the dev server (pnpm dev) on :5311 and Google Chrome.
//   node scripts/make-landing-data.mjs [userDataDir]

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:5311/VibeMotion/';
const profile = process.argv[2] ?? join(ROOT, 'e2e/.artifacts/profile');

const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
});
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(BASE);
  await page.evaluate(
    () =>
      new Promise((r) => {
        const q = indexedDB.deleteDatabase('vibemotion');
        q.onsuccess = q.onerror = q.onblocked = () => r();
      }),
  );
  await page.goto(`${BASE}#/edit`);
  await page.getByRole('button', { name: 'Try the sample clip' }).click();
  await page.locator('.transcript-body .w').first().waitFor({ timeout: 10 * 60_000 });
  await page.getByRole('tab', { name: 'Frame' }).click();
  await page.waitForFunction(() => !document.querySelector('.inspector .job'), null, { timeout: 5 * 60_000 });
  await page.waitForTimeout(1500); // autosave

  const data = await page.evaluate(async (base) => {
    const load = (p) => import(/* @vite-ignore */ `${base}src/${p}`);
    const [{ probeFile }, { decodeAudio16k, computePeaks }, vad, track, handoff] = await Promise.all([
      load('media/probe.ts'),
      load('media/audio.ts'),
      load('edit/vad.ts'),
      load('reframe/track.ts'),
      load('app/handoff.ts'),
    ]);
    const saved = await new Promise((resolve, reject) => {
      const req = indexedDB.open('vibemotion');
      req.onsuccess = () => {
        const tx = req.result.transaction('projects', 'readonly');
        const all = tx.objectStore('projects').getAll();
        all.onsuccess = () => resolve(all.result[0]);
        all.onerror = () => reject(all.error);
      };
      req.onerror = () => reject(req.error);
    });
    const project = saved.project;
    const file = await handoff.fetchSample();
    const media = await probeFile(file);
    const audio = await decodeAudio16k(media.audio, media.meta.duration);
    const db = vad.frameDb(audio, 16000);
    const th = vad.adaptiveThreshold(db, project.tighten.sensitivity);
    const silences = vad.detectSilences(db, { minSilence: project.tighten.minSilence, threshold: th.threshold });
    const peaks100 = computePeaks(audio);
    // 25 peaks per second, as 0..255.
    const per = 4;
    const peaks = [];
    for (let i = 0; i < peaks100.length; i += per) {
      let m = 0;
      for (let k = i; k < Math.min(peaks100.length, i + per); k++) m = Math.max(m, peaks100[k]);
      peaks.push(Math.min(255, Math.round(Math.sqrt(m) * 255)));
    }
    const face = track.primaryTrack(project.faces);
    const r3 = (x) => Math.round(x * 1000) / 1000;
    media.input.dispose();
    return {
      source: { duration: r3(media.meta.duration), width: media.meta.width, height: media.meta.height, fps: media.meta.fps },
      language: project.transcript.language,
      words: project.transcript.words.map((w) => ({ id: w.id, text: w.text, start: r3(w.start), end: r3(w.end) })),
      silences: silences.map((s) => ({ start: r3(s.start), end: r3(s.end) })),
      padding: project.tighten.padding,
      fillers: project.tighten.fillers,
      sceneCuts: project.faces.sceneCuts,
      face: face.map((p) => [r3(p.t), r3(p.x), r3(p.y), r3(p.w), r3(p.h)]),
      peaksPerSecond: 25,
      peaks,
    };
  }, BASE);

  const out = join(ROOT, 'src/landing/sample-data.json');
  writeFileSync(out, JSON.stringify(data));
  console.log(`Wrote ${out}: ${data.words.length} words, ${data.silences.length} pauses, ${data.face.length} face samples.`);
} finally {
  await ctx.close();
}
