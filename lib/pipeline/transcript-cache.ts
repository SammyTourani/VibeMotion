/**
 * Transcript Cache
 *
 * Caches transcription results to avoid re-transcribing the same video.
 * Uses content hash of the video file as cache key for accuracy.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { VideoTranscript } from "./types";

const CACHE_DIR = ".cache/transcripts";

/**
 * Get cached transcript if available
 */
export async function getCachedTranscript(
  publicPath: string
): Promise<VideoTranscript | null> {
  try {
    const cacheKey = await getCacheKey(publicPath);
    const cachePath = path.join(process.cwd(), CACHE_DIR, `${cacheKey}.json`);

    const data = await fs.readFile(cachePath, "utf-8");
    const cached = JSON.parse(data) as VideoTranscript;

    console.log(`[TranscriptCache] Cache hit for ${publicPath}`);
    return cached;
  } catch {
    // Cache miss or read error
    return null;
  }
}

/**
 * Cache a transcript result
 */
export async function cacheTranscript(
  publicPath: string,
  transcript: VideoTranscript
): Promise<void> {
  try {
    const cacheKey = await getCacheKey(publicPath);
    const cachePath = path.join(process.cwd(), CACHE_DIR, `${cacheKey}.json`);

    // Ensure cache directory exists
    await fs.mkdir(path.dirname(cachePath), { recursive: true });

    // Write transcript to cache
    await fs.writeFile(cachePath, JSON.stringify(transcript, null, 2));

    console.log(`[TranscriptCache] Cached transcript for ${publicPath}`);
  } catch (error) {
    // Log but don't fail on cache write errors
    console.warn(
      `[TranscriptCache] Failed to cache ${publicPath}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Clear the transcript cache
 */
export async function clearTranscriptCache(): Promise<void> {
  try {
    const cacheDir = path.join(process.cwd(), CACHE_DIR);
    await fs.rm(cacheDir, { recursive: true, force: true });
    console.log("[TranscriptCache] Cache cleared");
  } catch {
    // Ignore errors when clearing cache
  }
}

/**
 * Generate a cache key based on file content hash
 * This ensures cache invalidation when file content changes
 */
async function getCacheKey(publicPath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), "public", publicPath);

  try {
    // Get file stats for size and modification time
    const stats = await fs.stat(fullPath);

    // Create hash from path + size + mtime
    // This is faster than hashing the entire file content
    const hashInput = `${publicPath}:${stats.size}:${stats.mtimeMs}`;
    return crypto.createHash("md5").update(hashInput).digest("hex");
  } catch {
    // Fallback to just path hash if file not accessible
    return crypto.createHash("md5").update(publicPath).digest("hex");
  }
}

/**
 * Check if a transcript is cached
 */
export async function isTranscriptCached(publicPath: string): Promise<boolean> {
  const cached = await getCachedTranscript(publicPath);
  return cached !== null;
}
