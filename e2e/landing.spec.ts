import { test, expect, BASE, ARTIFACTS } from './fixtures';
import { join } from 'node:path';

test('landing page loads cleanly at desktop and phone widths', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the sample clip' }).first()).toBeVisible();
  // Let the hero's one-time animation and the live monitor settle.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(ARTIFACTS, 'screens/landing-1440.png') });
  await page.screenshot({ path: join(ARTIFACTS, 'screens/landing-1440-full.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(ARTIFACTS, 'screens/landing-390.png') });
  await page.screenshot({ path: join(ARTIFACTS, 'screens/landing-390-full.png'), fullPage: true });
  // No horizontal scroll on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
});

test('landing page at 360 px and with reduced motion', async ({ page, consoleErrors }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(ARTIFACTS, 'screens/landing-360-reduced.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Reduced motion: the headline is set at its final width, not animated.
  const stretch = await page.locator('.lp-h1').evaluate((el) => getComputedStyle(el).fontStretch);
  expect(stretch).toBe('78%');
  expect(consoleErrors).toEqual([]);
});
