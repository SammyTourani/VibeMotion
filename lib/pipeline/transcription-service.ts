/**
 * Server-Side Transcription Service
 *
 * Reads video files from disk, extracts audio using ffmpeg,
 * and sends to OpenAI Whisper for transcription with word-level timestamps.
 *
 * This service is designed for pipeline use where we have file paths,
 * not browser File objects.
 */

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import type { VideoTranscript, TranscriptWord } from "./types";
import { validateTranscript, getTranscriptQuality } from "./transcript-validator";

const execAsync = promisify(exec);

// Temp directory for extracted audio files
const TEMP_DIR = "/tmp/transcription-audio";

interface TranscriptionOptions {
  assetId: string;
  publicPath: string; // e.g., "assets/videos/clip.mov"
  language?: string;
  retryOnFail?: boolean;
}

interface TranscriptionResult {
  success: boolean;
  transcript: VideoTranscript;
  error?: string;
  cached?: boolean;
}

/**
 * Server-side transcription service that works with file paths
 */
export class TranscriptionService {
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn(
        "[TranscriptionService] OPENAI_API_KEY not set - transcription will be skipped"
      );
    }
  }

  /**
   * Check if transcription is available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Transcribe a video file from the public directory
   */
  async transcribe(options: TranscriptionOptions): Promise<TranscriptionResult> {
    const { assetId, publicPath, language, retryOnFail = true } = options;
    const fullPath = path.join(process.cwd(), "public", publicPath);

    // If OpenAI is not configured, return empty transcript
    if (!this.openai) {
      console.warn(`[TranscriptionService] Skipping ${publicPath} - no API key`);
      return {
        success: false,
        transcript: this.createEmptyTranscript(assetId, publicPath),
        error: "OpenAI API key not configured",
      };
    }

    try {
      // 1. Verify file exists
      await fs.access(fullPath);
      console.log(`[TranscriptionService] Starting transcription: ${publicPath}`);

      // 2. Get video duration for better estimates
      const videoDuration = await this.getVideoDuration(fullPath);

      // 3. Extract audio to WAV (16kHz mono - optimal for Whisper)
      const audioPath = await this.extractAudio(fullPath, assetId);

      // 4. Send to OpenAI Whisper
      const whisperResult = await this.callWhisper(audioPath, language);

      // 5. Clean up temp audio file
      await this.cleanup(audioPath);

      // 6. Validate transcript to remove Whisper hallucinations
      const rawWords = whisperResult.words || [];
      const validation = validateTranscript(rawWords, { verbose: true });
      const words = validation.validWords;

      // Log validation results
      if (validation.stats.removedCount > 0) {
        console.log(
          `[TranscriptionService] Filtered ${validation.stats.removedCount} hallucinated words from ${publicPath}`
        );
        console.log(
          `[TranscriptionService] Removal reasons:`,
          validation.stats.removalReasons
        );
      }

      // Calculate quality score
      const qualityScore = getTranscriptQuality(words);
      if (qualityScore < 50) {
        console.warn(
          `[TranscriptionService] Low quality transcript for ${publicPath}: ${qualityScore}/100`
        );
      }

      // 7. Calculate metrics from validated words
      const duration =
        words.length > 0
          ? words[words.length - 1].end
          : videoDuration || 10;
      const wordCount = words.length;
      const speechDensity = duration > 0 ? wordCount / duration : 0;

      console.log(
        `[TranscriptionService] Completed ${publicPath}: ${wordCount} words (quality: ${qualityScore}/100), ${speechDensity.toFixed(2)} words/sec`
      );

      return {
        success: true,
        transcript: {
          assetId,
          publicPath,
          text: whisperResult.text || "",
          words,
          duration,
          wordCount,
          speechDensity,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[TranscriptionService] Failed for ${publicPath}:`,
        errorMessage
      );

      // Retry once if enabled
      if (retryOnFail) {
        console.log(`[TranscriptionService] Retrying ${publicPath}...`);
        await this.sleep(1000); // Wait 1 second before retry
        return this.transcribe({ ...options, retryOnFail: false });
      }

      return {
        success: false,
        transcript: this.createEmptyTranscript(assetId, publicPath),
        error: errorMessage,
      };
    }
  }

  /**
   * Get video duration using ffprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number | null> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
        { timeout: 10000 }
      );
      const duration = parseFloat(stdout.trim());
      return isNaN(duration) ? null : duration;
    } catch {
      return null;
    }
  }

  /**
   * Extract audio from video using ffmpeg
   * Outputs 16kHz mono WAV (optimal for Whisper)
   */
  private async extractAudio(
    videoPath: string,
    assetId: string
  ): Promise<string> {
    // Ensure temp directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true });

    const audioPath = path.join(TEMP_DIR, `${assetId}-${Date.now()}.wav`);

    // ffmpeg command: extract audio, convert to 16kHz mono WAV
    // -vn: no video
    // -acodec pcm_s16le: 16-bit PCM
    // -ar 16000: 16kHz sample rate
    // -ac 1: mono channel
    const command = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}" 2>/dev/null`;

    try {
      await execAsync(command, { timeout: 120000 }); // 2 minute timeout
      return audioPath;
    } catch (error) {
      // If ffmpeg fails (e.g., no audio track), throw a clear error
      throw new Error(
        `Failed to extract audio: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }

  /**
   * Call OpenAI Whisper API with the extracted audio
   */
  private async callWhisper(
    audioPath: string,
    language?: string
  ): Promise<{ text: string; words: TranscriptWord[] }> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    // Read audio file into buffer
    const fileBuffer = await fs.readFile(audioPath);

    // Create a File object for the API
    const file = new File([fileBuffer], "audio.wav", { type: "audio/wav" });

    // Call Whisper API with word-level timestamps
    const response = await this.openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
      ...(language && { language }),
    });

    // Extract words with timestamps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const words: TranscriptWord[] = ((response as any).words || []).map(
      (w: { word: string; start: number; end: number }) => ({
        text: w.word,
        start: w.start,
        end: w.end,
      })
    );

    return {
      text: response.text || "",
      words,
    };
  }

  /**
   * Clean up temporary audio files
   */
  private async cleanup(audioPath: string): Promise<void> {
    try {
      await fs.unlink(audioPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Create empty transcript for fallback scenarios
   */
  private createEmptyTranscript(
    assetId: string,
    publicPath: string
  ): VideoTranscript {
    return {
      assetId,
      publicPath,
      text: "",
      words: [],
      duration: 10, // Default estimate
      wordCount: 0,
      speechDensity: 0,
    };
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let serviceInstance: TranscriptionService | null = null;

/**
 * Get the singleton transcription service instance
 */
export function getTranscriptionService(): TranscriptionService {
  if (!serviceInstance) {
    serviceInstance = new TranscriptionService();
  }
  return serviceInstance;
}

/**
 * Batch transcribe multiple video assets
 * Processes sequentially to avoid rate limits
 */
export async function transcribeAssets(
  assets: Array<{ id: string; publicPath: string }>,
  onProgress?: (completed: number, total: number, assetId: string) => void
): Promise<VideoTranscript[]> {
  const service = getTranscriptionService();
  const results: VideoTranscript[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress?.(i, assets.length, asset.id);

    const result = await service.transcribe({
      assetId: asset.id,
      publicPath: asset.publicPath,
    });

    results.push(result.transcript);
    onProgress?.(i + 1, assets.length, asset.id);
  }

  return results;
}
