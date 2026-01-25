import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Scene, ThemeConfig, UploadedAsset } from "@/lib/types";
import { generateAIContext } from "@/lib/asset-processor";
import { generateAssetManifestText } from "@/lib/asset-gallery";
import { getVideoDimensions } from "@/lib/asset-processor";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

// Use Gemini 2.0 Flash - fast and capable
const MODEL_ID = "gemini-2.0-flash";

interface GenerateVideoRequest {
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

Available components (from '../../components/'):
- TitleSlide: { title, className? }
- ContentSlide: { header, content, className? }
- VideoSlide: { filename, startTime? }
- Logo: { src, position?, size? }
- Music: { src, volume?, fadeInSeconds?, fadeOutSeconds? }

Key imports:
\`\`\`tsx
import { AbsoluteFill, Sequence, Img, staticFile } from 'remotion';
import { secondsToFrames } from '../../config';
import { createComposition } from '../../utils/createComposition';
\`\`\`

Patterns:
- Use <Sequence from={secondsToFrames(X)} durationInFrames={secondsToFrames(Y)}>
- Use staticFile('assets/type/filename.ext') for assets
- Use Tailwind for styling

Output structure:
\`\`\`tsx
import React from 'react';
// imports...

const Composition: React.FC = () => (
  <AbsoluteFill className="bg-black">
    {/* scenes */}
  </AbsoluteFill>
);

export const Video = createComposition({
  name: 'Video',
  component: Composition,
  durationInSeconds: 30,
  preset: 'Portrait-1080p',
});
\`\`\`

Output ONLY code, no markdown blocks or explanations.`;

export async function POST(request: NextRequest) {
  try {
    if (!genai) {
      return NextResponse.json(
        { error: "Google API key not configured. Add GOOGLE_API_KEY to your .env file." },
        { status: 500 }
      );
    }

    const body: GenerateVideoRequest = await request.json();
    const { projectId, prompt, assets, theme } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    console.log("[GenerateVideo] Starting generation for project:", projectId);

    // Generate asset context
    const { systemContext } = generateAIContext(assets || [], theme, prompt);
    const assetManifest = generateAssetManifestText(assets || []);

    // Step 1: Generate Storyboard
    console.log("[GenerateVideo] Step 1: Generating storyboard...");

    const storyboardResponse = await genai.models.generateContent({
      model: MODEL_ID,
      contents: `Create a storyboard for this video:\n\n${prompt}\n\n${systemContext}\n\nOutput only valid JSON.`,
      config: {
        systemInstruction: STORYBOARD_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    const storyboardText = storyboardResponse.text || "";

    // Parse storyboard
    let storyboard: { scenes: Scene[]; totalDuration: number; summary: string };
    try {
      const cleanJson = storyboardText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      storyboard = JSON.parse(cleanJson);
    } catch {
      console.error("[GenerateVideo] Failed to parse storyboard:", storyboardText);
      return NextResponse.json(
        { error: "Failed to parse storyboard" },
        { status: 500 }
      );
    }

    // Validate scenes
    storyboard.scenes = storyboard.scenes.map((scene, index) => ({
      ...scene,
      id: scene.id || `scene-${index + 1}`,
      order: scene.order || index + 1,
      assets: scene.assets || [],
    }));

    console.log("[GenerateVideo] Storyboard generated:", storyboard.scenes.length, "scenes");

    // Step 2: Generate Composition Code
    console.log("[GenerateVideo] Step 2: Generating composition code...");

    const totalDuration = storyboard.scenes.reduce((sum, s) => sum + (s.duration || 3), 0);
    const dimensions = getVideoDimensions(theme.aspectRatio);

    const presetMap: Record<string, string> = {
      "9:16": "Portrait-1080p",
      "16:9": "Landscape-1080p",
      "1:1": "Square-1080p",
      "4:5": "Portrait-1080p",
    };
    const preset = presetMap[theme.aspectRatio] || "Portrait-1080p";

    const componentName = projectId
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/^[0-9]+/, "")
      .replace(/^./, (c) => c.toUpperCase()) || "GeneratedVideo";

    const scenesDescription = storyboard.scenes.map((scene, i) => {
      return `Scene ${i + 1} (${scene.type}, ${scene.duration}s): ${scene.description}
  Text: ${scene.text || "none"} | Voiceover: ${scene.voiceover || "none"}
  Assets: ${scene.assets?.join(", ") || "none"} | Animation: ${scene.animation || "fade-in"}`;
    }).join("\n");

    const compositionResponse = await genai.models.generateContent({
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

    let compositionCode = compositionResponse.text || "";

    // Clean up code
    compositionCode = compositionCode
      .replace(/^```(?:tsx|typescript|ts)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    console.log("[GenerateVideo] Composition generated:", compositionCode.length, "chars");

    // Return complete result
    return NextResponse.json({
      success: true,
      projectId,
      storyboard: {
        scenes: storyboard.scenes,
        totalDuration: storyboard.totalDuration || totalDuration,
        summary: storyboard.summary,
      },
      composition: {
        code: compositionCode,
        config: {
          id: componentName,
          durationInFrames: totalDuration * 60,
          fps: 60,
          width: dimensions.width,
          height: dimensions.height,
        },
      },
      usage: {
        storyboard: {
          input_tokens: 0,
          output_tokens: 0,
        },
        composition: {
          input_tokens: 0,
          output_tokens: 0,
        },
      },
    });
  } catch (error) {
    console.error("[GenerateVideo] Error:", error);
    const message = error instanceof Error ? error.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
