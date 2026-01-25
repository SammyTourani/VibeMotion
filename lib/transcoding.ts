/**
 * Video Transcoding Utility
 *
 * Converts MOV/ProRes files to H.264 MP4 for browser playback.
 * Uses ffmpeg-static for cross-platform binary support.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "fs";
import path from "path";

// Set ffmpeg path from ffmpeg-static
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Maximum file size for transcoding (500MB)
const MAX_TRANSCODE_SIZE = 500 * 1024 * 1024;

export interface TranscodeResult {
  success: boolean;
  outputPath: string;
  originalPath: string;
  error?: string;
}

/**
 * Check if a file needs transcoding based on extension/mime
 */
export function needsTranscoding(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const movTypes = ["video/quicktime", "video/mov"];
  const movExts = [".mov"];

  return movTypes.includes(mimeType) || movExts.includes(ext);
}

/**
 * Transcode a video file to H.264 MP4
 *
 * @param inputPath - Full path to the input video file
 * @param outputDir - Directory to write the output file
 * @returns Promise with transcode result
 */
export async function transcodeToMp4(
  inputPath: string,
  outputDir: string
): Promise<TranscodeResult> {
  // Check file size
  const stats = await fs.stat(inputPath);
  if (stats.size > MAX_TRANSCODE_SIZE) {
    return {
      success: false,
      outputPath: "",
      originalPath: inputPath,
      error: `File too large for transcoding (${(stats.size / 1024 / 1024).toFixed(1)}MB > 500MB limit)`,
    };
  }

  // Generate output filename (same name, .mp4 extension)
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}.mp4`);

  console.log(`[Transcode] Starting: ${inputPath} -> ${outputPath}`);

  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264", // H.264 video codec
        "-preset fast", // Encoding speed (fast = good balance)
        "-crf 23", // Quality (18-28, lower = better quality)
        "-c:a aac", // AAC audio codec
        "-b:a 128k", // Audio bitrate
        "-movflags +faststart", // Web optimization (moov atom at start)
        "-pix_fmt yuv420p", // Pixel format for maximum compatibility
      ])
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log(`[Transcode] FFmpeg command: ${commandLine}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[Transcode] Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", async () => {
        console.log(`[Transcode] Complete: ${outputPath}`);

        // Delete original MOV file after successful transcode
        try {
          await fs.unlink(inputPath);
          console.log(`[Transcode] Deleted original: ${inputPath}`);
        } catch (e) {
          console.warn(`[Transcode] Could not delete original: ${e}`);
        }

        resolve({
          success: true,
          outputPath,
          originalPath: inputPath,
        });
      })
      .on("error", (err) => {
        console.error(`[Transcode] Error: ${err.message}`);
        resolve({
          success: false,
          outputPath: "",
          originalPath: inputPath,
          error: err.message,
        });
      })
      .run();
  });
}
