import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { ThemeConfig, UploadedAsset } from "@/lib/types";
import type { StoryboardScene } from "@/lib/pipeline/types";
import { generateAIContext, getVideoDimensions } from "@/lib/asset-processor";
import { generateAssetManifestText } from "@/lib/asset-gallery";
import { writeComposition } from "@/lib/composition-writer";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

// Use Gemini 2.0 Flash - fast and capable
const MODEL_ID = "gemini-2.0-flash";

interface StreamRequest {
  projectId: string;
  prompt: string;
  assets: UploadedAsset[];
  theme: ThemeConfig;
}

// Storyboard system prompt
const STORYBOARD_PROMPT = `You are a professional video director specializing in short-form viral content.

Create a scene-by-scene storyboard. Rules:
1. Hook in first 3 seconds
2. Scenes 2-5 seconds each
3. Use provided assets by exact name
4. Include voiceover scripts
5. End with CTA
6. Total: 15-60 seconds

Scene types: "title", "content", "video", "image", "transition"

Output valid JSON only:
{
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "type": "title",
      "duration": 3,
      "description": "what happens",
      "assets": ["asset-name.png"],
      "text": "display text",
      "voiceover": "what to say",
      "animation": "fade-in"
    }
  ],
  "totalDuration": 30,
  "summary": "one sentence summary"
}`;

// Composition system prompt
const COMPOSITION_PROMPT = `You are an expert Remotion developer. Generate TypeScript/React code.

IMPORTANT: Use ONLY the exact asset paths provided in the Available Assets section below. Do NOT invent or modify file names.

Available components - import each separately:
- TitleSlide: import { TitleSlide } from '../../components/TitleSlide';
- ContentSlide: import { ContentSlide } from '../../components/ContentSlide';
- VideoSlide: import { VideoSlide } from '../../components/VideoSlide';
- Logo: import { Logo } from '../../components/Logo';
- Music: import { Music } from '../../components/Music';

Component props:
- TitleSlide: { title: string, className?: string }
- ContentSlide: { header: string, content: string, className?: string }
- VideoSlide: { filename: string, startTime?: number }
- Logo: { src: string, position?: string, size?: number }
- Music: { src: string, volume?: number, fadeInSeconds?: number, fadeOutSeconds?: number }

Required imports:
\`\`\`tsx
import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { secondsToFrames } from '../../config';
import { createComposition } from '../../utils/createComposition';
import { TitleSlide } from '../../components/TitleSlide';
import { ContentSlide } from '../../components/ContentSlide';
import { VideoSlide } from '../../components/VideoSlide';
\`\`\`

Patterns:
- Use <Sequence from={secondsToFrames(X)} durationInFrames={secondsToFrames(Y)}>
- For video assets: Use staticFile('path') where 'path' is the EXACT path from Available Assets
- Use Tailwind for styling

Output structure:
\`\`\`tsx
import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { secondsToFrames } from '../../config';
import { createComposition } from '../../utils/createComposition';
import { TitleSlide } from '../../components/TitleSlide';
import { VideoSlide } from '../../components/VideoSlide';

const Composition: React.FC = () => (
  <AbsoluteFill className="bg-black">
    {/* Use EXACT paths from Available Assets */}
  </AbsoluteFill>
);

export const Video = createComposition({
  name: 'ComponentName',
  component: Composition,
  durationInSeconds: 30,
  fps: 60,
  width: 1080,
  height: 1920,
});
\`\`\`

Output ONLY valid TypeScript code, no markdown blocks or explanations.`;

export async function POST(request: NextRequest) {
  // Create a ReadableStream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      try {
        if (!genai) {
          sendEvent("error", { message: "Google API key not configured. Add GOOGLE_API_KEY to your .env file." });
          controller.close();
          return;
        }

        const body: StreamRequest = await request.json();
        const { projectId, prompt, assets, theme } = body;

        if (!prompt) {
          sendEvent("error", { message: "Prompt is required" });
          controller.close();
          return;
        }

        sendEvent("status", { message: "Starting generation..." });

        // Generate asset context
        const { systemContext } = generateAIContext(assets || [], theme, prompt);
        const assetManifest = generateAssetManifestText(assets || []);

        // Step 1: Generate Storyboard (streaming)
        sendEvent("status", { message: "Generating storyboard..." });

        const storyboardResponse = await genai.models.generateContentStream({
          model: MODEL_ID,
          contents: `Create a storyboard for this video:\n\n${prompt}\n\n${systemContext}\n\nOutput only valid JSON.`,
          config: {
            systemInstruction: STORYBOARD_PROMPT,
            maxOutputTokens: 4096,
          },
        });

        let storyboardText = "";

        for await (const chunk of storyboardResponse) {
          const text = chunk.text;
          if (text) {
            storyboardText += text;
            sendEvent("storyboard_chunk", { content: text });
          }
        }

        // Parse storyboard
        let storyboard: { scenes: StoryboardScene[]; totalDuration: number; summary: string };
        try {
          const cleanJson = storyboardText
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          storyboard = JSON.parse(cleanJson);
        } catch {
          console.error("[GenerateStream] Failed to parse storyboard:", storyboardText);
          sendEvent("error", { message: "Failed to parse storyboard" });
          controller.close();
          return;
        }

        sendEvent("storyboard_complete", { data: storyboard });

        // Step 2: Generate Composition Code (streaming)
        sendEvent("status", { message: "Generating composition code..." });

        const totalDuration = (storyboard.scenes as Array<{ duration?: number }>).reduce(
          (sum, s) => sum + (s.duration || 3),
          0
        );
        const dimensions = getVideoDimensions(theme.aspectRatio);

        const presetMap: Record<string, string> = {
          "9:16": "Portrait-1080p",
          "16:9": "Landscape-1080p",
          "1:1": "Square-1080p",
          "4:5": "Portrait-1080p",
        };
        const preset = presetMap[theme.aspectRatio] || "Portrait-1080p";

        const componentName =
          projectId
            .replace(/[^a-zA-Z0-9]/g, "")
            .replace(/^[0-9]+/, "")
            .replace(/^./, (c) => c.toUpperCase()) || "GeneratedVideo";

        const scenesDescription = (storyboard.scenes as Array<{
          type: string;
          duration: number;
          description: string;
          text?: string;
          voiceover?: string;
          assets?: string[];
          animation?: string;
        }>)
          .map((scene, i) => {
            return `Scene ${i + 1} (${scene.type}, ${scene.duration}s): ${scene.description}
  Text: ${scene.text || "none"} | Voiceover: ${scene.voiceover || "none"}
  Assets: ${scene.assets?.join(", ") || "none"} | Animation: ${scene.animation || "fade-in"}`;
          })
          .join("\n");

        const compositionResponse = await genai.models.generateContentStream({
          model: MODEL_ID,
          contents: `Generate Remotion composition:

Component: ${componentName}
Duration: ${totalDuration}s
Preset: ${preset} (${dimensions.width}x${dimensions.height})
Style: ${theme.style}
Colors: Primary ${theme.primaryColor}, Background ${theme.backgroundColor}, Text ${theme.textColor}

Storyboard:
${scenesDescription}

${assetManifest}

Generate complete code with proper imports and createComposition export.`,
          config: {
            systemInstruction: COMPOSITION_PROMPT,
            maxOutputTokens: 8192,
          },
        });

        let compositionCode = "";

        for await (const chunk of compositionResponse) {
          const text = chunk.text;
          if (text) {
            compositionCode += text;
            sendEvent("code_chunk", { content: text });
          }
        }

        // Clean up code
        compositionCode = compositionCode
          .replace(/^```(?:tsx|typescript|ts)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        const compositionConfig = {
          id: componentName,
          durationInFrames: totalDuration * 60,
          fps: 60,
          width: dimensions.width,
          height: dimensions.height,
        };

        sendEvent("code_complete", {
          data: {
            code: compositionCode,
            config: compositionConfig,
          },
        });

        // Step 3: Write composition to filesystem
        sendEvent("status", { message: "Saving composition to disk..." });

        const writeResult = await writeComposition({
          projectId,
          compositionCode,
          config: compositionConfig,
          storyboard,
        });

        if (writeResult.success) {
          sendEvent("file_written", {
            compositionId: writeResult.compositionId,
            compositionPath: writeResult.compositionPath,
          });
          console.log(`[GenerateStream] Composition written to: ${writeResult.compositionPath}`);
        } else {
          // Log error but don't fail the whole request - the code is still generated
          console.error(`[GenerateStream] Failed to write composition: ${writeResult.error}`);
          sendEvent("file_write_error", {
            error: writeResult.error,
          });
        }

        sendEvent("done", {
          projectId,
          storyboard,
          compositionCode,
          compositionPath: writeResult.compositionPath,
          compositionId: writeResult.compositionId,
        });

        controller.close();
      } catch (error) {
        console.error("[GenerateStream] Error:", error);
        const message = error instanceof Error ? error.message : "Generation failed";
        sendEvent("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
