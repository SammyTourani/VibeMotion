/**
 * Render API Endpoint
 *
 * POST /api/render - Start a new render job
 * GET /api/render?id={renderId} - Check render status
 *
 * This endpoint spawns the Remotion CLI to render videos from storyboard data.
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Types
interface RenderRequest {
  storyboard: {
    scenes: Array<{
      id: string;
      type: string;
      duration: number;
      description: string;
      text?: string;
      assets?: string[];
      voiceover?: string;
      voiceoverAudio?: string; // Path to generated voiceover audio
      animation?: string;
      order?: number;
    }>;
    totalDuration: number;
    summary: string;
  };
  aspectRatio: "9:16" | "16:9" | "1:1";
  theme: {
    primaryColor: string;
    secondaryColor?: string;
    backgroundColor: string;
    textColor: string;
    style?: string;
  };
}

interface RenderJob {
  status: "pending" | "rendering" | "complete" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
  startedAt: Date;
}

// In-memory store for tracking render progress
// Note: This is lost on server restart (acceptable for MVP)
const renderJobs = new Map<string, RenderJob>();

// Map aspect ratio to composition ID
const COMPOSITION_MAP: Record<string, string> = {
  "9:16": "DynamicPreview-Portrait",
  "16:9": "DynamicPreview-Landscape",
  "1:1": "DynamicPreview-Square",
};

/**
 * POST /api/render
 * Start a new render job
 */
export async function POST(request: NextRequest) {
  try {
    const body: RenderRequest = await request.json();
    const { storyboard, aspectRatio, theme } = body;

    // Validate required fields
    if (!storyboard || !storyboard.scenes || storyboard.scenes.length === 0) {
      return NextResponse.json(
        { error: "Invalid storyboard: scenes required" },
        { status: 400 }
      );
    }

    // Generate unique render ID
    const renderId = randomUUID().slice(0, 8);

    // Get composition ID for aspect ratio
    const compositionId = COMPOSITION_MAP[aspectRatio] || COMPOSITION_MAP["9:16"];

    // Ensure directories exist
    const tempDir = path.join(process.cwd(), "temp");
    const rendersDir = path.join(process.cwd(), "public", "renders");
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(rendersDir, { recursive: true });

    // Write props to temp file (required for cross-platform compatibility)
    const propsPath = path.join(tempDir, `${renderId}-props.json`);
    const props = {
      scenes: storyboard.scenes,
      totalDuration: storyboard.totalDuration,
      theme: {
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        backgroundColor: theme.backgroundColor,
        textColor: theme.textColor,
        style: theme.style,
      },
    };
    await fs.writeFile(propsPath, JSON.stringify(props, null, 2), "utf-8");

    // Output path
    const outputPath = path.join(rendersDir, `${renderId}.mp4`);
    const publicUrl = `/renders/${renderId}.mp4`;

    // Initialize job tracking
    renderJobs.set(renderId, {
      status: "pending",
      progress: 0,
      outputPath: null,
      error: null,
      startedAt: new Date(),
    });

    // Spawn Remotion render process
    const remotionProcess = spawn(
      "pnpm",
      [
        "exec",
        "remotion",
        "render",
        "src/index.ts",
        compositionId,
        outputPath,
        `--props=${propsPath}`,
        "--log=verbose",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: true,
      }
    );

    // Track progress from stdout
    remotionProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[Render ${renderId}] ${output}`);

      // Parse progress from Remotion output
      // Remotion outputs progress in various formats:
      // "Rendering frame 120/600 (20%)" or just percentage
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1], 10);
        const job = renderJobs.get(renderId);
        if (job) {
          job.status = "rendering";
          job.progress = progress;
        }
      }

      // Also check for "Rendering frames" which indicates start
      if (output.includes("Rendering frames") || output.includes("Rendering frame")) {
        const job = renderJobs.get(renderId);
        if (job && job.status === "pending") {
          job.status = "rendering";
        }
      }
    });

    remotionProcess.stderr.on("data", (data) => {
      const output = data.toString();
      console.error(`[Render ${renderId}] stderr: ${output}`);

      // Check for progress in stderr too (Remotion sometimes outputs there)
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1], 10);
        const job = renderJobs.get(renderId);
        if (job) {
          job.status = "rendering";
          job.progress = progress;
        }
      }
    });

    remotionProcess.on("close", async (code) => {
      const job = renderJobs.get(renderId);
      if (job) {
        if (code === 0) {
          job.status = "complete";
          job.progress = 100;
          job.outputPath = publicUrl;
          console.log(`[Render ${renderId}] Complete: ${publicUrl}`);
        } else {
          job.status = "error";
          job.error = `Render process exited with code ${code}`;
          console.error(`[Render ${renderId}] Failed with code ${code}`);
        }
      }

      // Cleanup temp props file
      try {
        await fs.unlink(propsPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    remotionProcess.on("error", (err) => {
      const job = renderJobs.get(renderId);
      if (job) {
        job.status = "error";
        job.error = `Failed to spawn render process: ${err.message}`;
      }
      console.error(`[Render ${renderId}] Spawn error:`, err);
    });

    return NextResponse.json({
      success: true,
      renderId,
      compositionId,
      message: "Render started",
    });
  } catch (error) {
    console.error("Render API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/render?id={renderId}
 * Check render status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const renderId = searchParams.get("id");

  if (!renderId) {
    return NextResponse.json({ error: "Missing render ID" }, { status: 400 });
  }

  const job = renderJobs.get(renderId);
  if (!job) {
    return NextResponse.json({ error: "Render job not found" }, { status: 404 });
  }

  return NextResponse.json({
    renderId,
    status: job.status,
    progress: job.progress,
    outputPath: job.outputPath,
    error: job.error,
    startedAt: job.startedAt.toISOString(),
  });
}
