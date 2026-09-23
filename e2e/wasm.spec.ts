import { test, expect, BASE, forgetProjects } from './fixtures';

// The WebAssembly fallback (no WebGPU) downloads its own q8 model (~85 MB),
// so it only runs when asked: VM_E2E_WASM=1 pnpm e2e
test('transcribes on the WebAssembly fallback', async ({ page, consoleErrors }) => {
  test.skip(!process.env.VM_E2E_WASM, 'Set VM_E2E_WASM=1 to run the WASM fallback test.');
  await forgetProjects(page);
  await page.goto(`${BASE}#/edit?asr=wasm`);
  await page.getByRole('button', { name: 'Try the sample clip' }).click();
  await expect(page.locator('.transcript-body .w').first()).toBeVisible({ timeout: 14 * 60_000 });
  expect(await page.locator('.transcript-body .w').count()).toBeGreaterThan(40);
  await expect(page.locator('.w', { hasText: /^browser\.?$/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
