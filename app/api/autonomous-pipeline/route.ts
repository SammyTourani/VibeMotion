/**
 * Autonomous Pipeline API Endpoint
 *
 * POST /api/autonomous-pipeline
 *
 * Executes the full autonomous video generation pipeline:
 * 1. Assets already uploaded via /api/upload-assets
 * 2. Transcribe all videos
 * 3. Classify A-roll vs B-roll
 * 4. Generate smart storyboard
 * 5. Generate Remotion composition
 * 6. (Optional) Render final video
 *
 * Uses Server-Sent Events (SSE) for real-time progress updates.
 */

import { NextRequest } from "next/server";
import {
  PipelineOrchestrator,
  PipelineInput,
  PipelineAsset,
  PipelineConfig,
  DEFAULT_CONFIG,
} from "@/lib/pipeline";

interface RequestBody {
  /** Unique project ID */
  projectId: string;

  /** Assets from /api/upload-assets response */
  assets: Array<{
    id: string;
    name: string;
    publicPath: string;
    size: number;
    mimeType: string;
    type: string;
  }>;

  /** Optional user prompt/direction */
  prompt?: string;

  /** Video configuration */
  config?: Partial<PipelineConfig>;

  /** Whether to render final MP4 */
  renderFinal?: boolean;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      try {
        const body: RequestBody = await request.json();
        const { projectId, assets, prompt, config, renderFinal } = body;

        // Validate required fields
        if (!projectId) {
          sendEvent("error", { message: "projectId is required" });
          controller.close();
          return;
        }

        if (!assets || assets.length === 0) {
          sendEvent("error", { message: "At least one asset is required" });
          controller.close();
          return;
        }

        console.log(`[AutonomousPipeline] Starting pipeline for ${projectId}`);
        console.log(`[AutonomousPipeline] ${assets.length} assets, prompt: ${prompt?.slice(0, 50) || "none"}`);

        // Convert assets to pipeline format
        const pipelineAssets: PipelineAsset[] = assets.map((a) => ({
          id: a.id,
          name: a.name,
          publicPath: a.publicPath,
          size: a.size,
          mimeType: a.mimeType,
          type: a.type === "video" ? "video" : a.type === "image" ? "image" : "audio",
        }));

        // Build pipeline input
        const pipelineInput: PipelineInput = {
          projectId,
          assets: pipelineAssets,
          prompt,
          config: {
            ...DEFAULT_CONFIG,
            ...config,
          },
          renderFinal: renderFinal || false,
        };

        // Create orchestrator
        const orchestrator = new PipelineOrchestrator(projectId);

        // Set up event forwarding
        orchestrator.onEvent((event) => {
          sendEvent(event.type, event.data);
        });

        // Send initial status
        sendEvent("status", {
          message: "Pipeline started",
          projectId,
          assetCount: assets.length,
        });

        // Execute pipeline
        const result = await orchestrator.execute(pipelineInput);

        // Send final result
        if (result.success) {
          sendEvent("complete", {
            success: true,
            projectId: result.projectId,
            compositionPath: result.compositionPath,
            compositionId: result.compositionId,
            storyboard: result.storyboard,
            classification: result.classification,
            executionTime: result.executionTime,
          });
        } else {
          sendEvent("error", {
            message: result.error || "Pipeline failed",
            executionTime: result.executionTime,
          });
        }

        controller.close();

      } catch (error) {
        console.error("[AutonomousPipeline] Error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        sendEvent("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * GET /api/autonomous-pipeline
 *
 * Returns pipeline status and available configurations
 */
export async function GET() {
  return Response.json({
    name: "Autonomous Video Pipeline",
    version: "1.0.0",
    description: "Fully automated video generation from uploaded clips",
    phases: [
      { name: "upload", description: "Save video files to server" },
      { name: "transcribe", description: "Extract audio and transcribe with Whisper" },
      { name: "classify", description: "Determine A-roll vs B-roll footage" },
      { name: "storyboard", description: "Generate intelligent scene arrangement" },
      { name: "composition", description: "Create Remotion TypeScript code" },
      { name: "render", description: "Render final MP4 video" },
    ],
    defaultConfig: DEFAULT_CONFIG,
    usage: {
      method: "POST",
      contentType: "application/json",
      body: {
        projectId: "string (required)",
        assets: "array from /api/upload-assets (required)",
        prompt: "string (optional user direction)",
        config: {
          aspectRatio: "9:16 | 16:9 | 1:1 | 4:5",
          style: "modern | minimal | bold | playful | corporate | cinematic",
          targetDuration: "number (seconds, default 30)",
          primaryColor: "hex color",
          backgroundColor: "hex color",
          textColor: "hex color",
        },
        renderFinal: "boolean (default false)",
      },
    },
  });
}
