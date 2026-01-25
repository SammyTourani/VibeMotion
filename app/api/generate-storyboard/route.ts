import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Scene, ThemeConfig, UploadedAsset } from "@/lib/types";
import { generateAIContext } from "@/lib/asset-processor";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

// Use Gemini 2.0 Flash - fast and capable
const MODEL_ID = "gemini-2.0-flash";

interface StoryboardRequest {
  prompt: string;
  assets: UploadedAsset[];
  theme: ThemeConfig;
}

interface StoryboardResponse {
  scenes: Scene[];
  totalDuration: number;
  summary: string;
}

const STORYBOARD_SYSTEM_PROMPT = `You are a professional video director specializing in short-form viral content (TikTok, Reels, Shorts).

Your task is to create a scene-by-scene storyboard for a video based on the user's description and available assets.

## Rules for Creating Storyboards

1. **Hook First**: The first 3 seconds must grab attention
2. **Fast Pacing**: Keep scenes between 2-5 seconds for short-form content
3. **Use Assets Strategically**: Reference the provided assets by their exact names
4. **Include Voiceover Scripts**: Write what should be said in each scene
5. **End with CTA**: Include a clear call-to-action at the end
6. **Total Duration**: Keep total video between 15-60 seconds unless specified otherwise

## Scene Types
- "title": Full-screen text/title
- "content": Text with header and body
- "video": Video clip playback
- "image": Image display with animation
- "transition": Transition effect between scenes

## Output Format
Return a valid JSON object with this structure:
{
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "type": "title" | "content" | "video" | "image" | "transition",
      "duration": <number in seconds>,
      "description": "<what happens in this scene>",
      "assets": ["<asset names to use>"],
      "text": "<text to display if applicable>",
      "voiceover": "<what to say during this scene>",
      "animation": "<animation type: fade-in, zoom, slide, etc.>"
    }
  ],
  "totalDuration": <sum of all scene durations>,
  "summary": "<one sentence summary of the video>"
}

Only output valid JSON. No markdown code blocks, no explanations.`;

export async function POST(request: NextRequest) {
  try {
    if (!genai) {
      return NextResponse.json(
        { error: "Google API key not configured. Add GOOGLE_API_KEY to your .env file." },
        { status: 500 }
      );
    }

    const body: StoryboardRequest = await request.json();
    const { prompt, assets, theme } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Generate AI context from assets
    const { systemContext } = generateAIContext(assets || [], theme, prompt);

    // Build the user message
    const userMessage = `Create a storyboard for this video:

${prompt}

${systemContext}

Remember: Output only valid JSON matching the specified format.`;

    console.log("[Storyboard] Generating storyboard for prompt:", prompt.substring(0, 100));

    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: userMessage,
      config: {
        systemInstruction: STORYBOARD_SYSTEM_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    const responseText = response.text || "";

    // Parse the JSON response
    let storyboard: StoryboardResponse;
    try {
      // Clean up potential markdown formatting
      const cleanJson = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      storyboard = JSON.parse(cleanJson);
    } catch {
      console.error("[Storyboard] Failed to parse response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse storyboard response" },
        { status: 500 }
      );
    }

    // Validate and add IDs if missing
    storyboard.scenes = storyboard.scenes.map((scene, index) => ({
      ...scene,
      id: scene.id || `scene-${index + 1}`,
      order: scene.order || index + 1,
      assets: scene.assets || [],
    }));

    console.log("[Storyboard] Generated", storyboard.scenes.length, "scenes");

    return NextResponse.json({
      storyboard,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    });
  } catch (error) {
    console.error("[Storyboard] Error:", error);
    const message = error instanceof Error ? error.message : "Storyboard generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
