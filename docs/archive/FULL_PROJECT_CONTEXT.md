# Stan Video Editor - Complete Project Context

**Created**: January 24, 2026
**Hackathon**: Stan Creator Platform (January 24-26, 2026, Toronto)
**Purpose**: AI-powered video editor for creators to make TikTok/Reels/Shorts content

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technical Stack](#technical-stack)
3. [Project Structure](#project-structure)
4. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
5. [Key Files and Their Contents](#key-files-and-their-contents)
6. [API Endpoints](#api-endpoints)
7. [Type Definitions](#type-definitions)
8. [Component Architecture](#component-architecture)
9. [How to Run](#how-to-run)
10. [Environment Variables](#environment-variables)
11. [Known Issues and Workarounds](#known-issues-and-workarounds)
12. [Future Improvements](#future-improvements)

---

## Project Overview

### Goal
Build a VibeMotion.ai-style video editor where creators can:
1. Upload 3-5 talking-head video clips
2. Auto-transcribe with word-level timestamps
3. Chat with AI to get editing suggestions
4. Preview clips in sequence
5. Export as vertical video (1080x1920) for TikTok/Reels/Shorts

### Design Philosophy
- **Split-panel UI**: Left panel for upload/chat, right panel for preview
- **No over-engineering**: Build minimal working features first
- **Hackathon-focused**: Prioritize demo-able features over polish
- **Portrait-first**: 9:16 aspect ratio (1080x1920) for social media

### Forked From
`jhartquist/claude-remotion-kickstart` - A Remotion + Next.js starter template

---

## Technical Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.1.4 | React framework with App Router |
| React | 19.0.0 | UI library |
| TypeScript | 5.8.2 | Type safety |
| Tailwind CSS | 4.0.0 | Styling |

### Video Engine
| Technology | Version | Purpose |
|------------|---------|---------|
| Remotion | 4.0.409 | Programmatic video creation |
| @remotion/player | 4.0.409 | Video preview (not used due to Next.js compatibility) |
| @remotion/studio | 4.0.409 | Video rendering UI |

### AI Services
| Service | Purpose | Cost |
|---------|---------|------|
| OpenAI Whisper API | Audio transcription | ~$0.006/minute |
| Anthropic Claude API | AI chat assistant | ~$3/M input, $15/M output tokens |

### Storage
| Technology | Purpose |
|------------|---------|
| IndexedDB | Client-side video clip storage |
| Blob URLs | In-memory video playback |

---

## Project Structure

```
claude-remotion-kickstart/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Main page (uses EditorLayout)
│   ├── layout.tsx                    # Root layout with metadata
│   ├── globals.css                   # Global styles
│   └── api/                          # API routes
│       ├── transcribe/
│       │   └── route.ts              # OpenAI Whisper endpoint
│       └── chat/
│           └── route.ts              # Claude API endpoint
│
├── components/                       # React components
│   ├── EditorLayout.tsx              # Main layout with shared state
│   ├── UploadPanel.tsx               # Left panel (upload, transcribe, chat)
│   ├── PreviewPanel.tsx              # Right panel (video preview)
│   ├── UploadZone.tsx                # Drag-drop upload area
│   ├── ClipThumbnails.tsx            # Uploaded clips display
│   ├── TranscriptView.tsx            # Transcript display
│   └── ChatInterface.tsx             # AI chat UI
│
├── lib/                              # Utility libraries
│   ├── types.ts                      # TypeScript interfaces
│   ├── storage.ts                    # IndexedDB wrapper
│   ├── video-utils.ts                # Video processing utilities
│   └── transcribe.ts                 # Transcription helpers
│
├── src/                              # Remotion source
│   ├── Root.tsx                      # Remotion compositions root
│   ├── presets.ts                    # Video presets (Portrait-1080p)
│   ├── components/                   # Remotion components
│   │   ├── VideoSlide.tsx            # Video embedding
│   │   ├── Caption.tsx               # Word-level captions
│   │   └── ... (more components)
│   └── compositions/
│       ├── dynamic-clips/
│       │   └── DynamicClipsComposition.tsx  # For uploaded clips
│       └── ... (example compositions)
│
├── .env.example                      # Environment variable template
├── package.json                      # Dependencies
├── PROGRESS.md                       # Progress tracker
├── PHASE1_COMPLETE.md               # Phase 1 documentation
├── PHASE2_COMPLETE.md               # Phase 2 documentation
├── PHASE3_COMPLETE.md               # Phase 3 documentation
├── PHASE4_COMPLETE.md               # Phase 4 documentation
├── PHASE5_COMPLETE.md               # Phase 5 documentation
└── FULL_PROJECT_CONTEXT.md          # This file
```

---

## Phase-by-Phase Implementation

### Phase 1: Core Foundation (30 minutes)
**Goal**: Set up the basic split-panel UI

**What was built**:
- Next.js 15 app structure with App Router
- Split-panel layout (40% left, 60% right)
- UploadPanel component (left)
- PreviewPanel component (right)
- Tailwind CSS styling
- TypeScript configuration

**Key decisions**:
- Used App Router (not Pages Router) for modern Next.js patterns
- Portrait-first design (1080x1920)
- Dark theme for preview panel, light theme for upload panel

---

### Phase 2: Upload & Storage (45 minutes)
**Goal**: Allow users to upload and manage video clips

**What was built**:
- Drag-drop upload zone (UploadZone.tsx)
- IndexedDB storage wrapper (lib/storage.ts)
- Video metadata extraction (lib/video-utils.ts)
- Thumbnail generation using Canvas API
- Clip management UI (ClipThumbnails.tsx)
- Maximum 5 clips limit

**Key features**:
- Parallel processing of thumbnail + metadata
- Base64 thumbnail encoding for IndexedDB storage
- File type validation (video/* only)
- Persistent storage across browser sessions

**IndexedDB Schema**:
```typescript
// Database: stan-video-editor
// Object Store: clips
// Key: clip.id (string)
// Value: VideoClip object (serialized)
```

---

### Phase 3: Transcription (2 hours)
**Goal**: Auto-transcribe uploaded clips with word-level timestamps

**What was built**:
- OpenAI Whisper API integration (/api/transcribe)
- Word-level timestamp extraction
- Transcript display component (TranscriptView.tsx)
- Batch transcription with progress tracking
- Status badges on clips (pending, processing, complete, error)
- Copy transcript to clipboard

**API endpoint** (`/api/transcribe`):
- Accepts: FormData with video/audio file
- Returns: `{ text: string, words: Word[] }`
- Uses: `whisper-1` model with `verbose_json` format

**Transcription flow**:
1. User clicks "Transcribe All Clips"
2. For each clip, extract audio and send to Whisper API
3. Update clip with transcript data
4. Save to IndexedDB
5. Display in TranscriptView

---

### Phase 4: AI Chat Integration (45 minutes)
**Goal**: Allow users to chat with AI about their video content

**What was built**:
- Claude API integration (/api/chat)
- ChatInterface component with message bubbles
- Suggested prompts for quick actions
- Tab navigation between Clips and Chat views
- Clip context sent with each message

**API endpoint** (`/api/chat`):
- Accepts: `{ message, history, clips }`
- Returns: `{ message, usage }`
- Uses: `claude-sonnet-4-20250514` model

**System prompt**:
```
You are a helpful AI assistant for a video editing application.
You help users with their video content, provide editing suggestions,
and answer questions about their clips and transcripts.
Be concise, helpful, and creative with your suggestions.
```

**Suggested prompts**:
- "Summarize what's in my clips"
- "What are the key points?"
- "How can I make this more engaging?"
- "Suggest a good hook for TikTok"

---

### Phase 5: Video Preview & Export (1.5 hours)
**Goal**: Preview clips and prepare for export

**What was built**:
- EditorLayout component for shared state management
- Video preview with HTML5 video element
- Playback controls (Play/Pause/Prev/Next)
- Auto-advance to next clip
- Export button with instructions
- Remotion composition for clips (DynamicClipsComposition.tsx)

**Architecture change**:
- Moved clips state from UploadPanel to EditorLayout
- Both panels now receive clips as props
- Changes in UploadPanel propagate to PreviewPanel

**Why not Remotion Player**:
- Next.js 15 has compatibility issues with @remotion/player
- Error: "Can't resolve 'remotion/no-react'"
- Workaround: Use HTML5 video element for preview
- Full rendering available via Remotion Studio (`pnpm studio`)

---

## Key Files and Their Contents

### app/page.tsx
```typescript
import EditorLayout from "@/components/EditorLayout";

export default function Home() {
  return <EditorLayout />;
}
```

### components/EditorLayout.tsx
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import UploadPanel from "./UploadPanel";
import PreviewPanel from "./PreviewPanel";
import type { VideoClip } from "@/lib/types";
import { clipStorage } from "@/lib/storage";

export default function EditorLayout() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load clips from IndexedDB on mount
  useEffect(() => {
    const loadClips = async () => {
      try {
        const savedClips = await clipStorage.getAllClips();
        setClips(savedClips);
      } catch (error) {
        console.error("Failed to load clips:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClips();
  }, []);

  const handleClipsChange = useCallback((newClips: VideoClip[]) => {
    setClips(newClips);
  }, []);

  return (
    <main className="h-screen flex overflow-hidden">
      <div className="w-[40%] min-w-[400px]">
        <UploadPanel
          clips={clips}
          onClipsChange={handleClipsChange}
          isLoading={isLoading}
        />
      </div>
      <div className="flex-1">
        <PreviewPanel clips={clips} />
      </div>
    </main>
  );
}
```

### lib/types.ts
```typescript
export interface Word {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptData {
  text: string;
  words: Word[];
}

export type TranscriptStatus = "pending" | "processing" | "complete" | "error";

export interface VideoClip {
  id: string;
  file: File;
  name: string;
  size: number;
  duration: number | null;
  thumbnail: string | null; // Base64 data URL
  createdAt: number;
  transcript: TranscriptData | null;
  transcriptStatus: TranscriptStatus;
}

export interface ClipMetadata {
  id: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface ProjectState {
  clips: VideoClip[];
  transcript: string | null;
  composition: any | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ClipInfo {
  id: string;
  name: string;
  duration: number | null;
  transcript: string | null;
}
```

### lib/storage.ts
```typescript
const DB_NAME = "stan-video-editor";
const DB_VERSION = 1;
const STORE_NAME = "clips";

class ClipStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    // Initialize IndexedDB
  }

  async saveClip(clip: VideoClip): Promise<void> {
    // Save clip to IndexedDB
  }

  async getClip(id: string): Promise<VideoClip | null> {
    // Get single clip
  }

  async getAllClips(): Promise<VideoClip[]> {
    // Get all clips
  }

  async deleteClip(id: string): Promise<void> {
    // Delete clip
  }

  async clearAll(): Promise<void> {
    // Clear all clips
  }
}

export const clipStorage = new ClipStorage();
```

### app/api/transcribe/route.ts
```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words = transcription.words?.map((w: any) => ({
      text: w.word,
      start: w.start,
      end: w.end,
    })) || [];

    return NextResponse.json({
      text: transcription.text,
      words: words,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
```

### app/api/chat/route.ts
```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant for a video editing application called Stan Video Editor. You help users with their video content, provide editing suggestions, and answer questions about their clips and transcripts.

Your capabilities:
- Summarize video content based on transcripts
- Suggest engaging hooks for TikTok, Reels, and Shorts
- Provide editing suggestions to improve engagement
- Help structure content for better flow
- Suggest captions and text overlays

Be concise, helpful, and creative with your suggestions. Focus on practical advice that creators can implement.`;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const { message, history, clips } = await request.json();

    // Build clips context
    let clipsContext = "";
    if (clips && clips.length > 0) {
      clipsContext = "\n\nUser's video clips:\n";
      clips.forEach((clip: any, index: number) => {
        clipsContext += `\nClip ${index + 1}: ${clip.name}`;
        if (clip.duration) {
          clipsContext += ` (${clip.duration.toFixed(1)}s)`;
        }
        if (clip.transcript) {
          clipsContext += `\nTranscript: "${clip.transcript}"`;
        }
      });
    }

    // Build messages array
    const messages = [
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + clipsContext,
      messages: messages,
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      message: assistantMessage,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error.message || "Chat request failed" },
      { status: 500 }
    );
  }
}
```

### components/ChatInterface.tsx (key parts)
```typescript
const SUGGESTED_PROMPTS = [
  "Summarize what's in my clips",
  "What are the key points?",
  "How can I make this more engaging?",
  "Suggest a good hook for TikTok",
];

// Chat interface with:
// - Message bubbles (user = blue, assistant = white)
// - Suggested prompts when no messages
// - Loading indicator with animated dots
// - Input field with send button
// - Auto-scroll to latest message
```

### components/PreviewPanel.tsx (key parts)
```typescript
// Portrait-1080p preset
const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
};

// Features:
// - HTML5 video element for preview
// - Blob URL creation from uploaded files
// - Play/Pause button
// - Prev/Next clip navigation
// - Auto-advance on video end
// - Clip indicator (1/5, 2/5, etc.)
// - Export button with instructions
// - Total duration display
```

### components/UploadPanel.tsx (key parts)
```typescript
interface UploadPanelProps {
  clips: VideoClip[];
  onClipsChange: (clips: VideoClip[]) => void;
  isLoading: boolean;
}

// Features:
// - Tab navigation (Clips / AI Chat)
// - Upload zone
// - Clip thumbnails with status badges
// - Transcribe All button with progress
// - Transcript view
// - Chat interface
```

### src/compositions/dynamic-clips/DynamicClipsComposition.tsx
```typescript
import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig } from "remotion";

export interface DynamicClip {
  id: string;
  src: string; // Blob URL or data URL
  durationInFrames: number;
  name: string;
}

export interface DynamicClipsProps {
  clips: DynamicClip[];
}

const ClipVideo: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <AbsoluteFill className="bg-black items-center justify-center">
      <video
        src={src}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        ref={(video) => {
          if (video && Math.abs(video.currentTime - currentTime) > 0.1) {
            video.currentTime = currentTime;
          }
        }}
        muted
        playsInline
      />
    </AbsoluteFill>
  );
};

export const DynamicClipsComposition: React.FC<DynamicClipsProps> = ({ clips }) => {
  if (!clips || clips.length === 0) {
    return <EmptyState />;
  }

  return (
    <AbsoluteFill className="bg-black">
      <Series>
        {clips.map((clip) => (
          <Series.Sequence key={clip.id} durationInFrames={clip.durationInFrames}>
            <ClipVideo src={clip.src} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
```

### src/presets.ts
```typescript
export const VIDEO_PRESETS = {
  'Landscape-720p': { width: 1280, height: 720, fps: 60 },
  'Landscape-1080p': { width: 1920, height: 1080, fps: 60 },
  'Square-1080p': { width: 1080, height: 1080, fps: 60 },
  'Portrait-1080p': { width: 1080, height: 1920, fps: 60 },
} as const;

export type PresetName = keyof typeof VIDEO_PRESETS;
```

---

## API Endpoints

### POST /api/transcribe
**Purpose**: Transcribe audio/video using OpenAI Whisper

**Request**:
```
Content-Type: multipart/form-data
Body: file (video/audio file)
```

**Response**:
```json
{
  "text": "Full transcript text",
  "words": [
    { "text": "Hello", "start": 0.0, "end": 0.5 },
    { "text": "world", "start": 0.5, "end": 1.0 }
  ]
}
```

**Errors**:
- 400: No file provided
- 500: Transcription failed / API key not configured

---

### POST /api/chat
**Purpose**: Chat with Claude AI about video content

**Request**:
```json
{
  "message": "User's message",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ],
  "clips": [
    {
      "id": "clip-123",
      "name": "video.mp4",
      "duration": 30.5,
      "transcript": "Hello world..."
    }
  ]
}
```

**Response**:
```json
{
  "message": "AI response text",
  "usage": {
    "input_tokens": 150,
    "output_tokens": 200
  }
}
```

**Errors**:
- 500: API key not configured / Chat request failed

---

## Type Definitions

### VideoClip
The main data structure for uploaded clips:

```typescript
interface VideoClip {
  id: string;              // Unique identifier (e.g., "clip-1706123456789")
  file: File;              // Original file object
  name: string;            // File name
  size: number;            // File size in bytes
  duration: number | null; // Duration in seconds
  thumbnail: string | null; // Base64 data URL
  createdAt: number;       // Unix timestamp
  transcript: TranscriptData | null;
  transcriptStatus: "pending" | "processing" | "complete" | "error";
}
```

### TranscriptData
Word-level transcript data:

```typescript
interface TranscriptData {
  text: string;     // Full transcript
  words: Word[];    // Word-level timestamps
}

interface Word {
  text: string;     // The word
  start: number;    // Start time in seconds
  end: number;      // End time in seconds
}
```

### ChatMessage
Chat message structure:

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

---

## Component Architecture

```
EditorLayout
├── clips: VideoClip[]           (state)
├── isLoading: boolean           (state)
├── handleClipsChange()          (callback)
│
├── UploadPanel
│   ├── Props: clips, onClipsChange, isLoading
│   ├── activeTab: "clips" | "chat"
│   ├── isTranscribing: boolean
│   │
│   ├── [Clips Tab]
│   │   ├── UploadZone
│   │   │   └── onClipsAdded()
│   │   ├── ClipThumbnails
│   │   │   └── onRemove()
│   │   ├── Transcribe Button
│   │   │   └── handleTranscribeAll()
│   │   └── TranscriptView
│   │
│   └── [Chat Tab]
│       └── ChatInterface
│           ├── messages: ChatMessage[]
│           ├── sendMessage()
│           └── Suggested Prompts
│
└── PreviewPanel
    ├── Props: clips
    ├── currentClipIndex: number
    ├── isPlaying: boolean
    ├── blobUrls: Map<string, string>
    │
    ├── Video Element
    │   └── onEnded → next clip
    │
    └── Controls
        ├── Prev/Play/Next
        └── Export Button
```

---

## How to Run

### Development Server
```bash
cd /Users/sammytourani/Desktop/claude-remotion-kickstart
pnpm dev
# Open http://localhost:3000
```

### Remotion Studio (for rendering)
```bash
pnpm studio
# Opens Remotion Studio at http://localhost:3000
```

### Build for Production
```bash
pnpm build
pnpm start
```

### TypeScript Check
```bash
npx tsc --noEmit
```

---

## Environment Variables

Create `.env.local` in project root:

```env
# OpenAI API Key for Whisper transcription
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-key-here

# Anthropic API Key for Claude chat
# Get from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
```

**Costs**:
- OpenAI Whisper: ~$0.006/minute of audio
- Anthropic Claude: ~$3/M input tokens, ~$15/M output tokens

---

## Known Issues and Workarounds

### 1. Remotion Player + Next.js 15 Compatibility
**Issue**: `@remotion/player` throws "Can't resolve 'remotion/no-react'" in Next.js 15

**Workaround**: Use HTML5 `<video>` element for preview instead of Remotion Player. Full Remotion rendering is available via `pnpm studio`.

**Error message**:
```
Module not found: Can't resolve 'remotion/no-react'
./node_modules/@remotion/player/dist/esm/index.mjs:3123:1
```

### 2. Next.js 15.1.4 Version Warning
**Issue**: Next.js shows "outdated version" warning

**Status**: Non-blocking, cosmetic warning only

### 3. Favicon 404
**Issue**: Console shows 404 for /favicon.ico

**Status**: Non-blocking, doesn't affect functionality

### 4. TypeScript Version Warnings
**Issue**: Some TypeScript version mismatch warnings

**Status**: Non-blocking, compilation works correctly

---

## Future Improvements

### Short-term (Post-hackathon)
1. Fix Remotion Player compatibility with Next.js 15
2. Add actual video rendering with @remotion/web-renderer
3. Add silence detection and removal
4. Add auto-generated captions overlay
5. Add background music support

### Long-term
1. Server-side rendering with Remotion Lambda
2. User authentication and cloud storage
3. Template library for different video styles
4. Collaboration features
5. Direct upload to TikTok/Instagram APIs

---

## Session Summary

### Total Time: ~5.5 hours

| Phase | Time | Key Achievement |
|-------|------|-----------------|
| Phase 1 | 30 min | Split-panel UI, Next.js setup |
| Phase 2 | 45 min | Upload, IndexedDB, thumbnails |
| Phase 3 | 2 hours | OpenAI Whisper transcription |
| Phase 4 | 45 min | Claude AI chat integration |
| Phase 5 | 1.5 hours | Video preview, playback controls |

### Key Decisions Made
1. **OpenAI Whisper API over local Whisper.cpp** - More reliable for hackathon
2. **HTML5 video over Remotion Player** - Compatibility issues with Next.js 15
3. **IndexedDB over server storage** - No backend needed for hackathon
4. **Props-based state management** - Simple, no external state library needed

### Files Created During Session
- `components/EditorLayout.tsx`
- `components/ChatInterface.tsx`
- `app/api/chat/route.ts`
- `app/api/transcribe/route.ts`
- `lib/transcribe.ts`
- `src/compositions/dynamic-clips/DynamicClipsComposition.tsx`
- `PHASE1_COMPLETE.md` through `PHASE5_COMPLETE.md`
- `PROGRESS.md`
- `FULL_PROJECT_CONTEXT.md`

### Files Modified During Session
- `app/page.tsx`
- `components/UploadPanel.tsx`
- `components/PreviewPanel.tsx`
- `components/ClipThumbnails.tsx`
- `lib/types.ts`
- `.env.example`
- `package.json`

---

## Demo Script

1. **Open app**: http://localhost:3000
2. **Upload clips**: Drag 2-3 short video clips
3. **Show thumbnails**: Point out automatic thumbnail generation
4. **Transcribe**: Click "Transcribe All Clips" (requires OpenAI key)
5. **Show transcript**: Demonstrate word-level timestamps
6. **Chat with AI**: Switch to AI Chat tab
7. **Ask for suggestions**: "Suggest a hook for TikTok"
8. **Preview clips**: Show video preview, use play/pause
9. **Navigate clips**: Use Prev/Next buttons
10. **Export**: Mention Remotion Studio for final rendering

---

*Document created: January 24, 2026*
*Last updated: January 24, 2026*
