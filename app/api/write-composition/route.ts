/**
 * API Endpoint: Write Composition
 *
 * Writes generated Remotion composition code to the filesystem.
 *
 * POST /api/write-composition
 * Body: {
 *   projectId: string,
 *   compositionCode: string,
 *   config: { id, durationInFrames, fps, width, height },
 *   storyboard?: { scenes, totalDuration, summary }
 * }
 *
 * Returns: {
 *   success: boolean,
 *   compositionId: string,
 *   compositionPath: string,
 *   error?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  writeComposition,
  type WriteCompositionInput,
  type CompositionConfig,
} from "@/lib/composition-writer";
import type { StoryboardScene } from "@/lib/pipeline/types";

interface WriteCompositionRequestBody {
  projectId: string;
  compositionCode: string;
  config: CompositionConfig;
  storyboard?: {
    scenes: StoryboardScene[];
    totalDuration: number;
    summary: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: WriteCompositionRequestBody = await request.json();

    // Validate required fields
    if (!body.projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!body.compositionCode) {
      return NextResponse.json(
        { success: false, error: "compositionCode is required" },
        { status: 400 }
      );
    }

    if (!body.config) {
      return NextResponse.json(
        { success: false, error: "config is required" },
        { status: 400 }
      );
    }

    // Validate config fields
    const { config } = body;
    if (!config.id || !config.durationInFrames || !config.fps || !config.width || !config.height) {
      return NextResponse.json(
        { success: false, error: "config must include id, durationInFrames, fps, width, height" },
        { status: 400 }
      );
    }

    console.log(`[WriteComposition] Writing composition for project: ${body.projectId}`);

    // Write the composition to filesystem
    const input: WriteCompositionInput = {
      projectId: body.projectId,
      compositionCode: body.compositionCode,
      config: body.config,
      storyboard: body.storyboard,
    };

    const result = await writeComposition(input);

    if (!result.success) {
      console.error(`[WriteComposition] Failed to write: ${result.error}`);
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to write composition",
        },
        { status: 500 }
      );
    }

    console.log(`[WriteComposition] Successfully wrote to: ${result.compositionPath}`);

    return NextResponse.json({
      success: true,
      compositionId: result.compositionId,
      compositionPath: result.compositionPath,
    });
  } catch (error) {
    console.error("[WriteComposition] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/write-composition
 *
 * Returns list of all generated compositions
 */
export async function GET() {
  try {
    const { getGeneratedCompositions } = await import("@/lib/composition-writer");
    const compositions = await getGeneratedCompositions();

    return NextResponse.json({
      success: true,
      compositions,
    });
  } catch (error) {
    console.error("[WriteComposition] Error getting compositions:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
