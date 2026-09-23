#!/usr/bin/env node
// Captures the Open Graph image (public/og.png) and the README screenshots
// (docs/*.jpg) from the running app. They are real renders, not mock-ups.
//
// Needs `pnpm preview` on :5312 (or pass a base URL), Google Chrome, and a
// Playwright profile with the speech model cached (first run downloads it).
//   node scripts/screenshots.mjs [userDataDir] [baseUrl]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const profile = process.argv[2] ?? join(ROOT, 'e2e/.artifacts/profile');
const BASE = process.argv[3] ?? 'http://localhost:5312/VibeMotion/';
const TMP = join(ROOT, 'e2e/.artifacts/shots');
mkdirSync(TMP, { recursive: true });
mkdirSync(join(ROOT, 'docs'), { recursive: true });

const jpg = (src, out, width) => {
  execFileSync('magick', [src, '-resize', `${width}x>`, '-strip', '-interlace', 'Plane', '-quality', '84', out]);
  const kb = statSync(out).size / 1024;
  console.log(`${out.replace(ROOT + '/', '')}: ${kb.toFixed(0)} KB`);
  if (kb > 400) throw new Error(`${out} is over 400 KB`);
};

const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--enable-unsafe-webgpu'],
});
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  // Open Graph: the landing hero after its animation, 1200x630.
  await page.setViewportSize({ width: 1680, height: 882 });
  await page.goto(BASE);
  await page.waitForTimeout(4200);
  // Hero through the waveform strip, at the 1200:630 aspect.
  await page.screenshot({ path: join(TMP, 'og-raw.png'), scale: 'css', clip: { x: 30, y: 0, width: 1620, height: 850 } });
  execFileSync('magick', [join(TMP, 'og-raw.png'), '-resize', '1200x630!', '-strip', join(ROOT, 'public/og.png')]);
  console.log('public/og.png', (statSync(join(ROOT, 'public/og.png')).size / 1024).toFixed(0), 'KB');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: join(TMP, 'landing.png') });
  jpg(join(TMP, 'landing.png'), join(ROOT, 'docs/landing.jpg'), 1440);

  // Editor with the sample: fresh transcription, then a selection.
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
  await page.getByRole('tab', { name: 'Tighten' }).click();
  await page.locator('.w', { hasText: /^follows$/ }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(TMP, 'editor.png') });
  jpg(join(TMP, 'editor.png'), join(ROOT, 'docs/editor.jpg'), 1440);

  await page.getByRole('tab', { name: 'Captions' }).click();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(TMP, 'captions.png') });
  jpg(join(TMP, 'captions.png'), join(ROOT, 'docs/captions.jpg'), 1440);

  // Phone widths, side by side.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(TMP, 'phone-landing.png') });
  await page.goto(`${BASE}#/edit`);
  await page.getByRole('button', { name: 'Try the sample clip' }).click();
  await page.getByRole('button', { name: 'Restore your edits' }).click();
  await page.locator('.transcript-body .w').first().waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(TMP, 'phone-editor.png') });
  execFileSync('magick', [
    join(TMP, 'phone-landing.png'),
    join(TMP, 'phone-editor.png'),
    '-background',
    '#1C1D20',
    '-splice',
    '24x0',
    '+append',
    '-chop',
    '24x0',
    join(TMP, 'phone.png'),
  ]);
  jpg(join(TMP, 'phone.png'), join(ROOT, 'docs/phone.jpg'), 804);
} finally {
  await ctx.close();
  rmSync(join(TMP, 'og-raw.png'), { force: true });
}
