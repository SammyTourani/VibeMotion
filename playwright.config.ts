import { defineConfig } from '@playwright/test';

// End-to-end tests run against the production build (`vite preview`) at the
// GitHub Pages base path, in real Google Chrome: Playwright's bundled
// Chromium has no H.264/AAC encoders. See e2e/fixtures.ts.
export default defineConfig({
  testDir: 'e2e',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:5312/VibeMotion/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
