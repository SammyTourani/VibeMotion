import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS = resolve(here, '.artifacts');
export const BASE = 'http://localhost:5312/VibeMotion/';

// A persistent profile keeps the Whisper model (Cache API) between runs, so
// only the first run downloads it. Override with VM_PW_PROFILE.
const PROFILE = process.env.VM_PW_PROFILE ?? join(ARTIFACTS, 'profile');

/**
 * Chrome 153 under automation crashes its browser process when a download
 * completes (SIGSEGV on the main thread, headless and headed, reproduced
 * with both CDP download behaviours). So the suite captures downloads at the
 * app boundary: the exact Blob and filename handed to the <a download>
 * click, which is all the app controls.
 */
const CAPTURE_DOWNLOADS = `
  (() => {
    const blobs = new Map();
    window.__vmDownloads = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => { const u = create(obj); if (obj instanceof Blob) blobs.set(u, obj); return u; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:') && blobs.has(this.href)) {
        window.__vmDownloads.push({ name: this.download, blob: blobs.get(this.href) });
        return;
      }
      return click.call(this);
    };
  })();
`;

export interface Captured {
  name: string;
  bytes: Buffer;
}

export async function waitForDownload(page: Page, index: number, timeout = 10 * 60_000): Promise<Captured> {
  await page.waitForFunction((i) => (window as unknown as { __vmDownloads: unknown[] }).__vmDownloads.length > i, index, {
    timeout,
  });
  const { name, b64 } = await page.evaluate(async (i) => {
    const d = (window as unknown as { __vmDownloads: { name: string; blob: Blob }[] }).__vmDownloads[i]!;
    const buf = new Uint8Array(await d.blob.arrayBuffer());
    let s = '';
    for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
    return { name: d.name, b64: btoa(s) };
  }, index);
  return { name, bytes: Buffer.from(b64, 'base64') };
}

export function saveArtifact(name: string, data: Buffer | string): string {
  const p = join(ARTIFACTS, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  return p;
}

type Fixtures = { context: BrowserContext; page: Page; consoleErrors: string[] };

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    mkdirSync(PROFILE, { recursive: true });
    const ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: !process.env.HEADED,
      viewport: { width: 1440, height: 900 },
      args: ['--enable-unsafe-webgpu'],
    });
    await ctx.addInitScript(CAPTURE_DOWNLOADS);
    await use(ctx);
    await ctx.close();
  },
  consoleErrors: async ({}, use) => {
    await use([]);
  },
  page: async ({ context, consoleErrors }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(`Uncaught: ${e.message}`));
    await use(page);
  },
});

/** Clears saved projects so the sample opens fresh (the model cache stays). */
export async function forgetProjects(page: Page) {
  await page.goto(BASE);
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        const q = indexedDB.deleteDatabase('vibemotion');
        q.onsuccess = q.onerror = q.onblocked = () => r();
      }),
  );
}

export { expect };
