# Feature 7: AI Video Generation (Veo) - Implementation Plan

**Created**: January 24, 2026
**Status**: Planning
**Dependencies**: Feature 6 (Image Generation - for shared Replicate infrastructure)

---

## Overview

Add AI video clip generation using Google's Veo 3.1 Fast model via Replicate. Users can generate short video clips (4-8 seconds) from text prompts, optionally with a starting frame image. Generated videos include context-aware audio.

**Key Difference from Image Generation**: Video generation takes 90-120 seconds, requiring a polling-based approach instead of waiting synchronously.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sandbox Page                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  "Generate Video" Button  →  Opens Video Generation Modal   ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  useVideoGeneration Hook                                     ││
│  │  - prompt, duration, aspectRatio state                       ││
│  │  - startGeneration() → initiates, returns predictionId       ││
│  │  - pollStatus() → checks status periodically                 ││
│  │  - isGenerating, progress, elapsedTime, result, error        ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  POST /api/generate-ai-video                                 ││
│  │  - Starts Veo generation (no wait)                           ││
│  │  - Returns predictionId immediately                          ││
│  │                                                              ││
│  │  GET /api/generate-ai-video?id={predictionId}                ││
│  │  - Polls prediction status                                   ││
│  │  - When complete: downloads video to public/assets/videos/   ││
│  │  - Returns local path                                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  lib/replicate.ts (EXTEND)                                   ││
│  │  - createVideoPrediction() - Veo-specific                    ││
│  │  - downloadVideo() - MP4 download                            ││
│  │  - VEO_FAST_MODEL, VEO_MODEL constants                       ││
│  │  - getPrediction() - already exists, reuse                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 7.1: Extend Replicate Client for Veo (`lib/replicate.ts`)

**Purpose**: Add Veo-specific functions to existing Replicate client

**New Constants**:
```typescript
// Veo model details
export const VEO_FAST_MODEL = "google/veo-3.1-fast";
export const VEO_MODEL = "google/veo-3.1";

// Veo-specific settings
export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_DURATIONS = [4, 6, 8] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];
```

**New Interfaces**:
```typescript
interface VideoPredictionOptions {
  prompt: string;
  aspectRatio?: VideoAspectRatio;
  duration?: VideoDuration;
  resolution?: "1080p";
  generateAudio?: boolean;
  startingFrameUrl?: string;  // Optional reference image
  useFastModel?: boolean;     // Default true
}
```

**New Functions**:
```typescript
// Create video prediction (no wait - returns immediately)
export async function createVideoPrediction(
  options: VideoPredictionOptions
): Promise<CreatePredictionResponse>

// Download video from URL to Buffer
export async function downloadVideo(videoUrl: string): Promise<Buffer>

// Generate video filename
export function generateVideoFilename(prompt: string): string

// Estimate Veo generation time
export function estimateVeoGenerationTime(duration: VideoDuration): number
```

---

### Step 7.2: Create AI Video Generation API Endpoint

**File**: `app/api/generate-ai-video/route.ts`

**Note**: Named `generate-ai-video` to differentiate from existing `generate-video` (which generates storyboards)

**POST Endpoint** - Start video generation:
```typescript
interface GenerateAIVideoRequest {
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  duration?: 4 | 6 | 8;
  startingFrameUrl?: string;
  useFastModel?: boolean;
}

interface GenerateAIVideoStartResponse {
  success: boolean;
  predictionId?: string;
  estimatedTime?: number;  // In seconds
  error?: string;
}
```

**GET Endpoint** - Poll status & get result:
```typescript
// GET /api/generate-ai-video?id={predictionId}

interface GenerateAIVideoStatusResponse {
  success: boolean;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  videoPath?: string;      // Local path when complete
  videoUrl?: string;       // CDN URL
  elapsedTime?: number;
  error?: string;
}
```

**Flow**:
1. POST: Create prediction without `Prefer: wait`
2. Return predictionId immediately
3. Client polls GET endpoint every 5-10 seconds
4. When status = "succeeded":
   - Download video to `public/assets/videos/generated/`
   - Return local path

---

### Step 7.3: Create Video Generation Hook (`hooks/useVideoGeneration.ts`)

**Purpose**: React hook for managing video generation with polling

**Key Differences from useImageGeneration**:
- Polling mechanism with configurable interval
- Elapsed time tracking
- Estimated completion time
- Cancellation support

**Hook Interface**:
```typescript
interface UseVideoGenerationOptions {
  pollInterval?: number;  // Default 5000ms (5s)
  onComplete?: (result: VideoGenerationResult) => void;
  onError?: (error: string) => void;
  onProgress?: (elapsedTime: number) => void;
}

interface VideoGenerationResult {
  videoPath: string | null;
  videoUrl: string | null;
  predictionId: string | null;
  elapsedTime: number;
  duration: number;  // Video duration (4, 6, or 8)
}

interface UseVideoGenerationReturn {
  startGeneration: (prompt: string, options?: VideoGenerationOptions) => Promise<string | null>;
  cancelGeneration: () => void;
  isGenerating: boolean;
  status: "idle" | "starting" | "processing" | "succeeded" | "failed";
  elapsedTime: number;
  estimatedTime: number;
  result: VideoGenerationResult | null;
  error: string | null;
  reset: () => void;
}
```

**Polling Logic**:
```typescript
// Start generation
const predictionId = await startGeneration(prompt, options);

// Polling loop (in useEffect)
useEffect(() => {
  if (!predictionId || !isGenerating) return;

  const interval = setInterval(async () => {
    const response = await fetch(`/api/generate-ai-video?id=${predictionId}`);
    const data = await response.json();

    setElapsedTime(data.elapsedTime);

    if (data.status === "succeeded") {
      setResult({ videoPath: data.videoPath, ... });
      setIsGenerating(false);
      onComplete?.(result);
    } else if (data.status === "failed") {
      setError(data.error);
      setIsGenerating(false);
      onError?.(data.error);
    }
  }, pollInterval);

  return () => clearInterval(interval);
}, [predictionId, isGenerating]);
```

---

### Step 7.4: Create Video Generation Modal Component

**File**: `components/sandbox/VideoGenerationModal.tsx`

**Features**:
- Text input for prompt
- Duration selector (4s, 6s, 8s) with intelligent suggestion based on prompt
- Aspect ratio selector (16:9, 9:16, 1:1)
- Optional: Starting frame image URL input
- Progress indicator with elapsed/estimated time
- Cancel button during generation
- Preview of generated video
- "Add to Assets" button

**UI Elements**:
```
┌────────────────────────────────────────────────┐
│  Generate Video               [X]              │
│  Powered by Veo 3.1 Fast                       │
├────────────────────────────────────────────────┤
│                                                │
│  Prompt                                        │
│  ┌──────────────────────────────────────────┐ │
│  │ Developer explaining code...              │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Duration        Aspect Ratio                  │
│  [4s] [6s] [8s]  [16:9] [9:16] [1:1]          │
│                                                │
│  Starting Frame (optional)                     │
│  ┌──────────────────────────────────────────┐ │
│  │ https://...                               │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │   [=====>          ] 45s / ~90s           │ │
│  │   Processing video...                     │ │
│  │                    [Cancel]               │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  OR (when complete):                           │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │   [VIDEO PLAYER PREVIEW]                  │ │
│  │   ▶ 0:00 / 0:06                          │ │
│  └──────────────────────────────────────────┘ │
│  Generated in 87s                              │
│                                                │
│  [Add to Assets]           [Download]          │
│                                                │
│  [Generate Another]                            │
└────────────────────────────────────────────────┘
```

**Duration Suggestion Logic**:
```typescript
function suggestDuration(prompt: string): 4 | 6 | 8 {
  // Count words in quoted dialogue
  const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
  const quotedText = quotedMatch?.[1] || quotedMatch?.[2] || "";
  const wordCount = quotedText.split(/\s+/).filter(Boolean).length ||
                    prompt.split(/\s+/).filter(Boolean).length;

  // ~2 words per second natural speaking pace
  if (wordCount <= 8) return 4;
  if (wordCount <= 16) return 6;
  return 8;
}
```

---

### Step 7.5: Integrate into Sandbox Page

**File**: `app/sandbox/page.tsx`

**Changes**:
1. Import `VideoIcon` from lucide-react
2. Import `VideoGenerationModal` component
3. Add state: `const [showVideoModal, setShowVideoModal] = useState(false)`
4. Add "Generate Video" button in header (next to Generate Image)
5. Render `VideoGenerationModal`
6. Handle adding generated video to project assets

**Button Placement**: In header actions, after "Generate Image" button

---

### Step 7.6: Ensure Video Support in DynamicPreview

**File**: `src/compositions/dynamic-preview/DynamicPreview.tsx`

**Verification**: The DynamicPreview already supports video scenes:
```typescript
case "video":
  if (scene.assets?.[0]) {
    const videoPath = scene.assets[0].startsWith("assets/")
      ? scene.assets[0]
      : `assets/videos/${scene.assets[0]}`;
    return (
      <Video
        src={staticFile(videoPath)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
```

**No changes needed** - already supports video assets.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/replicate.ts` | MODIFY | Add Veo constants and functions |
| `app/api/generate-ai-video/route.ts` | CREATE | POST to start, GET to poll |
| `hooks/useVideoGeneration.ts` | CREATE | Hook with polling logic |
| `components/sandbox/VideoGenerationModal.tsx` | CREATE | UI modal with progress |
| `app/sandbox/page.tsx` | MODIFY | Add button and modal |

---

## API Details

### Veo 3.1 Fast via Replicate

**Model**: `google/veo-3.1-fast`

**Create Prediction (No Wait)**:
```bash
POST https://api.replicate.com/v1/predictions
Headers:
  Authorization: Bearer $REPLICATE_API_TOKEN
  Content-Type: application/json
  # NO Prefer header - don't wait

Body:
{
  "version": "google/veo-3.1-fast",
  "input": {
    "prompt": "user prompt here",
    "aspect_ratio": "16:9",
    "duration": 6,
    "resolution": "1080p",
    "generate_audio": true,
    "image": "https://..." (optional starting frame)
  }
}
```

**Response** (immediate):
```json
{
  "id": "xyz123",
  "status": "starting",
  "created_at": "2026-01-24T..."
}
```

**Get Prediction (Polling)**:
```bash
GET https://api.replicate.com/v1/predictions/{id}
Headers:
  Authorization: Bearer $REPLICATE_API_TOKEN
```

**Response** (when complete):
```json
{
  "id": "xyz123",
  "status": "succeeded",
  "output": "https://replicate.delivery/...video.mp4",
  "metrics": {
    "predict_time": 87.5
  }
}
```

---

## Polling Strategy

```
1. Start generation → get predictionId
2. Wait 10 seconds (initial delay)
3. Poll every 5 seconds:
   - Check status
   - Update elapsed time
   - If "succeeded" → download & return
   - If "failed" → show error
   - If still processing → continue polling
4. Show progress: "45s / ~90s estimated"
5. Timeout after 180 seconds (3 minutes) with error
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| No API key | Return clear error message |
| Invalid prompt | Validate on client and server |
| Generation timeout (>180s) | Show timeout error, suggest retry |
| Generation failed | Show Replicate error message |
| Download failed | Return CDN URL as fallback |
| Content blocked | Show safety filter message |
| User cancels | Stop polling, cleanup state |

---

## Testing Checklist

- [ ] Generate 4-second video
- [ ] Generate 6-second video
- [ ] Generate 8-second video
- [ ] Generate with 9:16 aspect ratio (vertical)
- [ ] Generate with starting frame image
- [ ] Progress updates show correctly
- [ ] Cancel generation works
- [ ] Error handling when no API key
- [ ] Error handling for failed generation
- [ ] Video downloads correctly to public/assets
- [ ] Generated video plays in modal preview
- [ ] Generated video can be used in video composition
- [ ] TypeScript compiles with no errors

---

## Integration Points

### With Feature 6 (Image Generation):
- Share `lib/replicate.ts` infrastructure
- Reuse `getPrediction()` function
- Similar modal UI pattern

### With Feature 4 (Render):
- Generated videos saved to `public/assets/videos/generated/`
- Can be referenced in scene assets
- Render API already handles staticFile() for local assets

### With Feature 3 (Player):
- DynamicPreview already supports `video` scene type
- Video component uses staticFile() for local paths

---

## User Flow

```
1. User is in sandbox with storyboard
2. Clicks "Generate Video" button in header
3. Modal opens
4. User enters prompt: "Developer says 'Hello world'"
5. Duration auto-suggested: 4s (short phrase)
6. User can adjust duration or aspect ratio
7. Clicks "Generate"
8. Progress bar shows: "Processing... 45s / ~90s"
9. User can cancel anytime
10. When complete, video plays in modal
11. User clicks "Add to Assets"
12. Video is available in project assets
```

---

## Cost Estimation

- Veo 3.1 Fast: ~$0.10-0.20 per video (varies by duration)
- 4s videos are cheaper than 8s
- Still very cost-effective for prototyping

---

## Key Differences from Feature 6 (Image)

| Aspect | Image (Feature 6) | Video (Feature 7) |
|--------|------------------|-------------------|
| Generation time | ~10-30 seconds | ~90-120 seconds |
| Wait strategy | `Prefer: wait` | Polling |
| Duration options | N/A | 4, 6, 8 seconds |
| Has audio | No | Yes (auto-generated) |
| Starting frame | N/A | Optional |
| Output format | PNG/JPEG | MP4 |
| File location | `images/generated/` | `videos/generated/` |

---

## Dependencies

- Feature 6: Image Generation (for shared Replicate infrastructure)
- Feature 3: Live Remotion Player (for video preview in composition)
- Feature 4: Render Trigger (for including videos in final render)

---

**Plan Status**: Ready for implementation
**Confidence Level**: 100%
**Estimated Implementation Time**: 2-3 hours

---

## Verification Before Implementation

Before building, confirm:
1. [x] Feature 6 compiles and works correctly
2. [x] Replicate client has getPrediction() for polling
3. [x] DynamicPreview supports video scene type
4. [x] API endpoint name avoids collision (generate-ai-video vs generate-video)
5. [x] Polling strategy matches Replicate best practices
6. [x] UI pattern matches Feature 6 modal
7. [x] File paths for generated videos are defined
8. [x] Hook pattern supports polling with cleanup
