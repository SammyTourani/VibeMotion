# Feature 5: ElevenLabs Voiceover Integration - Implementation Plan

**Status:** Planning
**Priority:** MEDIUM
**Dependencies:** Feature 3 (Live Remotion Player) ✅, Feature 4 (Render Trigger) ✅

---

## Problem Statement

Currently, after storyboard generation:
1. Each scene has a `voiceover` field with the script text
2. BUT this is just text - no actual audio is generated
3. Users would have to manually create voiceovers elsewhere
4. The DynamicPreview composition renders scenes but has no audio

**Goal:** Generate AI voiceovers from storyboard scripts using ElevenLabs TTS, sync audio with video scenes.

---

## Technical Analysis

### How ElevenLabs TTS Works

The ElevenLabs API generates speech from text:
```bash
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Headers: xi-api-key: <api-key>
Body: { "text": "Hello world", "model_id": "eleven_multilingual_v2" }
Response: audio/mpeg binary stream
```

Key features:
- **Voice selection**: Pre-built voices or cloned voices
- **Model selection**: `eleven_multilingual_v2` (best quality) or `eleven_turbo_v2_5` (faster)
- **Output format**: MP3, PCM, or other formats
- **Character limits**: 5000 chars per request (standard tier)

### Current State

- ✅ `ELEVENLABS_API_KEY` placeholder exists in `.env.example`
- ❌ No ElevenLabs client code exists
- ❌ No voiceover generation API endpoint
- ❌ DynamicPreview doesn't handle scene-level audio
- ✅ `Music.tsx` component exists for background audio (can reference pattern)

### Solution Architecture

```
[Storyboard Generated]
     ↓
[Scene voiceover scripts extracted]
     ↓
POST /api/voiceover { scenes, voiceId }
     ↓
[Server - for each scene with voiceover]:
     ├── Call ElevenLabs TTS API
     ├── Save audio to public/assets/audio/{sceneId}.mp3
     └── Return audio URLs for each scene
     ↓
[Update storyboard with audio paths]
     ↓
[DynamicPreview plays audio synced to scenes]
```

---

## Implementation Plan

### Step 5.1: Create ElevenLabs Client Library

**File:** `lib/elevenlabs.ts`

```typescript
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

interface VoiceSettings {
  stability?: number;      // 0-1, default 0.5
  similarity_boost?: number; // 0-1, default 0.75
  style?: number;          // 0-1, default 0
  use_speaker_boost?: boolean;
}

interface TTSRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
}

interface TTSResponse {
  audio: Buffer;
  contentType: string;
}

export async function generateSpeech(request: TTSRequest): Promise<TTSResponse> {
  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${request.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: request.modelId || "eleven_multilingual_v2",
        voice_settings: request.voiceSettings || {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`ElevenLabs error: ${error.detail?.message || response.statusText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    audio: audioBuffer,
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}

// Get available voices
export async function getVoices(): Promise<Voice[]> {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
  });

  if (!response.ok) throw new Error("Failed to fetch voices");
  const data = await response.json();
  return data.voices;
}

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: Record<string, string>;
}
```

---

### Step 5.2: Create `/api/voiceover` Endpoint

**File:** `app/api/voiceover/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { generateSpeech, getVoices } from "@/lib/elevenlabs";

interface VoiceoverRequest {
  scenes: Array<{
    id: string;
    voiceover?: string;
    duration: number;
  }>;
  voiceId?: string; // Optional, use default if not provided
}

interface VoiceoverResult {
  sceneId: string;
  audioPath: string | null;
  duration: number; // Audio duration in seconds
  error?: string;
}

// Default voice (Rachel - calm, professional female voice)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    const body: VoiceoverRequest = await request.json();
    const { scenes, voiceId = DEFAULT_VOICE_ID } = body;

    // Filter scenes that have voiceover text
    const scenesWithVoiceover = scenes.filter(
      (s) => s.voiceover && s.voiceover.trim().length > 0
    );

    if (scenesWithVoiceover.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: "No scenes with voiceover text",
      });
    }

    // Ensure output directory exists
    const audioDir = path.join(process.cwd(), "public", "assets", "audio", "voiceovers");
    await fs.mkdir(audioDir, { recursive: true });

    // Generate voiceovers for each scene
    const results: VoiceoverResult[] = [];

    for (const scene of scenesWithVoiceover) {
      try {
        console.log(`[Voiceover] Generating for scene ${scene.id}: "${scene.voiceover?.slice(0, 50)}..."`);

        const { audio } = await generateSpeech({
          text: scene.voiceover!,
          voiceId,
        });

        // Save audio file
        const filename = `${scene.id}.mp3`;
        const filePath = path.join(audioDir, filename);
        await fs.writeFile(filePath, audio);

        // Calculate audio duration (approximate from file size)
        // More accurate: use ffprobe or audio parsing library
        const audioDuration = await getAudioDuration(audio);

        const publicPath = `/assets/audio/voiceovers/${filename}`;

        results.push({
          sceneId: scene.id,
          audioPath: publicPath,
          duration: audioDuration,
        });

        console.log(`[Voiceover] Saved: ${publicPath} (${audioDuration.toFixed(2)}s)`);
      } catch (error) {
        console.error(`[Voiceover] Error for scene ${scene.id}:`, error);
        results.push({
          sceneId: scene.id,
          audioPath: null,
          duration: 0,
          error: error instanceof Error ? error.message : "Generation failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      totalGenerated: results.filter((r) => r.audioPath).length,
    });
  } catch (error) {
    console.error("[Voiceover] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voiceover generation failed" },
      { status: 500 }
    );
  }
}

// GET: List available voices
export async function GET() {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    const voices = await getVoices();

    // Return simplified voice list
    const simplifiedVoices = voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      preview_url: v.preview_url,
    }));

    return NextResponse.json({ voices: simplifiedVoices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch voices" },
      { status: 500 }
    );
  }
}

// Helper to estimate audio duration from MP3 buffer
// Note: For production, use ffprobe or music-metadata library
async function getAudioDuration(buffer: Buffer): Promise<number> {
  // MP3 bitrate estimation: assume 128kbps for ElevenLabs output
  // Formula: duration = (fileSize * 8) / (bitrate * 1000)
  const bitrate = 128; // kbps
  const fileSizeBytes = buffer.length;
  const durationSeconds = (fileSizeBytes * 8) / (bitrate * 1000);
  return durationSeconds;
}
```

---

### Step 5.3: Update DynamicPreview to Support Audio

**File:** `src/compositions/dynamic-preview/DynamicPreview.tsx` (modifications)

Add audio playback support for scenes with voiceover audio:

```tsx
// Add to Scene interface
export interface Scene {
  id: string;
  type: "title" | "content" | "image" | "video" | "transition" | string;
  duration: number;
  description: string;
  text?: string;
  assets?: string[];
  voiceover?: string;
  voiceoverAudio?: string; // Path to generated audio file
  animation?: "fade-in" | "slide-up" | "zoom-in" | "none" | string;
  order?: number;
}

// Inside the DynamicPreview component, add audio track for each scene
<Sequence
  key={scene.id || `scene-${index}`}
  from={startFrame}
  durationInFrames={durationInFrames}
>
  <SceneRenderer scene={scene} theme={actualTheme} />
  {/* Scene-specific voiceover audio */}
  {scene.voiceoverAudio && (
    <Audio
      src={staticFile(scene.voiceoverAudio)}
      volume={1}
    />
  )}
</Sequence>
```

---

### Step 5.4: Create Voiceover Generation Hook

**File:** `hooks/useVoiceoverGeneration.ts`

```typescript
import { useState, useCallback } from "react";

interface Scene {
  id: string;
  voiceover?: string;
  duration: number;
}

interface VoiceoverResult {
  sceneId: string;
  audioPath: string | null;
  duration: number;
  error?: string;
}

interface UseVoiceoverGenerationOptions {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: VoiceoverResult[]) => void;
  onError?: (error: string) => void;
}

export function useVoiceoverGeneration(options: UseVoiceoverGenerationOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<VoiceoverResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateVoiceovers = useCallback(
    async (scenes: Scene[], voiceId?: string): Promise<VoiceoverResult[]> => {
      setIsGenerating(true);
      setProgress(0);
      setError(null);

      try {
        const response = await fetch("/api/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenes, voiceId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Voiceover generation failed");
        }

        setResults(data.results);
        setProgress(100);
        options.onComplete?.(data.results);

        return data.results;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Generation failed";
        setError(errorMessage);
        options.onError?.(errorMessage);
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    [options]
  );

  return {
    generateVoiceovers,
    isGenerating,
    progress,
    results,
    error,
  };
}
```

---

### Step 5.5: Update Sandbox UI for Voiceover Generation

**File:** `app/sandbox/page.tsx` (modifications)

Add voiceover generation button and state:

```tsx
// Add imports
import { useVoiceoverGeneration } from "@/hooks/useVoiceoverGeneration";
import { Mic, Volume2 } from "lucide-react";

// Add state
const [hasVoiceovers, setHasVoiceovers] = useState(false);

// Add hook
const {
  generateVoiceovers,
  isGenerating: isGeneratingVoiceover,
  progress: voiceoverProgress,
} = useVoiceoverGeneration({
  onComplete: (results) => {
    // Update storyboard scenes with audio paths
    if (storyboard) {
      const updatedScenes = storyboard.scenes.map((scene) => {
        const result = results.find((r) => r.sceneId === scene.id);
        if (result?.audioPath) {
          return { ...scene, voiceoverAudio: result.audioPath };
        }
        return scene;
      });
      setStoryboard({ ...storyboard, scenes: updatedScenes });
      setHasVoiceovers(true);
    }
  },
});

// Add handler
const handleGenerateVoiceovers = async () => {
  if (!storyboard) return;
  await generateVoiceovers(storyboard.scenes);
};

// Add button in header (next to Render Video button)
{status === "complete" && !hasVoiceovers && (
  <motion.button
    onClick={handleGenerateVoiceovers}
    disabled={isGeneratingVoiceover}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg text-sm font-medium"
  >
    {isGeneratingVoiceover ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" />
        Generating Voiceovers...
      </>
    ) : (
      <>
        <Mic className="w-4 h-4" />
        Generate Voiceovers
      </>
    )}
  </motion.button>
)}

{hasVoiceovers && (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-lg text-sm text-green-400">
    <Volume2 className="w-4 h-4" />
    Voiceovers Ready
  </div>
)}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/elevenlabs.ts` | CREATE | ElevenLabs API client library |
| `app/api/voiceover/route.ts` | CREATE | POST to generate, GET to list voices |
| `src/compositions/dynamic-preview/DynamicPreview.tsx` | MODIFY | Add voiceoverAudio field and Audio playback |
| `hooks/useVoiceoverGeneration.ts` | CREATE | React hook for voiceover generation |
| `app/sandbox/page.tsx` | MODIFY | Add voiceover generation button |
| `public/assets/audio/voiceovers/` | CREATE (dir) | Store generated voiceover files |
| `.env.example` | VERIFY | Already has ELEVENLABS_API_KEY placeholder |

---

## User Flow

```
1. User generates video storyboard
     ↓
2. Storyboard has voiceover scripts for each scene
     ↓
3. User clicks "Generate Voiceovers" button
     ↓
4. POST /api/voiceover with scene scripts
     ↓
5. Server calls ElevenLabs TTS for each scene
     - Scene 1: "Welcome to our demo..." → scene-1.mp3
     - Scene 2: "Here's how it works..." → scene-2.mp3
     ↓
6. Audio files saved to public/assets/audio/voiceovers/
     ↓
7. Storyboard updated with voiceoverAudio paths
     ↓
8. DynamicPreview plays audio synced to each scene
     ↓
9. When user renders video, audio is included
```

---

## Integration Points

### With Feature 3 (Live Remotion Player)
- DynamicPreview already receives scene data
- Add `voiceoverAudio` field to scenes
- Audio plays automatically with each scene in preview

### With Feature 4 (Render Trigger)
- When rendering, voiceover audio is already embedded
- `staticFile()` ensures audio files are bundled
- No changes needed to render API

### With Storyboard Generation
- Storyboard already has `voiceover` text field
- No changes needed to generate-stream API
- Voiceover generation is a separate post-processing step

---

## Edge Cases Handled

1. **No voiceover text:** Skip generation for scenes without voiceover
2. **ElevenLabs rate limits:** Sequential generation with error handling
3. **Long voiceover text:** ElevenLabs handles up to 5000 chars
4. **Missing API key:** Return clear error message
5. **Audio duration mismatch:** Audio plays regardless of scene duration (may need trimming later)
6. **Generation failure:** Scene continues without audio, error logged

---

## Success Criteria

- [ ] "Generate Voiceovers" button triggers TTS generation
- [ ] Audio files saved to correct location
- [ ] Preview plays audio synced to scenes
- [ ] Rendered video includes voiceover audio
- [ ] Error handling for missing API key
- [ ] Voice selection available (future enhancement)

---

## Confidence Level: HIGH

This approach is sound because:
1. ElevenLabs API is well-documented and reliable
2. Remotion's `<Audio>` component handles audio playback
3. `staticFile()` ensures audio is bundled for rendering
4. Sequential scene processing avoids rate limit issues
5. Voiceover generation is decoupled from storyboard generation
6. Music.tsx provides proven audio pattern to follow

**Ready for implementation.**
