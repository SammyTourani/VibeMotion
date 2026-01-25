# Project Status & Gap Analysis

**Last Updated:** January 24, 2026
**Project:** Remotion MCP as a Service - AI Video Generator

---

## Executive Summary

This project is an AI-powered video generation platform that allows users to describe a video in natural language, and the system generates complete Remotion (React) compositions. The core generation pipeline works, but preview and rendering capabilities are not yet implemented.

---

## Current Architecture

```
[Landing Page] → User enters prompt + uploads assets
       ↓
[Session Storage] → Stores prompt + asset metadata
       ↓
[Sandbox Page] → Triggers generation
       ↓
[/api/generate-stream] → SSE streaming
       ↓
   ├── Step 1: Generate Storyboard (Claude API)
   ├── Step 2: Generate Remotion Code (Claude API)
   └── Step 3: Write to Filesystem
       ↓
[src/compositions/generated/{projectId}/]
   ├── Composition.tsx
   ├── config.ts
   └── index.ts
       ↓
[Preview] → ❌ NOT IMPLEMENTED (placeholder only)
       ↓
[Render/Export] → ❌ NOT IMPLEMENTED
```

---

## What's ACTUALLY Working

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Landing page UI | ✅ Working | `/app/page.tsx` | Framer Motion animations, file upload, prompt input |
| Sandbox page UI | ✅ Working | `/app/sandbox/page.tsx` | Chat interface, Monaco code editor, timeline |
| Storyboard generation | ✅ Working | `/api/generate-stream` | Streams JSON storyboard via SSE |
| Code generation | ✅ Working | `/api/generate-stream` | Streams Remotion TypeScript code |
| File system writing | ✅ Working | `/lib/composition-writer.ts` | Writes to `src/compositions/generated/` |
| Transcription API | ✅ Working | `/api/transcribe` | OpenAI Whisper with word-level timestamps |
| Chat suggestions | ✅ Working | `/api/chat` | Claude-based editing suggestions |
| Project storage | ✅ Working | `/lib/project-storage.ts` | IndexedDB client-side storage |
| Asset upload UI | ✅ Working | `/components/upload/` | Drag-drop, thumbnails, metadata |
| Theme configuration | ✅ Working | `/components/upload/ThemeConfig.tsx` | Colors, style, aspect ratio |

---

## What's NOT Working / Missing

| Feature | Status | Priority | Blocker For | Notes |
|---------|--------|----------|-------------|-------|
| **Remotion Player preview** | ❌ Missing | HIGH | User testing | Shows "coming soon" placeholder in sandbox |
| **Video rendering/export** | ❌ Missing | HIGH | Shipping | No way to export final video |
| **ElevenLabs voiceover** | ❌ Missing | MEDIUM | Voice features | API key in `.env` but zero code integration |
| **Image generation (Replicate)** | ❌ Missing | MEDIUM | AI images | No Replicate SDK or endpoints |
| **Video generation (Veo 3.1)** | ❌ Missing | LOW | AI video clips | No Replicate integration |

---

## Feature Integration Tracker

| # | Feature | Priority | Status | Dependencies | Notes |
|---|---------|----------|--------|--------------|-------|
| 1 | File System Integration | HIGHEST | ✅ COMPLETE | None | Compositions write to `src/compositions/generated/` |
| 2 | Asset Upload & Storage | HIGH | ✅ COMPLETE | Feature 1 | Assets saved to `public/assets/` for `staticFile()` |
| 3 | Live Remotion Player | HIGH | ✅ COMPLETE | Feature 2 | DynamicPreview composition + RemotionPreview wrapper |
| 4 | Render Trigger API | MEDIUM | ❌ NOT STARTED | Feature 3 | Call Remotion CLI to render |
| 5 | ElevenLabs Integration | MEDIUM | ❌ NOT STARTED | None | API key exists, need SDK + endpoints |
| 6 | Image Generation (Replicate) | MEDIUM | ❌ NOT STARTED | None | Need Replicate SDK + endpoints |
| 7 | Video Generation (Veo) | LOW | ❌ NOT STARTED | Feature 6 | Uses same Replicate infrastructure |

---

## API Endpoints Status

### Working Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/generate-stream` | POST | Stream storyboard + code generation | ✅ Working |
| `/api/generate-storyboard` | POST | Generate storyboard only | ✅ Working |
| `/api/generate-composition` | POST | Generate code only | ✅ Working |
| `/api/generate-video` | POST | Non-streaming full generation | ✅ Working |
| `/api/write-composition` | GET | List generated compositions | ✅ Working |
| `/api/write-composition` | POST | Write composition to disk | ✅ Working |
| `/api/transcribe` | POST | Whisper transcription | ✅ Working |
| `/api/chat` | POST | Claude chat for suggestions | ✅ Working |
| `/api/upload-assets` | POST | Upload files to `public/assets/` | ✅ Working |
| `/api/upload-assets` | GET | List uploaded assets | ✅ Working |
| `/api/upload-assets` | DELETE | Clear all uploaded assets | ✅ Working |

### Missing Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/render` | POST | Trigger Remotion rendering | ❌ Needed |
| `/api/render-status` | GET | Check render progress | ❌ Needed |
| `/api/elevenlabs/generate` | POST | Generate voiceover | ❌ Needed |
| `/api/elevenlabs/voices` | GET | List available voices | ❌ Needed |
| `/api/replicate/image` | POST | Generate image | ❌ Needed |
| `/api/replicate/video` | POST | Generate video | ❌ Needed |

---

## Environment Configuration

### Configured API Keys

| Service | Key Present | Integrated in Code | Working |
|---------|-------------|-------------------|---------|
| Anthropic (Claude) | ✅ Yes | ✅ Yes | ✅ Yes |
| OpenAI (Whisper) | ✅ Yes | ✅ Yes | ✅ Yes |
| ElevenLabs | ✅ Yes | ❌ No | ❌ No |
| Replicate | ❌ No | ❌ No | ❌ No |

### Required Environment Variables

```env
# Currently configured
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=sk_...

# Needed for future features
REPLICATE_API_TOKEN=r8_...  # For image/video generation
```

---

## Key Files Reference

### Core Libraries

| File | Purpose | Status |
|------|---------|--------|
| `lib/composition-writer.ts` | Write compositions to filesystem | ✅ Working |
| `lib/project-storage.ts` | IndexedDB project storage | ✅ Working |
| `lib/asset-processor.ts` | Process assets for AI context | ✅ Working |
| `lib/asset-gallery.ts` | Generate asset manifests for prompts | ✅ Working |
| `lib/storage.ts` | IndexedDB clip storage (old workflow) | ✅ Working |
| `lib/transcribe.ts` | Whisper transcription wrapper | ✅ Working |
| `lib/types.ts` | TypeScript type definitions | ✅ Working |

### Pages

| File | Purpose | Status |
|------|---------|--------|
| `app/page.tsx` | Landing page | ✅ Working |
| `app/sandbox/page.tsx` | Generation sandbox | ✅ Working (preview placeholder) |
| `app/upload/page.tsx` | Project creation | ✅ Working |
| `app/editor/page.tsx` | Manual editor | ✅ Shell only |
| `app/generate/[projectId]/page.tsx` | Generation status | ⚠️ Placeholder |

---

## Technical Debt & Known Issues

1. **Two storage systems** - Old editor uses `stan-video-editor` DB, new generator uses `stan-video-generator` DB
2. **Assets not served** - Uploaded files stored in IndexedDB, not accessible to Remotion's `staticFile()`
3. **No composition hot-reload** - Generated compositions require manual Root.tsx update to appear in Remotion
4. **Unused state variables** - `_currentFrame`, `_compositionPath`, `_compositionId` in sandbox (prefixed for future use)

---

## Next Feature Candidates (Prioritized)

### Option A: Asset Upload & Storage (Feature 2)
**Confidence: HIGH**
- Clear implementation path
- Copies uploaded files to `public/assets/`
- Makes assets accessible via `staticFile()`
- Low risk of breaking existing code

### Option B: Live Remotion Player (Feature 3)
**Confidence: MEDIUM**
- Requires dynamic composition importing
- May have Next.js SSR issues
- Depends on assets being accessible

### Option C: ElevenLabs Integration (Feature 5)
**Confidence: HIGH**
- API key already configured
- Isolated feature (doesn't touch existing code)
- Clear API: text → audio file

### Option D: Image Generation (Feature 6)
**Confidence: MEDIUM**
- Needs Replicate SDK installation
- New dependency
- Isolated feature

---

## Recommended Implementation Order

1. ~~**Feature 2: Asset Upload & Storage**~~ ✅ COMPLETE
   - Assets now save to `public/assets/` for `staticFile()`

2. **Feature 3: Live Remotion Player** ← NEXT
   - Enables user testing
   - Complex but critical

3. **Feature 4: Render Trigger API**
   - Completes the pipeline
   - Uses Remotion CLI

4. **Feature 5: ElevenLabs**
   - Adds voice capability
   - API key ready

5. **Feature 6-7: Replicate (Image/Video)**
   - Enhancement features
   - New SDK needed

---

## Session Log

| Date | Feature | Status | Notes |
|------|---------|--------|-------|
| Jan 24, 2026 | Feature 1: File System Integration | ✅ Complete | Compositions write to disk |
| Jan 24, 2026 | Gap Analysis | ✅ Complete | This document created |
| Jan 24, 2026 | Feature 2: Asset Upload & Storage | ✅ Complete | Assets save to `public/assets/`, landing page uploads before navigating |
| Jan 24, 2026 | Feature 3: Live Remotion Player | ✅ Complete | DynamicPreview composition renders storyboard data, RemotionPreview wrapper for Next.js |

---

*This document should be updated after each feature implementation.*
