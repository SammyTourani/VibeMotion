/**
 * Voiceover Generation API Endpoint
 *
 * POST /api/voiceover - Generate voiceovers for storyboard scenes
 * GET /api/voiceover - List available voices
 *
 * Uses ElevenLabs TTS API to convert scene voiceover scripts to audio.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  generateSpeech,
  getVoices,
  estimateAudioDuration,
  isConfigured,
  DEFAULT_VOICE_ID,
} from "@/lib/elevenlabs";

// Request types
interface VoiceoverScene {
  id: string;
  voiceover?: string;
  duration: number;
}

interface VoiceoverRequest {
  scenes: VoiceoverScene[];
  voiceId?: string;
}

// Response types
interface VoiceoverResult {
  sceneId: string;
  audioPath: string | null;
  audioDuration: number;
  error?: string;
}

interface VoiceoverResponse {
  success: boolean;
  results: VoiceoverResult[];
  totalGenerated: number;
  message?: string;
  error?: string;
}

/**
 * POST /api/voiceover
 * Generate voiceovers for scenes with voiceover text
 */
export async function POST(request: NextRequest): Promise<NextResponse<VoiceoverResponse>> {
  try {
    // Check if ElevenLabs is configured
    if (!isConfigured()) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          totalGenerated: 0,
          error: "ElevenLabs API key not configured. Add ELEVENLABS_API_KEY to your .env file.",
        },
        { status: 500 }
      );
    }

    const body: VoiceoverRequest = await request.json();
    const { scenes, voiceId = DEFAULT_VOICE_ID } = body;

    // Validate request
    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          totalGenerated: 0,
          error: "Invalid request: scenes array is required",
        },
        { status: 400 }
      );
    }

    // Filter scenes that have voiceover text
    const scenesWithVoiceover = scenes.filter(
      (s) => s.voiceover && s.voiceover.trim().length > 0
    );

    if (scenesWithVoiceover.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        totalGenerated: 0,
        message: "No scenes with voiceover text found",
      });
    }

    // Ensure output directory exists
    const audioDir = path.join(process.cwd(), "public", "assets", "audio", "voiceovers");
    await fs.mkdir(audioDir, { recursive: true });

    // Generate voiceovers for each scene (sequentially to avoid rate limits)
    const results: VoiceoverResult[] = [];

    for (const scene of scenesWithVoiceover) {
      try {
        console.log(
          `[Voiceover] Generating for scene ${scene.id}: "${scene.voiceover?.slice(0, 50)}..."`
        );

        // Generate speech
        const { audio } = await generateSpeech({
          text: scene.voiceover!,
          voiceId,
        });

        // Save audio file
        const filename = `${scene.id}.mp3`;
        const filePath = path.join(audioDir, filename);
        await fs.writeFile(filePath, audio);

        // Calculate audio duration
        const audioDuration = estimateAudioDuration(audio);

        // Public path for the audio file
        const publicPath = `assets/audio/voiceovers/${filename}`;

        results.push({
          sceneId: scene.id,
          audioPath: publicPath,
          audioDuration,
        });

        console.log(`[Voiceover] Saved: ${publicPath} (${audioDuration.toFixed(2)}s)`);
      } catch (error) {
        console.error(`[Voiceover] Error for scene ${scene.id}:`, error);
        results.push({
          sceneId: scene.id,
          audioPath: null,
          audioDuration: 0,
          error: error instanceof Error ? error.message : "Generation failed",
        });
      }

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const successCount = results.filter((r) => r.audioPath !== null).length;

    return NextResponse.json({
      success: true,
      results,
      totalGenerated: successCount,
      message: `Generated ${successCount} of ${scenesWithVoiceover.length} voiceovers`,
    });
  } catch (error) {
    console.error("[Voiceover] API error:", error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        totalGenerated: 0,
        error: error instanceof Error ? error.message : "Voiceover generation failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/voiceover
 * List available voices from ElevenLabs
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Check if ElevenLabs is configured
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    const voices = await getVoices();

    // Return simplified voice list with most useful info
    const simplifiedVoices = voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description || "",
      preview_url: v.preview_url,
      labels: v.labels,
    }));

    return NextResponse.json({
      voices: simplifiedVoices,
      defaultVoiceId: DEFAULT_VOICE_ID,
      total: simplifiedVoices.length,
    });
  } catch (error) {
    console.error("[Voiceover] Error fetching voices:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch voices" },
      { status: 500 }
    );
  }
}
