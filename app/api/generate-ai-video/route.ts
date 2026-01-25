/**
 * AI Video Generation API Endpoint
 *
 * POST /api/generate-ai-video - Start video generation (returns predictionId)
 * GET /api/generate-ai-video?id={predictionId} - Poll status and get result
 *
 * Uses Google's Veo 3.1 Fast model via Replicate for AI video generation.
 * Video generation takes 90-120 seconds, so we use polling instead of waiting.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  createVideoPrediction,
  getPrediction,
  downloadVideo,
  generateVideoFilename,
  isConfigured,
  estimateVeoGenerationTime,
  VideoAspectRatio,
  VideoDuration,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
} from "@/lib/replicate";

// POST Request type - Start generation
interface GenerateAIVideoRequest {
  prompt: string;
  aspectRatio?: VideoAspectRatio;
  duration?: VideoDuration;
  startingFrameUrl?: string;
  useFastModel?: boolean;
}

// POST Response - Returns predictionId for polling
interface GenerateAIVideoStartResponse {
  success: boolean;
  predictionId?: string;
  estimatedTime?: number;
  error?: string;
}

// GET Response - Poll status
interface GenerateAIVideoStatusResponse {
  success: boolean;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  videoPath?: string;
  videoUrl?: string;
  duration?: number;
  generationTime?: number;
  error?: string;
}

/**
 * POST /api/generate-ai-video
 * Start video generation - returns immediately with predictionId
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateAIVideoStartResponse>> {
  try {
    // Check if Replicate is configured
    if (!isConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Replicate API token not configured. Add REPLICATE_API_TOKEN to your .env file.",
        },
        { status: 500 }
      );
    }

    const body: GenerateAIVideoRequest = await request.json();
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 6,
      startingFrameUrl,
      useFastModel = true,
    } = body;

    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Prompt is required",
        },
        { status: 400 }
      );
    }

    // Validate aspect ratio
    if (!VIDEO_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid aspect ratio. Must be one of: ${VIDEO_ASPECT_RATIOS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate duration
    if (!VIDEO_DURATIONS.includes(duration)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid duration. Must be one of: ${VIDEO_DURATIONS.join(", ")} seconds`,
        },
        { status: 400 }
      );
    }

    console.log(
      `[AI Video] Starting generation: "${prompt.slice(0, 50)}..." (${duration}s, ${aspectRatio})`
    );

    // Create prediction (returns immediately, no waiting)
    const { prediction, error } = await createVideoPrediction({
      prompt,
      aspectRatio,
      duration,
      startingFrameUrl,
      useFastModel,
    });

    if (error || !prediction.id) {
      console.error("[AI Video] Failed to start:", error);
      return NextResponse.json(
        {
          success: false,
          error: error || "Failed to start video generation",
        },
        { status: 500 }
      );
    }

    const estimatedTime = estimateVeoGenerationTime(duration);

    console.log(
      `[AI Video] Started: predictionId=${prediction.id}, estimated=${estimatedTime}s`
    );

    return NextResponse.json({
      success: true,
      predictionId: prediction.id,
      estimatedTime,
    });
  } catch (error) {
    console.error("[AI Video] API error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Video generation failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate-ai-video?id={predictionId}
 * Poll prediction status and return result when complete
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<GenerateAIVideoStatusResponse>> {
  try {
    // Check if Replicate is configured
    if (!isConfigured()) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Replicate API token not configured",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get("id");

    if (!predictionId) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Prediction ID is required",
        },
        { status: 400 }
      );
    }

    // Get prediction status
    const prediction = await getPrediction(predictionId);

    console.log(`[AI Video] Poll: id=${predictionId}, status=${prediction.status}`);

    // If still processing, return status
    if (prediction.status === "starting" || prediction.status === "processing") {
      return NextResponse.json({
        success: true,
        status: prediction.status,
      });
    }

    // If failed or canceled
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return NextResponse.json({
        success: false,
        status: prediction.status,
        error: prediction.error || `Video generation ${prediction.status}`,
      });
    }

    // If succeeded, download and save the video
    if (prediction.status === "succeeded") {
      // Veo returns output as a string URL (not array)
      const videoUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : (prediction.output as unknown as string);

      if (!videoUrl) {
        return NextResponse.json({
          success: false,
          status: "failed",
          error: "No video output received",
        });
      }

      console.log(`[AI Video] Downloading: ${videoUrl}`);

      try {
        // Ensure output directory exists
        const videoDir = path.join(
          process.cwd(),
          "public",
          "assets",
          "videos",
          "generated"
        );
        await fs.mkdir(videoDir, { recursive: true });

        // Generate filename and download
        const filename = generateVideoFilename(predictionId);
        const filePath = path.join(videoDir, filename);

        const videoBuffer = await downloadVideo(videoUrl);
        await fs.writeFile(filePath, videoBuffer);

        const publicPath = `assets/videos/generated/${filename}`;
        const generationTime = prediction.metrics?.predict_time || 0;

        console.log(
          `[AI Video] Saved: ${publicPath} (${generationTime.toFixed(1)}s)`
        );

        return NextResponse.json({
          success: true,
          status: "succeeded",
          videoPath: publicPath,
          videoUrl,
          generationTime,
        });
      } catch (downloadError) {
        console.error("[AI Video] Download failed:", downloadError);
        // Return CDN URL as fallback
        return NextResponse.json({
          success: true,
          status: "succeeded",
          videoUrl,
          generationTime: prediction.metrics?.predict_time || 0,
          error: "Failed to save locally, use videoUrl instead",
        });
      }
    }

    // Unknown status
    return NextResponse.json({
      success: false,
      status: prediction.status,
      error: "Unknown prediction status",
    });
  } catch (error) {
    console.error("[AI Video] Poll error:", error);
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to check status",
      },
      { status: 500 }
    );
  }
}
