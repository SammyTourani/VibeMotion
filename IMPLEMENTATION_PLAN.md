# Autonomous Video Editor - Implementation Plan

**Date**: January 24, 2026
**Status**: Phase 3 COMPLETE - Ready for Phase 4

---

## Vision

**Input**: Raw iPhone videos uploaded by user
**Output**: Polished TikTok/Reels-ready video with:
- Intelligent A-roll/B-roll editing (B-roll is muted visual overlay on continuous A-roll audio)
- TikTok-style animated subtitles
- Sound effects
- Background music
- Cool text animations

The AI must understand BOTH what is being SAID (transcription) AND what is being SHOWN (visual analysis).

---

## Current State vs Target

| Feature | Current State | Target State |
|---------|---------------|--------------|
| Upload raw iPhone videos | Working (MOV→MP4 transcoding) | Complete |
| AI understands what's SAID | Working (Whisper transcription) | Complete |
| AI understands what's SHOWN | **COMPLETE** (Gemini Vision) | Phase 1 Done |
| Classify A-roll/B-roll | **Visual + Audio** | Complete |
| TikTok-style subtitles | **COMPLETE** (Phase 2) | Integrated in pipeline |
| Text animations | Missing | Phase 6 |
| Sound effects | ElevenLabs connected | Not in pipeline |
| Background music | ElevenLabs connected | Not in pipeline |
| Generation progress UI | **COMPLETE** (Phase 3) | Real-time SSE progress |
| Preview before export | Player exists | Connected |
| Final video render | Render API exists | Phase 7 |

---

## Architecture

```
INPUT: iPhone videos + User prompt
         ↓
    ┌────────────────────────────────────────┐
    │ 1. Upload + Transcode (MOV → MP4)      │ ← DONE
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 2. Transcribe (Whisper)                │ ← DONE
    │    + Extract Key Frames (FFmpeg)       │ ← DONE
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 3. Visual Analysis (Gemini Vision)     │ ← DONE
    │    Understand what's SHOWN in clips    │
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 4. Smart Classification                │ ← DONE
    │    Audio context + Visual context      │
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 5. Storyboard Generation               │ ← DONE
    │    Scene arrangement + Music/SFX picks │
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 6. Generate Composition                │ ← DONE (needs enhancements)
    │    • VideoSlide (A-roll with audio)    │
    │    • BRollVideo (muted overlay)        │
    │    • Caption (TikTok subtitles)        │ ← Phase 2
    │    • AnimatedText                      │ ← Phase 6
    │    • Music                             │ ← Phase 4
    │    • Audio (sound effects)             │ ← Phase 5
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 7. Real-time Progress UI               │ ← Phase 3
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ 8. Preview + Render                    │ ← Phase 7
    └────────────────────────────────────────┘
         ↓
OUTPUT: Polished TikTok/Reels-ready video
```

---

## Phase 1: Visual Analysis - COMPLETE

**Priority**: CRITICAL
**Status**: COMPLETE

### What Was Built

The AI can now "see" videos, not just "hear" them. This enables intelligent A-roll/B-roll classification based on visual content.

### Files Created

#### `lib/pipeline/visual-analyzer.ts`
Complete visual analysis module with:
- `extractKeyFrames(videoPath, outputDir, numFrames)` - Extract 3 frames (beginning, middle, end)
- `analyzeFramesWithVision(framePaths, assetId)` - Analyze with Gemini Vision
- `analyzeVideo(videoPath, assetId, framesDir)` - Full pipeline for single video
- `analyzeVideos(videos, framesDir)` - Batch analysis with concurrency control
- Returns: `{ sceneDescription, subjects, actions, mood, suggestedRole, roleConfidence }`

### Files Modified

#### `lib/pipeline/types.ts`
- Added `VisualAnalysis` interface with all visual data fields
- Added `FrameExtractionResult` interface
- Added `visualDescription` and `subjects` to `ClassifiedClip`
- Added `visual_analysis_ready` event type

#### `lib/pipeline/classifier.ts`
- Updated `classifyClips()` to accept optional `visualAnalyses` parameter
- Enhanced `preClassifyBySpeechDensity()` to use visual context
- Updated AI classification prompt to consider both audio AND visual signals
- Classification now combines speech density + visual analysis for smarter decisions

#### `lib/pipeline/orchestrator.ts`
- Added `analyzeVisualContent()` method
- Integrated visual analysis into pipeline flow (after transcription, before classification)
- Visual context is now passed to classifier

### How It Works

```
Video Upload → Transcription + Frame Extraction → Visual Analysis → Classification
                                                        ↓
                                              "Person talking to camera"
                                              "Subjects: person, face"
                                              "Actions: speaking, gesturing"
                                              "Suggested: A-roll (95% confidence)"
```

### Technical Details

- FFmpeg extracts 3 frames at timestamps: beginning, middle, end
- Frames scaled to 640px width for faster API calls
- Frames stored in `public/assets/frames/{assetId}/`
- Gemini 2.0 Flash analyzes frames with structured output
- Classification combines audio (words/second) + visual (what's shown)

---

## Phase 2: Captions in Pipeline - COMPLETE

**Priority**: HIGH
**Status**: COMPLETE

### What Was Built
TikTok-style synchronized captions are now automatically included in generated compositions. The system extracts word-level timestamps from transcription, adjusts them for the composition timeline, and generates a `transcript.ts` file that the AI-generated composition imports.

### Architecture

**Data Flow:**
```
Transcription → VideoTranscript[] (with word timestamps)
                        ↓
Storyboard → Scenes with timeline positions
                        ↓
Calculate scene offsets (which video plays when)
                        ↓
Write transcript.ts with offset-adjusted word times
                        ↓
Generated Composition imports Caption + transcript
```

**Output Structure:**
```
src/compositions/generated/{projectId}/
├── Composition.tsx    ← imports Caption + TRANSCRIPT_WORDS
├── transcript.ts      ← NEW: export TRANSCRIPT_WORDS = [...]
├── config.ts
└── index.ts
```

### Key Challenge: Timestamp Offsetting

Transcript words have timestamps relative to source video, but composition timeline is different:

| Source Video | Word Time | Composition Offset | Final Time |
|--------------|-----------|-------------------|------------|
| clip_0.mp4   | 0.5s      | +3s (after title) | 3.5s       |
| clip_1.mp4   | 1.2s      | +8s               | 9.2s       |

**Solution**: Calculate scene start times from storyboard, match to transcript via `publicPath`, adjust all word timestamps.

### Files Modified

#### 1. `lib/pipeline/orchestrator.ts` ✅
- Added `transcripts` parameter to `generateCompositionCode()`
- Updated system prompt with Caption import and usage instructions
- Added TRANSCRIPT_WORDS import from './transcript' to required imports
- Added Captions section to user prompt with word count

#### 2. `lib/composition-writer.ts` ✅
- Added `transcripts` to `WriteCompositionInput` interface
- Added `calculateSceneOffsets()` function to compute timeline positions from storyboard
- Added `generateTranscriptFile()` function to create transcript.ts with offset-adjusted words
- Writes `transcript.ts` file alongside Composition.tsx with `TRANSCRIPT_WORDS` export

### How It Works

1. Transcription extracts word-level timestamps from each video
2. Storyboard defines scene order and which A-roll assets are used
3. `calculateSceneOffsets()` computes where each A-roll starts in the final timeline
4. Word timestamps are adjusted: `finalTime = wordTime + sceneOffset - assetStartTime`
5. `transcript.ts` is written with all words sorted by adjusted start time
6. AI generates composition that imports Caption + TRANSCRIPT_WORDS
7. Caption renders TikTok-style subtitles synced to the audio

---

## Phase 3: Generation Progress UI - COMPLETE

**Priority**: HIGH
**Status**: COMPLETE

### What Was Built

Real-time progress UI for the video generation pipeline. Users can now watch each phase execute with live status updates, expandable details, and a clear path to preview their generated video.

### Files Created

#### `components/generation/ProgressBar.tsx` ✅
- 6-phase horizontal progress bar with icons
- Status states: pending, running, complete, error, skipped
- Animated connecting lines showing progress
- Responsive design (horizontal on desktop, vertical on mobile)
- Glow effects on active phase

#### `components/generation/PhaseStatus.tsx` ✅
- Summary stats (progress count, current phase, elapsed time, duration)
- Expandable sections for transcripts, classification, and storyboard
- Per-phase status badges
- Detailed clip information with A-roll/B-roll classification

#### `app/generate/[projectId]/page.tsx` ✅ (Complete Rewrite)
- Auto-starts pipeline when project loads
- SSE stream reader with buffered parsing
- State management for all 6 phases
- Real-time progress updates
- Success/error messaging
- "Preview Video" button linking to sandbox
- "Retry" button on error
- Project summary display

### Problem
`/generate/[projectId]` page is a placeholder. Users can't see what's happening during video generation.

### Architecture

**Data Flow:**
```
Generate Page
    ↓
Load Project from IndexedDB (projectStorage)
    ↓
POST /api/autonomous-pipeline (with project assets)
    ↓
Connect to SSE Stream (EventSource)
    ↓
├─── phase_start → Update phase status to 'running'
├─── phase_progress → Update progress percentage
├─── phase_complete → Update phase status to 'complete'
├─── transcript_ready → Store transcript data
├─── classification_ready → Store classification
├─── storyboard_ready → Store storyboard
├─── composition_ready → Store compositionId
├─── complete → Set state to 'complete', update project
└─── error → Set state to 'error', show retry
    ↓
On Complete → Link to /sandbox?compositionId=X
```

### Components to Create

#### 1. `components/generation/ProgressBar.tsx`
Visual 6-phase progress indicator:
- Shows all phases: Upload → Transcribe → Classify → Storyboard → Composition → Render
- Phase states: pending (gray), running (animated purple), complete (green), error (red), skipped (gray)
- Connecting lines between phases
- Current phase highlighted with glow effect
- Responsive layout

#### 2. `components/generation/PhaseStatus.tsx`
Per-phase status card:
- Icon + phase name
- Status badge (Running/Complete/Error/Skipped)
- Progress bar for current phase (0-100%)
- Status message (e.g., "Transcribing video 2 of 3...")
- Elapsed time
- Expandable for detailed data (transcripts, classification, etc.)

### Generate Page State Management

```typescript
interface GenerationState {
  // Pipeline state
  pipelineState: 'idle' | 'initializing' | 'running' | 'complete' | 'error';

  // Phase tracking
  phases: Map<PhaseName, {
    status: 'pending' | 'running' | 'complete' | 'error' | 'skipped';
    progress: number;
    message?: string;
    startedAt?: number;
    completedAt?: number;
  }>;
  currentPhase: PhaseName | null;

  // Results
  transcripts?: VideoTranscript[];
  classification?: ClassificationResult;
  storyboard?: SmartStoryboard;
  compositionId?: string;
  compositionPath?: string;

  // Timing & errors
  startTime: number;
  elapsedTime: number;
  error?: string;
}
```

### UI States

1. **Loading** - Fetching project data from IndexedDB
2. **Initializing** - Starting pipeline, showing "Preparing..."
3. **Running** - Show progress bar + phase statuses
4. **Complete** - Success message + Preview button → `/sandbox?compositionId=X`
5. **Error** - Error message + Retry button

### Files to Create/Modify

| File | Action |
|------|--------|
| `components/generation/ProgressBar.tsx` | CREATE - 6-phase visual progress |
| `components/generation/PhaseStatus.tsx` | CREATE - Per-phase status cards |
| `app/generate/[projectId]/page.tsx` | REWRITE - Full progress UI with SSE |

### SSE Event Handling

```typescript
// Connect to SSE stream after POST
const eventSource = new EventSource(/* not used - we parse from fetch response */);

// Or use fetch with ReadableStream for SSE
const response = await fetch('/api/autonomous-pipeline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(pipelineInput),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const events = parseSSEEvents(text);

  for (const event of events) {
    handlePipelineEvent(event);
  }
}
```

### On Complete Actions

1. Update project in IndexedDB: `status = 'preview'`
2. Store compositionId for preview
3. Show success UI with:
   - Execution time
   - Storyboard summary
   - Classification summary (X A-roll, Y B-roll clips)
   - "Preview Video" button → `/sandbox?compositionId=X`

### Error Handling

1. Show which phase failed
2. Display error message clearly
3. "Retry" button to restart entire pipeline
4. "Back to Upload" button to modify assets

---

## Phase 4: Background Music

**Priority**: MEDIUM

### Solution
- Add music mood selector to theme config
- Generate or select music via ElevenLabs
- Include `<Music>` component in generated compositions

---

## Phase 5: Sound Effects

**Priority**: MEDIUM

### Solution
- Analyze storyboard for SFX opportunities (transitions, reveals)
- Generate SFX via ElevenLabs sound effects API
- Add `<Audio>` components at appropriate times

---

## Phase 6: Text Animations

**Priority**: MEDIUM

### Solution
Create `AnimatedText.tsx` component with presets:
- bounce, shake, glow, typewriter, slide-up, pop
- Word-by-word animation option
- Color accent for keywords

---

## Phase 7: Render Integration

**Priority**: HIGH

### Solution
- Add "Export" button to sandbox/generation complete page
- Poll render status and show progress
- Provide download link when complete

---

## Key Files Reference

### Pipeline Core
- `lib/pipeline/orchestrator.ts` - Main pipeline coordinator
- `lib/pipeline/classifier.ts` - A-roll/B-roll classification
- `lib/pipeline/smart-storyboard.ts` - Scene arrangement
- `lib/pipeline/types.ts` - TypeScript interfaces

### API Routes
- `app/api/upload-assets/route.ts` - File upload + transcoding
- `app/api/transcribe/route.ts` - Whisper transcription
- `app/api/autonomous-pipeline/route.ts` - Full pipeline SSE endpoint
- `app/api/render/route.ts` - Remotion rendering

### Components
- `src/components/Caption.tsx` - TikTok-style subtitles
- `src/components/VideoSlide.tsx` - A-roll video (with audio)
- `src/components/BRollVideo.tsx` - B-roll video (muted)
- `src/components/Music.tsx` - Background music

### External Services
- OpenAI Whisper - Transcription
- Google Gemini - AI (classification, storyboard, composition, vision)
- ElevenLabs - Voice, SFX, Music (connected, not integrated)
- Replicate - Image/video generation (connected, not integrated)

---

## Testing Videos

Test files are in `/testing-videos/`:
- Use these to test the full pipeline
- Verify transcription accuracy
- Test A-roll/B-roll classification
- Check generated compositions

---

## Implementation Order

1. **Phase 1** - Visual Analysis (CRITICAL - enables intelligent editing)
2. **Phase 2** - Captions (quick win, high impact)
3. **Phase 3** - Progress UI (users can see it working)
4. **Phase 4** - Music (adds professionalism)
5. **Phase 5** - Sound Effects (adds punch)
6. **Phase 6** - Text Animations (TikTok feel)
7. **Phase 7** - Render Integration (export to MP4)

---

## Notes

- Always use `pnpm` for all commands
- Don't over-engineer - build what's needed
- Test each phase before moving to the next
- Keep this file updated as progress is made
