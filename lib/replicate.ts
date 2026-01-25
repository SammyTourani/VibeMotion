/**
 * Replicate API Client
 *
 * Provides image and video generation using Replicate's API.
 * - Image: Nano Banana Pro model
 * - Video: Veo 3.1 Fast model
 */

const REPLICATE_API_URL = "https://api.replicate.com/v1";

// Nano Banana Pro model details (Image Generation)
export const NANO_BANANA_PRO_MODEL = "google/nano-banana-pro";
export const NANO_BANANA_PRO_VERSION =
  "944891d151f5463d9e6eca5a6942f04053e664853dca30c21864021b046fea1d";

// Veo model details (Video Generation)
export const VEO_FAST_MODEL = "google/veo-3.1-fast";
export const VEO_MODEL = "google/veo-3.1";

// Video-specific settings
export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_DURATIONS = [4, 6, 8] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

// Default settings
export const DEFAULT_ASPECT_RATIO = "16:9";
export const DEFAULT_RESOLUTION = "2K";
export const DEFAULT_OUTPUT_FORMAT = "png";

// Supported aspect ratios
export const ASPECT_RATIOS = ["16:9", "1:1", "9:16", "4:3", "3:4"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

// Supported resolutions
export const RESOLUTIONS = ["2K", "4K", "8K"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

// Output formats
export const OUTPUT_FORMATS = ["png", "jpeg"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// Prediction status
export type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

// Prediction options for creating a new prediction
export interface PredictionOptions {
  prompt: string;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  outputFormat?: OutputFormat;
  safetyFilterLevel?: "block_only_high" | "block_medium_and_above" | "block_all";
}

// Prediction response from Replicate API
export interface Prediction {
  id: string;
  status: PredictionStatus;
  output?: string[];
  error?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  metrics?: {
    predict_time?: number;
  };
}

// Create prediction response
export interface CreatePredictionResponse {
  prediction: Prediction;
  error?: string;
}

// Download result
export interface DownloadResult {
  localPath: string;
  filename: string;
}

/**
 * Check if Replicate API token is configured
 */
export function isConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

/**
 * Get the API token (for server-side use only)
 */
function getApiToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set");
  }
  return token;
}

/**
 * Create a new prediction (start image generation)
 * Uses Prefer: wait header to wait for completion (up to 60 seconds)
 */
export async function createPrediction(
  options: PredictionOptions
): Promise<CreatePredictionResponse> {
  const {
    prompt,
    aspectRatio = DEFAULT_ASPECT_RATIO,
    resolution = DEFAULT_RESOLUTION,
    outputFormat = DEFAULT_OUTPUT_FORMAT,
    safetyFilterLevel = "block_only_high",
  } = options;

  if (!prompt || prompt.trim().length === 0) {
    return {
      prediction: {
        id: "",
        status: "failed",
        error: "Prompt is required",
      },
      error: "Prompt is required",
    };
  }

  const apiToken = getApiToken();

  const response = await fetch(`${REPLICATE_API_URL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait", // Wait for completion (up to 60s)
    },
    body: JSON.stringify({
      version: NANO_BANANA_PRO_VERSION,
      input: {
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        resolution,
        output_format: outputFormat,
        safety_filter_level: safetyFilterLevel,
      },
    }),
  });

  if (!response.ok) {
    let errorMessage = `Replicate API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = `Replicate error: ${errorData.detail}`;
      }
    } catch {
      // Could not parse error response
    }
    return {
      prediction: {
        id: "",
        status: "failed",
        error: errorMessage,
      },
      error: errorMessage,
    };
  }

  const prediction: Prediction = await response.json();

  return { prediction };
}

/**
 * Get prediction status (for polling if needed)
 */
export async function getPrediction(predictionId: string): Promise<Prediction> {
  const apiToken = getApiToken();

  const response = await fetch(
    `${REPLICATE_API_URL}/predictions/${predictionId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get prediction: ${response.status}`);
  }

  return response.json();
}

/**
 * Download image from URL
 * Returns the image as a Buffer
 */
export async function downloadImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate a unique filename for the image
 */
export function generateFilename(prompt: string, format: OutputFormat = "png"): string {
  // Create a slug from the prompt (first 30 chars)
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/-+$/, "");

  // Add timestamp for uniqueness
  const timestamp = Date.now();

  return `${slug}-${timestamp}.${format}`;
}

/**
 * Estimate generation time based on resolution
 */
export function estimateGenerationTime(resolution: Resolution): number {
  switch (resolution) {
    case "2K":
      return 10; // ~10 seconds
    case "4K":
      return 20; // ~20 seconds
    case "8K":
      return 40; // ~40 seconds
    default:
      return 15;
  }
}

// ============================================
// VIDEO GENERATION (Veo)
// ============================================

// Video prediction options
export interface VideoPredictionOptions {
  prompt: string;
  aspectRatio?: VideoAspectRatio;
  duration?: VideoDuration;
  generateAudio?: boolean;
  startingFrameUrl?: string;
  useFastModel?: boolean;
}

/**
 * Create a video prediction (NO wait - returns immediately)
 * Video generation takes 90-120 seconds, so we poll instead
 */
export async function createVideoPrediction(
  options: VideoPredictionOptions
): Promise<CreatePredictionResponse> {
  const {
    prompt,
    aspectRatio = "16:9",
    duration = 6,
    generateAudio = true,
    startingFrameUrl,
    useFastModel = true,
  } = options;

  if (!prompt || prompt.trim().length === 0) {
    return {
      prediction: {
        id: "",
        status: "failed",
        error: "Prompt is required",
      },
      error: "Prompt is required",
    };
  }

  const apiToken = getApiToken();
  const model = useFastModel ? VEO_FAST_MODEL : VEO_MODEL;

  const input: Record<string, unknown> = {
    prompt: prompt.trim(),
    aspect_ratio: aspectRatio,
    duration,
    resolution: "1080p",
    generate_audio: generateAudio,
  };

  // Add starting frame if provided
  if (startingFrameUrl) {
    input.image = startingFrameUrl;
  }

  const response = await fetch(`${REPLICATE_API_URL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      // NO Prefer header - we don't wait for video generation
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Replicate API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = `Replicate error: ${errorData.detail}`;
      }
    } catch {
      // Could not parse error response
    }
    return {
      prediction: {
        id: "",
        status: "failed",
        error: errorMessage,
      },
      error: errorMessage,
    };
  }

  const prediction: Prediction = await response.json();
  return { prediction };
}

/**
 * Download video from URL
 * Returns the video as a Buffer
 */
export async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate a unique filename for the video
 */
export function generateVideoFilename(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/-+$/, "");

  const timestamp = Date.now();
  return `${slug}-${timestamp}.mp4`;
}

/**
 * Estimate Veo generation time based on duration
 */
export function estimateVeoGenerationTime(duration: VideoDuration): number {
  // Veo typically takes 90-120 seconds regardless of duration
  // Slightly longer for longer videos
  switch (duration) {
    case 4:
      return 80;
    case 6:
      return 95;
    case 8:
      return 110;
    default:
      return 95;
  }
}

/**
 * Suggest optimal video duration based on prompt content
 * ~2 words per second for natural speech
 */
export function suggestVideoDuration(prompt: string): VideoDuration {
  // Try to extract quoted dialogue
  const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
  const quotedText = quotedMatch?.[1] || quotedMatch?.[2] || "";

  // Count words in quoted text, or in full prompt if no quotes
  const textToAnalyze = quotedText || prompt;
  const wordCount = textToAnalyze.split(/\s+/).filter(Boolean).length;

  // ~2 words per second natural speaking pace
  if (wordCount <= 8) return 4;
  if (wordCount <= 16) return 6;
  return 8;
}
