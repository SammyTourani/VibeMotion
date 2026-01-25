import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Scene, ThemeConfig, UploadedAsset } from "@/lib/types";
import { generateAssetManifestText } from "@/lib/asset-gallery";
import { getVideoDimensions } from "@/lib/asset-processor";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

// Use Gemini 2.0 Flash - fast and capable
const MODEL_ID = "gemini-2.0-flash";

interface CompositionRequest {
  scenes: Scene[];
  assets: UploadedAsset[];
  theme: ThemeConfig;
  projectId: string;
}

interface CompositionResponse {
  code: string;
  config: {
    id: string;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
  };
}

const COMPOSITION_SYSTEM_PROMPT = `You are an expert Remotion developer. Generate React/TypeScript code for video compositions.

## Available Components (import from '../../components/')

1. **TitleSlide** - Full-screen title
   Props: { title: string, className?: string }

2. **ContentSlide** - Header with body text
   Props: { header: string, content: string, className?: string }

3. **VideoSlide** - Video playback
   Props: { filename: string, startTime?: number }

4. **Logo** - Logo overlay with animation
   Props: { src: string, position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center', size?: number }

5. **Caption** - Subtitle overlay
   Props: { transcript: { text: string, words: Array<{ text: string, start: number, end: number }> }, className?: string }

6. **Music** - Background audio
   Props: { src: string, volume?: number, fadeInSeconds?: number, fadeOutSeconds?: number, loop?: boolean }

## Remotion Imports
\`\`\`tsx
import { AbsoluteFill, Sequence, Img, Video, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
\`\`\`

## Key Patterns

1. **Timing with Sequence**:
\`\`\`tsx
import { secondsToFrames } from '../../config';

<Sequence from={secondsToFrames(0)} durationInFrames={secondsToFrames(3)}>
  <TitleSlide title="Hello" />
</Sequence>
\`\`\`

2. **Assets with staticFile**:
\`\`\`tsx
<Img src={staticFile('assets/images/photo.png')} />
<Video src={staticFile('assets/videos/clip.mp4')} />
\`\`\`

3. **Transitions**:
\`\`\`tsx
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={180}>
    <Scene1 />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 30 })}
  />
  <TransitionSeries.Sequence durationInFrames={180}>
    <Scene2 />
  </TransitionSeries.Sequence>
</TransitionSeries>
\`\`\`

4. **Custom Animations**:
\`\`\`tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
\`\`\`

## Output Format

Return ONLY valid TypeScript/React code. The composition should:
1. Be a named export matching the project ID (PascalCase)
2. Use the createComposition helper
3. Include all necessary imports

Example structure:
\`\`\`tsx
import React from 'react';
import { AbsoluteFill, Sequence, Img, staticFile } from 'remotion';
import { createComposition } from '../../utils/createComposition';
import { secondsToFrames } from '../../config';
import { TitleSlide } from '../../components/TitleSlide';
// ... more imports

const MyVideoComposition: React.FC = () => {
  return (
    <AbsoluteFill className="bg-black">
      {/* Scenes here */}
    </AbsoluteFill>
  );
};

export const MyVideo = createComposition({
  name: 'MyVideo',
  component: MyVideoComposition,
  durationInSeconds: 30,
  preset: 'Portrait-1080p',
});
\`\`\`

Output ONLY the code. No explanations, no markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    if (!genai) {
      return NextResponse.json(
        { error: "Google API key not configured. Add GOOGLE_API_KEY to your .env file." },
        { status: 500 }
      );
    }

    const body: CompositionRequest = await request.json();
    const { scenes, assets, theme, projectId } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { error: "Scenes are required" },
        { status: 400 }
      );
    }

    // Calculate total duration
    const totalDuration = scenes.reduce((sum, scene) => sum + (scene.duration || 3), 0);

    // Get dimensions based on aspect ratio
    const dimensions = getVideoDimensions(theme.aspectRatio);

    // Determine preset name
    const presetMap: Record<string, string> = {
      "9:16": "Portrait-1080p",
      "16:9": "Landscape-1080p",
      "1:1": "Square-1080p",
      "4:5": "Portrait-1080p",
    };
    const preset = presetMap[theme.aspectRatio] || "Portrait-1080p";

    // Generate component name from project ID
    const componentName = projectId
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/^[0-9]+/, "")
      .replace(/^./, (c) => c.toUpperCase()) || "GeneratedVideo";

    // Build asset context
    const assetManifest = generateAssetManifestText(assets || []);

    // Build scenes description
    const scenesDescription = scenes.map((scene, i) => {
      return `Scene ${i + 1} (${scene.type}, ${scene.duration}s):
  - Description: ${scene.description}
  - Text: ${scene.text || "none"}
  - Voiceover: ${scene.voiceover || "none"}
  - Assets: ${scene.assets?.join(", ") || "none"}
  - Animation: ${scene.animation || "fade-in"}`;
    }).join("\n\n");

    const userMessage = `Generate a Remotion composition for this video:

## Project Configuration
- Component Name: ${componentName}
- Total Duration: ${totalDuration} seconds
- Preset: ${preset}
- Dimensions: ${dimensions.width}x${dimensions.height}
- Aspect Ratio: ${theme.aspectRatio}
- Style: ${theme.style}
- Primary Color: ${theme.primaryColor}
- Background Color: ${theme.backgroundColor}
- Text Color: ${theme.textColor}

## Storyboard
${scenesDescription}

${assetManifest}

Generate the complete Remotion composition code. Use Tailwind classes for styling. Apply the theme colors where appropriate.`;

    console.log("[Composition] Generating code for", scenes.length, "scenes");

    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: userMessage,
      config: {
        systemInstruction: COMPOSITION_SYSTEM_PROMPT,
        maxOutputTokens: 8192,
      },
    });

    let code = response.text || "";

    // Clean up potential markdown formatting
    code = code
      .replace(/^```(?:tsx|typescript|ts)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    console.log("[Composition] Generated", code.length, "characters of code");

    const compositionResponse: CompositionResponse = {
      code,
      config: {
        id: componentName,
        durationInFrames: totalDuration * 60, // 60fps
        fps: 60,
        width: dimensions.width,
        height: dimensions.height,
      },
    };

    return NextResponse.json({
      composition: compositionResponse,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    });
  } catch (error) {
    console.error("[Composition] Error:", error);
    const message = error instanceof Error ? error.message : "Composition generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
