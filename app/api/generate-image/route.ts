/**
 * Image Generation API Endpoint
 *
 * POST /api/generate-image - Generate an image from a text prompt
 *
 * Uses Replicate's Nano Banana Pro model for high-quality image generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  createPrediction,
  downloadImage,
  generateFilename,
  isConfigured,
  AspectRatio,
  Resolution,
  OutputFormat,
  ASPECT_RATIOS,
  RESOLUTIONS,
  OUTPUT_FORMATS,
} from "@/lib/replicate";

// Request type
interface GenerateImageRequest {
  prompt: string;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  outputFormat?: OutputFormat;
  filename?: string;
}

// Response type
interface GenerateImageResponse {
  success: boolean;
  imagePath?: string;
  imageUrl?: string;
  predictionId?: string;
  generationTime?: number;
  error?: string;
}

/**
 * POST /api/generate-image
 * Generate an image from a text prompt
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateImageResponse>> {
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

    const body: GenerateImageRequest = await request.json();
    const {
      prompt,
      aspectRatio = "16:9",
      resolution = "2K",
      outputFormat = "png",
      filename,
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
    if (!ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid aspect ratio. Must be one of: ${ASPECT_RATIOS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate resolution
    if (!RESOLUTIONS.includes(resolution)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid resolution. Must be one of: ${RESOLUTIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate output format
    if (!OUTPUT_FORMATS.includes(outputFormat)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid output format. Must be one of: ${OUTPUT_FORMATS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    console.log(
      `[Image Generation] Starting: "${prompt.slice(0, 50)}..." (${aspectRatio}, ${resolution})`
    );

    const startTime = Date.now();

    // Create prediction (with Prefer: wait for sync response)
    const { prediction, error } = await createPrediction({
      prompt,
      aspectRatio,
      resolution,
      outputFormat,
    });

    if (error || prediction.status === "failed") {
      console.error("[Image Generation] Failed:", error || prediction.error);
      return NextResponse.json(
        {
          success: false,
          error: error || prediction.error || "Image generation failed",
        },
        { status: 500 }
      );
    }

    // Check if we have output
    if (!prediction.output || prediction.output.length === 0) {
      console.error("[Image Generation] No output received");
      return NextResponse.json(
        {
          success: false,
          error: "No image was generated. The content may have been blocked by safety filters.",
        },
        { status: 500 }
      );
    }

    const imageUrl = prediction.output[0];
    console.log(`[Image Generation] Received image URL: ${imageUrl}`);

    // Download and save image locally
    try {
      // Ensure output directory exists
      const imageDir = path.join(
        process.cwd(),
        "public",
        "assets",
        "images",
        "generated"
      );
      await fs.mkdir(imageDir, { recursive: true });

      // Generate filename or use provided one
      const finalFilename = filename || generateFilename(prompt, outputFormat);
      const filePath = path.join(imageDir, finalFilename);

      // Download image
      const imageBuffer = await downloadImage(imageUrl);
      await fs.writeFile(filePath, imageBuffer);

      // Calculate generation time
      const generationTime = (Date.now() - startTime) / 1000;

      // Public path for the image
      const publicPath = `assets/images/generated/${finalFilename}`;

      console.log(
        `[Image Generation] Saved: ${publicPath} (${generationTime.toFixed(2)}s)`
      );

      return NextResponse.json({
        success: true,
        imagePath: publicPath,
        imageUrl,
        predictionId: prediction.id,
        generationTime,
      });
    } catch (downloadError) {
      console.error("[Image Generation] Download failed:", downloadError);
      // Return the CDN URL as fallback
      return NextResponse.json({
        success: true,
        imagePath: undefined,
        imageUrl,
        predictionId: prediction.id,
        error: "Failed to save locally, use imageUrl instead",
      });
    }
  } catch (error) {
    console.error("[Image Generation] API error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Image generation failed",
      },
      { status: 500 }
    );
  }
}
