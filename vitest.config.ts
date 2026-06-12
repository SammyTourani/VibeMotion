import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-logic unit tests only. These exercise importable functions that need
    // no Gemini/Whisper/Replicate/Supabase, no network, no GPU, and no browser.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
