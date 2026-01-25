# Feature 6: Image Generation (Replicate) - Implementation Plan

**Created**: January 24, 2026
**Status**: Planning
**Dependencies**: Feature 3 (Live Remotion Player), Feature 4 (Render Trigger)

---

## Overview

Add AI image generation capability using Replicate's Nano Banana Pro model. Users can generate images from text prompts directly in the sandbox, and these images can be used as assets in video compositions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sandbox Page                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  "Generate Image" Button  →  Opens Image Generation Modal   ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  useImageGeneration Hook                                     ││
│  │  - prompt, aspectRatio, resolution state                     ││
│  │  - generateImage() function                                  ││
│  │  - isGenerating, progress, result, error                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  POST /api/generate-image                                    ││
│  │  - Calls Replicate API                                       ││
│  │  - Downloads image to public/assets/images/                  ││
│  │  - Returns local path                                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  lib/replicate.ts                                            ││
│  │  - createPrediction()                                        ││
│  │  - getPrediction()                                           ││
│  │  - downloadImage()                                           ││
│  │  - isConfigured()                                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 6.1: Create Replicate API Client (`lib/replicate.ts`)

**Purpose**: Abstraction layer for Replicate API calls

**File**: `lib/replicate.ts`

**Key Functions**:
```typescript
// Check if Replicate is configured
export function isConfigured(): boolean

// Create a prediction (start image generation)
export async function createPrediction(options: PredictionOptions): Promise<Prediction>

// Get prediction status (for polling)
export async function getPrediction(predictionId: string): Promise<Prediction>

// Download image from URL to local filesystem
export async function downloadImage(url: string, filename: string): Promise<string>

// Constants
export const NANO_BANANA_PRO_VERSION = "944891d151f5463d9e6eca5a6942f04053e664853dca30c21864021b046fea1d"
export const DEFAULT_ASPECT_RATIO = "16:9"
export const DEFAULT_RESOLUTION = "2K"
```

**Types**:
```typescript
interface PredictionOptions {
  prompt: string;
  aspectRatio?: "16:9" | "1:1" | "9:16" | "4:3" | "3:4";
  resolution?: "2K" | "4K" | "8K";
  outputFormat?: "png" | "jpeg";
}

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[];
  error?: string;
}
```

---

### Step 6.2: Create Image Generation API Endpoint (`app/api/generate-image/route.ts`)

**Purpose**: Server-side endpoint for image generation

**Endpoints**:
- `POST /api/generate-image` - Generate an image from prompt

**Request**:
```typescript
interface GenerateImageRequest {
  prompt: string;
  aspectRatio?: "16:9" | "1:1" | "9:16" | "4:3" | "3:4";
  resolution?: "2K" | "4K" | "8K";
  filename?: string; // Optional custom filename
}
```

**Response**:
```typescript
interface GenerateImageResponse {
  success: boolean;
  imagePath?: string;      // Local path: assets/images/generated/{filename}.png
  imageUrl?: string;       // Original Replicate CDN URL
  predictionId?: string;
  error?: string;
}
```

**Flow**:
1. Validate request (prompt required)
2. Check if Replicate API is configured
3. Call `createPrediction()` with `Prefer: wait` header
4. Download image to `public/assets/images/generated/`
5. Return local path

---

### Step 6.3: Create Image Generation Hook (`hooks/useImageGeneration.ts`)

**Purpose**: React hook for managing image generation state

**Hook Interface**:
```typescript
interface UseImageGenerationOptions {
  onComplete?: (imagePath: string) => void;
  onError?: (error: string) => void;
}

interface UseImageGenerationReturn {
  generateImage: (prompt: string, options?: ImageOptions) => Promise<string | null>;
  isGenerating: boolean;
  progress: number;
  result: string | null;  // Local image path
  error: string | null;
}
```

**State Management**:
- Track generation status
- Handle errors gracefully
- Provide result path for use in compositions

---

### Step 6.4: Create Image Generation Modal Component

**Purpose**: UI for entering prompts and generating images

**File**: `components/sandbox/ImageGenerationModal.tsx`

**Features**:
- Text input for prompt
- Aspect ratio selector (16:9, 1:1, 9:16, 4:3, 3:4)
- Resolution selector (2K, 4K, 8K)
- Generate button with loading state
- Preview of generated image
- "Use in Video" button to add to assets

**UI Flow**:
1. User clicks "Generate Image" button in sandbox header
2. Modal opens with prompt input
3. User enters prompt, selects options
4. Clicks "Generate"
5. Loading state shows progress
6. Image appears in preview
7. User can download or add to project assets

---

### Step 6.5: Integrate into Sandbox Page

**File**: `app/sandbox/page.tsx`

**Changes**:
1. Add Image icon import from lucide-react
2. Add modal state: `const [showImageModal, setShowImageModal] = useState(false)`
3. Add "Generate Image" button in header actions
4. Import and render ImageGenerationModal
5. Handle adding generated image to project assets

**Button Placement**: Next to "Generate Voiceovers" button

---

### Step 6.6: Update Scene Interface for Generated Images

**File**: `src/compositions/dynamic-preview/DynamicPreview.tsx`

**Change**: Ensure Scene interface supports generated images:
```typescript
export interface Scene {
  // ... existing fields
  assets?: string[];  // Can include generated image paths
}
```

**Note**: This is already supported - the `image` scene type uses `assets[0]` for the image path.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/replicate.ts` | CREATE | Replicate API client |
| `app/api/generate-image/route.ts` | CREATE | Image generation endpoint |
| `hooks/useImageGeneration.ts` | CREATE | React hook for generation |
| `components/sandbox/ImageGenerationModal.tsx` | CREATE | Generation UI modal |
| `app/sandbox/page.tsx` | MODIFY | Add button and modal |
| `.env.example` | MODIFY | Document REPLICATE_API_TOKEN |

---

## API Details

### Replicate API

**Model**: `google/nano-banana-pro`
**Version**: `944891d151f5463d9e6eca5a6942f04053e664853dca30c21864021b046fea1d`

**Create Prediction Request**:
```bash
POST https://api.replicate.com/v1/predictions
Headers:
  Authorization: Bearer $REPLICATE_API_TOKEN
  Content-Type: application/json
  Prefer: wait  # Wait for completion (up to 60s)

Body:
{
  "version": "google/nano-banana-pro:944891d15...",
  "input": {
    "prompt": "user prompt here",
    "aspect_ratio": "16:9",
    "resolution": "2K",
    "output_format": "png",
    "safety_filter_level": "block_only_high"
  }
}
```

**Response** (when `Prefer: wait`):
```json
{
  "id": "xyz123",
  "status": "succeeded",
  "output": ["https://replicate.delivery/...image.png"]
}
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| No API key | Return clear error message |
| Invalid prompt | Validate on client and server |
| Generation timeout | Show retry option |
| Download failed | Return CDN URL as fallback |
| Content blocked | Show safety filter message |

---

## Testing Checklist

- [ ] Generate image with default settings
- [ ] Generate image with 9:16 aspect ratio (for vertical videos)
- [ ] Generate image with 4K resolution
- [ ] Error handling when no API key
- [ ] Error handling for invalid prompts
- [ ] Image downloads correctly to public/assets
- [ ] Generated image displays in modal preview
- [ ] Generated image can be used in video composition
- [ ] TypeScript compiles with no errors

---

## Integration Points

### With Feature 4 (Render):
- Generated images saved to `public/assets/images/generated/`
- Can be referenced in scene assets: `assets/images/generated/{filename}.png`
- Render API already handles staticFile() for local assets

### With Feature 3 (Player):
- DynamicPreview already supports `image` scene type
- Img component uses staticFile() for local paths

### With Feature 5 (Voiceover):
- Independent feature - no direct integration needed
- Both can be used together in same video

---

## User Flow

```
1. User is in sandbox with storyboard generated
2. Clicks "Generate Image" button in header
3. Modal opens
4. User enters prompt: "A futuristic city at sunset, neon lights"
5. Selects aspect ratio: 9:16 (for vertical video)
6. Clicks "Generate"
7. Loading spinner shows "Generating image..."
8. Image appears in modal preview
9. User clicks "Add to Assets" or "Download"
10. Image is available in project assets list
11. User can reference image in video composition
```

---

## Environment Variables

```bash
# Add to .env
REPLICATE_API_TOKEN=your-replicate-token-here
```

**Where to get**: https://replicate.com/account/api-tokens

---

## Cost Estimation

- Nano Banana Pro: ~$0.004 per image (varies by resolution)
- 4K images cost more than 2K
- Very cost-effective for prototyping

---

## Future Enhancements (Not in Scope)

- Image-to-image editing
- Multiple image generation in batch
- Image gallery view for project
- AI-suggested prompts based on storyboard
- Integration with video scene generation

---

## Dependencies

- Feature 3: Live Remotion Player (for previewing images in composition)
- Feature 4: Render Trigger (for including images in final render)

---

**Plan Status**: Ready for implementation
**Confidence Level**: 100%
**Estimated Implementation Time**: 2-3 hours

---

## Verification Before Implementation

Before building, confirm:
1. [x] Feature 5 compiles correctly (verified above)
2. [x] Replicate model version is correct
3. [x] API endpoint pattern matches ElevenLabs pattern
4. [x] Hook pattern matches useVoiceoverGeneration
5. [x] UI integration location is clear
6. [x] File paths for generated images are defined
