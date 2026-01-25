# Stan Video Generator - Implementation Plan

**Created**: January 24, 2026
**Goal**: Transform the current basic video editor into an AI-powered video generation platform (like "Remotion MCP as a Service")

---

## Executive Summary

### Current State
The template provides Remotion components and MCP configurations designed for **Claude Code CLI** usage. The web app built on top (Phases 1-5) is a basic video editor with upload/transcribe/chat/preview.

### Target State
A web-based platform (inspired by Argus App) where users can:
1. Upload assets via a beautiful landing page
2. Enter a prompt describing their desired video
3. AI plans a storyboard and generates Remotion code
4. System integrates 11Labs audio and Replicate images
5. Preview in a sandbox with chat-based refinement
6. Export final rendered video

### The Core Challenge
**Replicate what Claude Code does** (orchestrating MCP tools, generating code, iterating on output) **but via a web API** that end-users can access through a browser.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB APPLICATION                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │   Landing Page   │───▶│  Asset Gallery   │───▶│  Generation Page │   │
│  │                  │    │                  │    │   (Sandbox)      │   │
│  │  - Hero section  │    │  - Upload zone   │    │  - Chat sidebar  │   │
│  │  - Features      │    │  - Asset preview │    │  - Video preview │   │
│  │  - CTA           │    │  - Theme config  │    │  - File browser  │   │
│  └──────────────────┘    │  - Prompt input  │    │  - Export        │   │
│                          └──────────────────┘    └──────────────────┘   │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         ORCHESTRATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    /api/generate-video                           │    │
│  │                                                                   │    │
│  │  1. Parse user prompt + assets                                   │    │
│  │  2. Create "Asset Gallery" context for AI                        │    │
│  │  3. Call Claude → Generate storyboard plan                       │    │
│  │  4. Call Claude → Generate Remotion composition code             │    │
│  │  5. Call 11Labs API → Generate voiceover/SFX/music              │    │
│  │  6. Call Replicate API → Generate images (if needed)            │    │
│  │  7. Write composition to dynamic folder                          │    │
│  │  8. Trigger Remotion render                                      │    │
│  │  9. Return video URL + preview                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         EXTERNAL SERVICES                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │  Claude    │  │  11Labs    │  │  Replicate │  │  Remotion      │    │
│  │  API       │  │  API       │  │  API       │  │  Renderer      │    │
│  │            │  │            │  │            │  │                │    │
│  │ Storyboard │  │ Voice      │  │ Images     │  │ Server-side    │    │
│  │ Code Gen   │  │ SFX        │  │ Videos     │  │ video render   │    │
│  │ Refinement │  │ Music      │  │            │  │                │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Landing Page & Asset Upload (UI Foundation)
**Estimated Time**: 4-6 hours
**Priority**: HIGH

#### 1.1 Landing Page (`app/page.tsx`)
Inspired by Argus App's beautiful landing page.

**Components to Create:**
```
components/
├── landing/
│   ├── HeroSection.tsx        # Main hero with animated background
│   ├── FeatureCards.tsx       # Showcase capabilities
│   ├── HowItWorks.tsx         # Step-by-step visual guide
│   └── CTAButton.tsx          # "Start Creating" button
```

**Design Specs:**
- Dark theme with gradient accents (purple/blue like Remotion brand)
- Animated background (particles or gradient mesh)
- Hero text: "Create Viral Videos with AI"
- Subtext: "Upload your assets, describe your vision, get a professional video"
- Feature cards: "AI Storyboarding", "11Labs Audio", "One-Click Export"

#### 1.2 Asset Upload Page (`app/upload/page.tsx`)

**Components to Create:**
```
components/
├── upload/
│   ├── AssetUploadZone.tsx    # Multi-file drag-drop
│   ├── AssetGallery.tsx       # Grid display of uploaded assets
│   ├── AssetCard.tsx          # Individual asset with preview
│   ├── ThemeConfig.tsx        # Colors, fonts, style selection
│   ├── PromptInput.tsx        # Main video description input
│   └── GenerateButton.tsx     # "Generate Video" CTA
```

**Asset Types Supported:**
| Type | Extensions | Preview |
|------|------------|---------|
| Images | .png, .jpg, .svg, .webp | Thumbnail |
| Videos | .mp4, .mov, .webm | First frame |
| Audio | .mp3, .wav | Waveform |
| Logos | .svg, .png | Thumbnail |
| Documents | .pdf, .txt | Icon + name |

**Theme Configuration:**
```typescript
interface ThemeConfig {
  primaryColor: string;      // Brand color
  secondaryColor: string;    // Accent color
  backgroundColor: string;   // Video background
  fontFamily: string;        // Text font
  style: 'modern' | 'minimal' | 'bold' | 'playful' | 'corporate';
}
```

#### 1.3 Storage System (`lib/asset-storage.ts`)

Extend existing IndexedDB storage for assets:

```typescript
interface UploadedAsset {
  id: string;
  type: 'image' | 'video' | 'audio' | 'logo' | 'document';
  file: File;
  name: string;
  size: number;
  mimeType: string;
  thumbnail: string | null;    // Base64 preview
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    transcript?: string;       // For audio/video
  };
  createdAt: number;
}

interface ProjectConfig {
  id: string;
  assets: UploadedAsset[];
  theme: ThemeConfig;
  prompt: string;
  createdAt: number;
}
```

---

### Phase 2: Asset Gallery Context System
**Estimated Time**: 3-4 hours
**Priority**: HIGH

The "secret sauce" from the Remotion MCP workflow - creating a visual context that AI can understand.

#### 2.1 Asset Gallery Generator (`lib/asset-gallery.ts`)

```typescript
// Generate HTML gallery of all assets with filenames
async function generateAssetGalleryHTML(assets: UploadedAsset[]): Promise<string> {
  // Creates an HTML page showing all assets with their paths
  // This gets screenshotted and sent to Claude for visual context
}

// Generate text description of assets for AI context
function generateAssetManifest(assets: UploadedAsset[]): string {
  // Returns structured text like:
  // "Asset 1: logo.svg (SVG logo, 200x50px)
  //  Asset 2: product-shot.png (Product image, 1920x1080px)
  //  Asset 3: background-music.mp3 (Audio, 2:30 duration)"
}
```

#### 2.2 Asset Processing Pipeline (`lib/asset-processor.ts`)

```typescript
// Process uploaded assets for AI consumption
async function processAssets(assets: UploadedAsset[]) {
  return {
    manifest: generateAssetManifest(assets),
    galleryHTML: await generateAssetGalleryHTML(assets),
    galleryScreenshot: await captureGalleryScreenshot(galleryHTML),
    publicPaths: await copyAssetsToPublic(assets),
  };
}
```

---

### Phase 3: AI Orchestration Engine
**Estimated Time**: 8-10 hours
**Priority**: CRITICAL

This is the core - replicating what Claude Code does but via API.

#### 3.1 Storyboard Generator (`app/api/generate-storyboard/route.ts`)

```typescript
// POST /api/generate-storyboard
// Input: { prompt, assets, theme }
// Output: { storyboard: Scene[], estimatedDuration }

interface Scene {
  id: string;
  order: number;
  type: 'title' | 'content' | 'video' | 'image' | 'transition';
  duration: number;           // seconds
  description: string;
  assets: string[];           // Asset IDs used
  text?: string;              // Any text to display
  voiceover?: string;         // Script for this scene
  animation?: string;         // Animation type
  music?: {
    type: 'background' | 'sfx';
    description: string;
  };
}
```

**Claude System Prompt for Storyboarding:**
```
You are a professional video director creating viral short-form content.

Given the user's assets and description, create a scene-by-scene storyboard.

Rules:
1. Hook within first 3 seconds
2. Fast cuts (2-4 seconds per scene for short-form)
3. Use all provided assets strategically
4. Include voiceover scripts for each scene
5. Suggest music/SFX at key moments
6. End with clear CTA

Output format: JSON array of Scene objects
```

#### 3.2 Code Generator (`app/api/generate-composition/route.ts`)

```typescript
// POST /api/generate-composition
// Input: { storyboard, assets, theme }
// Output: { compositionCode, audioRequests, imageRequests }

interface GenerationResult {
  compositionCode: string;    // Full Remotion composition React code
  compositionConfig: {
    name: string;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
  };
  audioRequests: AudioRequest[];   // 11Labs requests needed
  imageRequests: ImageRequest[];   // Replicate requests needed
}
```

**Claude System Prompt for Code Generation:**
```
You are an expert Remotion developer. Generate React code for video compositions.

Available components (import from '../../components/'):
- TitleSlide: { title, className }
- ContentSlide: { header, content, className }
- VideoSlide: { filename, startTime }
- Logo: { src, position, size }
- Caption: { transcript, className }
- Music: { src, volume, fadeInSeconds, fadeOutSeconds }
- Screenshot: { src, scrollSpeed }

Use these patterns:
- <Series> for sequential scenes
- <Sequence from={frame}> for timed elements
- <TransitionSeries> with fade() for transitions
- secondsToFrames(seconds) for timing
- staticFile('path') for assets in public/

Output: Complete TypeScript React component code
```

#### 3.3 11Labs Integration (`app/api/generate-audio/route.ts`)

```typescript
// POST /api/generate-audio
// Input: { requests: AudioRequest[] }
// Output: { audioFiles: GeneratedAudio[] }

interface AudioRequest {
  id: string;
  type: 'voiceover' | 'sfx' | 'music';
  text?: string;              // For voiceover
  description?: string;       // For SFX/music
  voice?: string;             // Voice ID for voiceover
  duration?: number;          // Target duration
}

interface GeneratedAudio {
  id: string;
  requestId: string;
  path: string;               // Path in public/audio/
  duration: number;
}
```

**Implementation:**
```typescript
import ElevenLabs from 'elevenlabs';

const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });

async function generateVoiceover(text: string, voiceId: string): Promise<Buffer> {
  const audio = await elevenlabs.textToSpeech(voiceId, { text });
  return audio;
}

async function generateSFX(description: string): Promise<Buffer> {
  const audio = await elevenlabs.soundEffects.generate({ text: description });
  return audio;
}

async function generateMusic(description: string, duration: number): Promise<Buffer> {
  // Use 11Labs music generation or fallback to stock
}
```

#### 3.4 Image Generation (`app/api/generate-images/route.ts`)

```typescript
// POST /api/generate-images
// Input: { requests: ImageRequest[] }
// Output: { images: GeneratedImage[] }

interface ImageRequest {
  id: string;
  prompt: string;
  style?: string;
  width: number;
  height: number;
}
```

**Implementation using Replicate:**
```typescript
import Replicate from 'replicate';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function generateImage(prompt: string, width: number, height: number) {
  const output = await replicate.run(
    "google/nano-banana-pro",  // Or other model
    { input: { prompt, width, height } }
  );
  return output;
}
```

#### 3.5 Master Orchestration (`app/api/generate-video/route.ts`)

The main endpoint that coordinates everything:

```typescript
// POST /api/generate-video
// Input: { projectId }
// Output: SSE stream of progress updates

export async function POST(request: Request) {
  const { projectId } = await request.json();

  // 1. Load project config and assets
  const project = await loadProject(projectId);

  // 2. Process assets for AI context
  const assetContext = await processAssets(project.assets);

  // 3. Generate storyboard (Claude)
  yield { status: 'planning', message: 'Creating storyboard...' };
  const storyboard = await generateStoryboard(project.prompt, assetContext, project.theme);

  // 4. Generate composition code (Claude)
  yield { status: 'coding', message: 'Writing video code...' };
  const { compositionCode, audioRequests, imageRequests } =
    await generateComposition(storyboard, assetContext, project.theme);

  // 5. Generate audio assets (11Labs) - parallel
  yield { status: 'audio', message: 'Generating audio...' };
  const audioFiles = await generateAudio(audioRequests);

  // 6. Generate images (Replicate) - parallel
  yield { status: 'images', message: 'Generating images...' };
  const images = await generateImages(imageRequests);

  // 7. Write composition to disk
  yield { status: 'building', message: 'Building composition...' };
  await writeComposition(projectId, compositionCode, audioFiles, images);

  // 8. Generate preview (fast render)
  yield { status: 'preview', message: 'Generating preview...' };
  const previewUrl = await renderPreview(projectId);

  // 9. Return result
  yield {
    status: 'complete',
    previewUrl,
    compositionId: projectId,
  };
}
```

---

### Phase 4: Generation/Sandbox Page
**Estimated Time**: 6-8 hours
**Priority**: HIGH

Inspired by Argus App's generation page - split view with chat and preview.

#### 4.1 Page Layout (`app/generate/[projectId]/page.tsx`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Project Name | Status | Export Button                   │
├───────────────────────────┬─────────────────────────────────────┤
│                           │                                      │
│     Chat Sidebar          │        Video Preview                 │
│     (40% width)           │        (60% width)                   │
│                           │                                      │
│  ┌─────────────────────┐  │  ┌─────────────────────────────────┐│
│  │ Storyboard Plan     │  │  │                                 ││
│  │ (collapsible)       │  │  │    Remotion Player              ││
│  └─────────────────────┘  │  │    or                           ││
│                           │  │    Video Preview                ││
│  ┌─────────────────────┐  │  │                                 ││
│  │ Chat Messages       │  │  │                                 ││
│  │ - AI responses      │  │  └─────────────────────────────────┘│
│  │ - User requests     │  │                                      │
│  │ - Progress updates  │  │  ┌─────────────────────────────────┐│
│  └─────────────────────┘  │  │ Timeline / Scene Navigator      ││
│                           │  └─────────────────────────────────┘│
│  ┌─────────────────────┐  │                                      │
│  │ Refinement Input    │  │  ┌─────────────────────────────────┐│
│  │ "Make it faster..." │  │  │ Asset Panel (collapsible)       ││
│  └─────────────────────┘  │  └─────────────────────────────────┘│
│                           │                                      │
└───────────────────────────┴─────────────────────────────────────┘
```

#### 4.2 Components

```
components/
├── generation/
│   ├── GenerationLayout.tsx      # Main split layout
│   ├── ChatSidebar.tsx           # Left panel
│   │   ├── StoryboardView.tsx    # Collapsible storyboard
│   │   ├── ChatMessages.tsx      # Message list
│   │   ├── ProgressIndicator.tsx # Generation progress
│   │   └── RefinementInput.tsx   # User refinement input
│   ├── PreviewPanel.tsx          # Right panel
│   │   ├── VideoPlayer.tsx       # Remotion player or HTML5
│   │   ├── SceneNavigator.tsx    # Timeline/scene selector
│   │   └── AssetPanel.tsx        # View/manage assets
│   └── ExportModal.tsx           # Export options
```

#### 4.3 Chat-Based Refinement

Users can refine the video through natural language:

```typescript
// Example refinements
"Make the intro faster"
"Change the music to something more upbeat"
"Add a zoom effect on the product shot"
"Replace the voiceover with a female voice"
"Add subtitles to all scenes"
```

**Refinement API (`app/api/refine-video/route.ts`):**
```typescript
// Takes current composition + user request
// Claude analyzes and generates updated code
// Patches only the affected parts
```

---

### Phase 5: Rendering Pipeline
**Estimated Time**: 4-6 hours
**Priority**: HIGH

#### 5.1 Dynamic Composition Loader

```typescript
// src/compositions/dynamic/[projectId]/index.tsx
// Dynamically loads generated compositions

import { getCompositionCode } from '@/lib/composition-loader';

export const DynamicComposition = ({ projectId }) => {
  const CompositionComponent = useMemo(() => {
    return loadComposition(projectId);
  }, [projectId]);

  return <CompositionComponent />;
};
```

#### 5.2 Server-Side Rendering (`app/api/render/route.ts`)

```typescript
import { bundle } from '@remotion/bundler';
import { renderMedia } from '@remotion/renderer';

export async function POST(request: Request) {
  const { projectId, format, quality } = await request.json();

  // Bundle the composition
  const bundled = await bundle({
    entryPoint: './src/index.ts',
    webpackOverride: (config) => config,
  });

  // Render
  const outputPath = `./public/outputs/${projectId}.mp4`;
  await renderMedia({
    composition: projectId,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
  });

  return { url: `/outputs/${projectId}.mp4` };
}
```

#### 5.3 Export Options

| Format | Quality | Use Case |
|--------|---------|----------|
| Preview | 720p, fast | Quick review |
| Standard | 1080p | Social media |
| High | 4K | Professional |
| GIF | 480p | Thumbnails |

---

### Phase 6: Polish & UX Enhancements
**Estimated Time**: 4-6 hours
**Priority**: MEDIUM

#### 6.1 Loading States & Progress

```typescript
interface GenerationProgress {
  stage: 'planning' | 'coding' | 'audio' | 'images' | 'building' | 'preview' | 'complete';
  progress: number;           // 0-100
  message: string;
  substeps?: {
    name: string;
    status: 'pending' | 'active' | 'complete';
  }[];
}
```

#### 6.2 Error Handling & Recovery

- Retry failed API calls with exponential backoff
- Partial generation recovery (save intermediate state)
- User-friendly error messages
- Fallback options (e.g., stock music if 11Labs fails)

#### 6.3 Project Management

- Save/load projects
- Version history
- Duplicate project
- Share project link

---

## API Keys Required

| Service | Environment Variable | Purpose | Cost |
|---------|---------------------|---------|------|
| Anthropic | `ANTHROPIC_API_KEY` | Storyboard + code generation | ~$3-15/M tokens |
| OpenAI | `OPENAI_API_KEY` | Transcription (Whisper) | ~$0.006/min |
| ElevenLabs | `ELEVENLABS_API_KEY` | Voice, SFX, music | ~$0.30/1K chars |
| Replicate | `REPLICATE_API_TOKEN` | Image/video generation | ~$0.01-0.10/image |
| Deepgram | `DEEPGRAM_API_KEY` | Alternative transcription | ~$0.0043/min |

---

## File Structure (Final)

```
claude-remotion-kickstart/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── upload/
│   │   └── page.tsx                # Asset upload page
│   ├── generate/
│   │   └── [projectId]/
│   │       └── page.tsx            # Generation/sandbox page
│   ├── api/
│   │   ├── generate-storyboard/    # AI storyboard generation
│   │   ├── generate-composition/   # AI code generation
│   │   ├── generate-audio/         # 11Labs integration
│   │   ├── generate-images/        # Replicate integration
│   │   ├── generate-video/         # Master orchestration
│   │   ├── refine-video/           # Chat-based refinement
│   │   ├── render/                 # Remotion rendering
│   │   ├── transcribe/             # Audio transcription (existing)
│   │   └── chat/                   # General chat (existing)
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── landing/                    # Landing page components
│   ├── upload/                     # Asset upload components
│   ├── generation/                 # Generation page components
│   ├── shared/                     # Shared UI components
│   └── ... (existing components)
│
├── lib/
│   ├── asset-storage.ts            # Asset management
│   ├── asset-gallery.ts            # AI context generation
│   ├── asset-processor.ts          # Asset processing
│   ├── orchestrator.ts             # Generation orchestration
│   ├── elevenlabs.ts               # 11Labs client
│   ├── replicate.ts                # Replicate client
│   ├── composition-loader.ts       # Dynamic composition loading
│   ├── storage.ts                  # (existing)
│   ├── types.ts                    # (existing + extensions)
│   └── video-utils.ts              # (existing)
│
├── src/
│   ├── compositions/
│   │   ├── dynamic/                # Generated compositions folder
│   │   └── ... (existing)
│   ├── components/                 # (existing Remotion components)
│   └── ... (existing Remotion setup)
│
├── public/
│   ├── assets/                     # User uploaded assets
│   ├── audio/                      # Generated audio files
│   ├── outputs/                    # Rendered videos
│   └── ... (existing)
│
└── ... (config files)
```

---

## Implementation Order

### Week 1: Foundation
1. **Day 1-2**: Landing page + Asset upload UI
2. **Day 2-3**: Asset storage + processing system
3. **Day 3-4**: Asset gallery context generator

### Week 2: AI Core
4. **Day 1-2**: Storyboard generation API
5. **Day 2-3**: Composition code generation API
6. **Day 3-4**: 11Labs + Replicate integration

### Week 3: Preview & Polish
7. **Day 1-2**: Generation page (sandbox UI)
8. **Day 2-3**: Rendering pipeline
9. **Day 3-4**: Chat refinement + polish

---

## Quick Start (After Implementation)

```bash
# 1. Set up environment variables
cp .env.example .env.local
# Add: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, REPLICATE_API_TOKEN

# 2. Install dependencies
pnpm install

# 3. Start development server
pnpm dev

# 4. Open http://localhost:3000
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first video | < 5 minutes |
| Generation success rate | > 90% |
| User refinement iterations | Avg < 3 |
| Export time (30s video) | < 2 minutes |
| Cost per video | < $1 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Claude generates invalid Remotion code | Validate syntax, provide examples, retry with feedback |
| 11Labs API rate limits | Queue requests, use caching for common SFX |
| Long render times | Preview at lower quality, background render |
| Asset storage limits | Compress images, limit upload sizes |
| Cost overruns | Token budgets, caching, user quotas |

---

## What We're NOT Building (MVP Scope)

- User authentication (can add later)
- Cloud storage (using local/IndexedDB for MVP)
- Collaboration features
- Template marketplace
- Direct social media posting
- Mobile app

---

*Implementation Plan created: January 24, 2026*
*Based on: Argus App patterns + Remotion MCP workflow + Current codebase*
