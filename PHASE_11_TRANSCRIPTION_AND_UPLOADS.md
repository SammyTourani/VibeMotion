# Phase 11: Transcription & File Upload System Overhaul

## Executive Summary

Two critical issues are blocking the autonomous video pipeline from achieving its full potential:

1. **Transcription Failure**: The pipeline orchestrator sends JSON file paths to an API that expects FormData with binary files. Result: All transcripts are empty, causing all videos to classify as B-roll.

2. **Double-Suffix Filenames**: Upload API adds `_0`, `_1` suffixes, then the asset processor potentially adds another index, creating files like `img_7335_0_0.mov` instead of `img_7335_0.mov`.

This plan provides a comprehensive solution for both issues while maintaining backward compatibility and improving the overall robustness of the system.

---

## Part A: Transcription System Fix

### Current Problem

**Location**: `lib/pipeline/orchestrator.ts` (lines 323-329)

```typescript
// BROKEN: Sends JSON with file path
const response = await fetch('http://localhost:3000/api/transcribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoPath: `public/${asset.publicPath}`,  // String path, not File
  }),
});
```

**Expected by API** (`app/api/transcribe/route.ts`):
```typescript
// Expects FormData with actual File binary
const formData = await request.formData();
const file = formData.get('file') as File;  // Needs real File object
```

**Result**: API returns 400, pipeline falls back to empty transcript, all videos classify as B-roll (0 speech density).

---

### Solution A1: Server-Side Transcription Function (Recommended)

Create a new server-side transcription utility that reads files from disk and sends to OpenAI Whisper directly, bypassing the HTTP API entirely.

#### New File: `lib/pipeline/transcription-service.ts`

```typescript
/**
 * Server-Side Transcription Service
 *
 * Reads video files from disk, extracts audio, sends to OpenAI Whisper.
 * Designed for pipeline use where we have file paths, not File objects.
 */

import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { VideoTranscript, TranscriptWord } from './types';

const execAsync = promisify(exec);

interface TranscriptionOptions {
  assetId: string;
  publicPath: string;  // e.g., "assets/videos/clip.mov"
  language?: string;
}

interface TranscriptionResult {
  success: boolean;
  transcript: VideoTranscript;
  error?: string;
}

export class TranscriptionService {
  private openai: OpenAI;
  private tempDir: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for transcription');
    }
    this.openai = new OpenAI({ apiKey });
    this.tempDir = '/tmp/transcription';
  }

  /**
   * Transcribe a video file from the public directory
   */
  async transcribe(options: TranscriptionOptions): Promise<TranscriptionResult> {
    const { assetId, publicPath, language } = options;
    const fullPath = path.join(process.cwd(), 'public', publicPath);

    try {
      // 1. Verify file exists
      await fs.access(fullPath);

      // 2. Extract audio to WAV (Whisper prefers audio formats)
      const audioPath = await this.extractAudio(fullPath, assetId);

      // 3. Send to OpenAI Whisper
      const whisperResult = await this.callWhisper(audioPath, language);

      // 4. Clean up temp audio file
      await this.cleanup(audioPath);

      // 5. Calculate metrics
      const words = whisperResult.words || [];
      const duration = this.calculateDuration(words);
      const wordCount = words.length;
      const speechDensity = duration > 0 ? wordCount / duration : 0;

      return {
        success: true,
        transcript: {
          assetId,
          publicPath,
          text: whisperResult.text || '',
          words,
          duration,
          wordCount,
          speechDensity,
        },
      };
    } catch (error) {
      console.error(`[TranscriptionService] Failed for ${publicPath}:`, error);
      return {
        success: false,
        transcript: this.createEmptyTranscript(assetId, publicPath),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract audio from video using ffmpeg
   */
  private async extractAudio(videoPath: string, assetId: string): Promise<string> {
    await fs.mkdir(this.tempDir, { recursive: true });
    const audioPath = path.join(this.tempDir, `${assetId}-${Date.now()}.wav`);

    // ffmpeg command: extract audio, convert to 16kHz mono WAV (optimal for Whisper)
    const command = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}"`;

    try {
      await execAsync(command, { timeout: 60000 });
      return audioPath;
    } catch (error) {
      // If ffmpeg fails (no audio track), return empty
      throw new Error('Failed to extract audio from video');
    }
  }

  /**
   * Call OpenAI Whisper API
   */
  private async callWhisper(
    audioPath: string,
    language?: string
  ): Promise<{ text: string; words: TranscriptWord[] }> {
    const fileBuffer = await fs.readFile(audioPath);
    const file = new File([fileBuffer], 'audio.wav', { type: 'audio/wav' });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      ...(language && { language }),
    });

    // Extract words with timestamps
    const words: TranscriptWord[] = (response.words || []).map((w: any) => ({
      text: w.word,
      start: w.start,
      end: w.end,
    }));

    return {
      text: response.text || '',
      words,
    };
  }

  /**
   * Calculate total duration from word timestamps
   */
  private calculateDuration(words: TranscriptWord[]): number {
    if (words.length === 0) return 0;
    return words[words.length - 1].end;
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(audioPath: string): Promise<void> {
    try {
      await fs.unlink(audioPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Create empty transcript for fallback
   */
  private createEmptyTranscript(assetId: string, publicPath: string): VideoTranscript {
    return {
      assetId,
      publicPath,
      text: '',
      words: [],
      duration: 0,
      wordCount: 0,
      speechDensity: 0,
    };
  }
}

// Singleton instance
let service: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService {
  if (!service) {
    service = new TranscriptionService();
  }
  return service;
}

/**
 * Batch transcribe multiple video assets
 */
export async function transcribeAssets(
  assets: Array<{ id: string; publicPath: string }>,
  onProgress?: (completed: number, total: number, assetId: string) => void
): Promise<VideoTranscript[]> {
  const service = getTranscriptionService();
  const results: VideoTranscript[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress?.(i, assets.length, asset.id);

    const result = await service.transcribe({
      assetId: asset.id,
      publicPath: asset.publicPath,
    });

    results.push(result.transcript);
    onProgress?.(i + 1, assets.length, asset.id);
  }

  return results;
}
```

#### Update: `lib/pipeline/orchestrator.ts`

Replace the broken fetch call with the new service:

```typescript
// At top of file
import { transcribeAssets } from './transcription-service';

// In transcription phase (around line 308)
private async transcribePhase(): Promise<VideoTranscript[]> {
  this.emit({ type: 'phase_start', phase: 'transcribe' });

  const videoAssets = this.assets.filter(
    (a) => a.mimeType.startsWith('video/')
  );

  if (videoAssets.length === 0) {
    this.emit({ type: 'phase_complete', phase: 'transcribe' });
    return [];
  }

  this.emit({
    type: 'phase_progress',
    message: `Transcribing ${videoAssets.length} video(s)...`,
  });

  // Use the new server-side transcription service
  const transcripts = await transcribeAssets(
    videoAssets.map((a) => ({
      id: a.id,
      publicPath: a.publicPath,
    })),
    (completed, total, assetId) => {
      this.emit({
        type: 'phase_progress',
        message: `Transcribing video ${completed + 1}/${total}...`,
      });
    }
  );

  this.emit({
    type: 'transcript_ready',
    transcripts: transcripts.map((t) => ({
      assetId: t.assetId,
      wordCount: t.wordCount,
      speechDensity: t.speechDensity,
    })),
  });

  this.emit({ type: 'phase_complete', phase: 'transcribe' });
  return transcripts;
}
```

---

### Solution A2: Parallel Transcription with Concurrency Control

For better performance with multiple videos, add parallel processing:

```typescript
// lib/pipeline/transcription-service.ts - Enhanced batch function

import pLimit from 'p-limit';

export async function transcribeAssetsParallel(
  assets: Array<{ id: string; publicPath: string }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<VideoTranscript[]> {
  const { concurrency = 2, onProgress } = options;
  const service = getTranscriptionService();
  const limit = pLimit(concurrency);

  let completed = 0;

  const promises = assets.map((asset) =>
    limit(async () => {
      const result = await service.transcribe({
        assetId: asset.id,
        publicPath: asset.publicPath,
      });
      completed++;
      onProgress?.(completed, assets.length);
      return result.transcript;
    })
  );

  return Promise.all(promises);
}
```

---

### Solution A3: Transcription Caching (Performance Optimization)

Cache transcripts to avoid re-transcribing the same video:

```typescript
// lib/pipeline/transcript-cache.ts

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { VideoTranscript } from './types';

const CACHE_DIR = '.cache/transcripts';

export async function getCachedTranscript(
  publicPath: string
): Promise<VideoTranscript | null> {
  const cacheKey = getCacheKey(publicPath);
  const cachePath = path.join(process.cwd(), CACHE_DIR, `${cacheKey}.json`);

  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function cacheTranscript(
  publicPath: string,
  transcript: VideoTranscript
): Promise<void> {
  const cacheKey = getCacheKey(publicPath);
  const cachePath = path.join(process.cwd(), CACHE_DIR, `${cacheKey}.json`);

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(transcript, null, 2));
}

function getCacheKey(publicPath: string): string {
  return crypto.createHash('md5').update(publicPath).digest('hex');
}
```

---

## Part B: File Upload System Fix

### Current Problem

**Double-Suffix Issue**:
- User uploads: `img_7335.mov`
- Upload API (line 189): Adds `_0` → `img_7335_0.mov`
- Asset processor (line 56-67): May add another `_0` → `img_7335_0_0.mov`

**Location 1**: `app/api/upload-assets/route.ts` (line 189)
```typescript
const finalName = `${baseName}_${i}${ext}`;  // Adds upload index
```

**Location 2**: `lib/asset-processor.ts` (lines 56-67) - Adds another index

---

### Solution B1: Unique ID-Based Naming (Recommended)

Replace index-based suffixes with short unique IDs to guarantee no collisions:

#### Update: `app/api/upload-assets/route.ts`

```typescript
import { nanoid } from 'nanoid';

// Replace line 189 with:
function generateUniqueFilename(originalName: string, mimeType: string): string {
  const ext = getExtensionFromMime(mimeType, originalName);
  const sanitized = sanitizeFilename(originalName);
  const baseName = sanitized.replace(/\.[^.]+$/, '');
  const uniqueId = nanoid(6);  // 6-char unique ID: "abc123"

  return `${baseName}-${uniqueId}${ext}`;
}

// Usage in the upload loop:
const finalName = generateUniqueFilename(file.name, file.type);
// Result: "img_7335-abc123.mov" instead of "img_7335_0.mov"
```

**Benefits**:
- No collision possible (nanoid is cryptographically random)
- No need for index tracking
- Predictable naming pattern
- Asset processor won't add another suffix

---

### Solution B2: Remove Asset Processor Double-Suffix

If keeping index-based naming, fix the asset processor to not add another suffix:

#### Update: `lib/asset-processor.ts`

```typescript
// Current (problematic):
function generatePublicPath(asset: UploadedAsset, index: number): string {
  const nameParts = sanitized.split(".");
  const baseName = nameParts.join(".");
  return `assets/${folder}/${baseName}_${index}.${ext}`;  // Adds suffix
}

// Fixed - Use publicPath directly if already set:
function generatePublicPath(asset: UploadedAsset, index: number): string {
  // If the asset already has a publicPath from upload, use it directly
  if (asset.publicPath) {
    return asset.publicPath;
  }

  // Only generate new path for assets without one
  const sanitized = sanitizeFilename(asset.name);
  const folder = `${asset.type}s`;
  const ext = path.extname(sanitized) || '.bin';
  const baseName = sanitized.replace(/\.[^.]+$/, '');

  return `assets/${folder}/${baseName}_${index}${ext}`;
}
```

---

### Solution B3: Comprehensive Path Tracking

Create a single source of truth for asset paths:

```typescript
// lib/asset-registry.ts

interface RegisteredAsset {
  id: string;
  originalName: string;
  finalName: string;
  publicPath: string;
  diskPath: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

class AssetRegistry {
  private assets: Map<string, RegisteredAsset> = new Map();

  register(asset: RegisteredAsset): void {
    this.assets.set(asset.id, asset);
  }

  getByOriginalName(name: string): RegisteredAsset | undefined {
    return Array.from(this.assets.values()).find(
      (a) => a.originalName === name
    );
  }

  getPublicPath(id: string): string | undefined {
    return this.assets.get(id)?.publicPath;
  }

  getDiskPath(id: string): string | undefined {
    return this.assets.get(id)?.diskPath;
  }
}

export const assetRegistry = new AssetRegistry();
```

---

## Part C: Integration Plan

### Phase 1: Core Transcription Fix (Day 1)

1. Create `lib/pipeline/transcription-service.ts`
2. Update `lib/pipeline/orchestrator.ts` to use new service
3. Test with single video upload
4. Verify transcript data flows to classifier

### Phase 2: Upload Path Fix (Day 1)

1. Install `nanoid` package
2. Update `app/api/upload-assets/route.ts` with unique ID naming
3. Fix `lib/asset-processor.ts` to respect existing publicPath
4. Test upload flow

### Phase 3: Caching & Optimization (Day 2)

1. Add transcript caching
2. Implement parallel transcription
3. Add retry logic for failed transcriptions
4. Performance testing

### Phase 4: Verification (Day 2)

1. Full Playwright test with multiple videos
2. Verify:
   - Transcripts populated with words
   - A-roll/B-roll classification correct
   - Generated captions working
   - File paths correct (no double suffixes)

---

## Testing Checklist

### Transcription Tests
- [ ] Single video with speech → Non-empty transcript
- [ ] Video without audio → Empty transcript, no crash
- [ ] Multiple videos → All transcribed in parallel
- [ ] Large video (> 5min) → Completes without timeout
- [ ] MOV file → Audio extracted correctly
- [ ] MP4 file → Audio extracted correctly

### Upload Tests
- [ ] Single file upload → Unique filename, no collisions
- [ ] Multiple files same name → Different unique IDs
- [ ] Special characters in filename → Sanitized correctly
- [ ] Path through pipeline → No double suffixes
- [ ] Generated composition → Correct staticFile paths

### Integration Tests
- [ ] Full pipeline: Upload → Transcribe → Classify → Generate
- [ ] Captions render correctly in preview
- [ ] A-roll/B-roll classification accurate
- [ ] Timeline shows correct scene types

---

## Dependencies to Add

```bash
pnpm add nanoid p-limit
pnpm add -D @types/node
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ffmpeg not installed | Low | High | Check at startup, provide instructions |
| OpenAI rate limits | Medium | Medium | Add retry logic with exponential backoff |
| Large files timeout | Medium | High | Stream processing, chunked uploads |
| Existing file paths break | Low | Medium | Backward compatibility layer |

---

## Rollback Plan

If issues arise:

1. **Transcription**: Revert to empty fallback (current behavior)
2. **Uploads**: Keep both old and new naming, migrate gradually
3. **Pipeline**: Feature flag to toggle new transcription service

---

## Success Metrics

After implementation:

1. **Transcription Success Rate**: > 95% for videos with speech
2. **A-roll Detection**: > 80% accuracy for talking-head videos
3. **Caption Coverage**: Captions appear for all A-roll scenes
4. **File Path Accuracy**: 0 double-suffix filenames in generated code
5. **Pipeline Completion**: < 60 seconds for 4-video upload

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     UPLOAD FLOW (Fixed)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User Upload                                                   │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ POST /api/upload-assets                 │                  │
│   │ • Sanitize filename                     │                  │
│   │ • Generate unique ID (nanoid)           │                  │
│   │ • Save: img_7335-abc123.mov             │                  │
│   │ • Return: { publicPath, id, ... }       │                  │
│   └─────────────────────────────────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│   Asset with final publicPath                                   │
│   (No further renaming needed)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   TRANSCRIPTION FLOW (Fixed)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PipelineOrchestrator.transcribePhase()                       │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ TranscriptionService.transcribe()       │                  │
│   │ • Read video from: public/{publicPath}  │                  │
│   │ • Extract audio with ffmpeg → temp.wav  │                  │
│   │ • Send to OpenAI Whisper API            │                  │
│   │ • Parse word-level timestamps           │                  │
│   │ • Clean up temp files                   │                  │
│   └─────────────────────────────────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│   VideoTranscript {                                             │
│     text: "Hello world...",                                     │
│     words: [{text, start, end}, ...],                          │
│     speechDensity: 2.5  // words/sec                           │
│   }                                                             │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ Classifier                              │                  │
│   │ • speechDensity > 2.0 → A-roll          │                  │
│   │ • speechDensity < 0.3 → B-roll          │                  │
│   └─────────────────────────────────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│   Correct A-roll/B-roll classification!                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Questions Before Proceeding

1. **Transcription Service**: Should we use OpenAI Whisper (current) or switch to Deepgram (potentially faster, documented in context)?

2. **File Naming**: Should we use `nanoid` short IDs (`-abc123`) or timestamps (`-1706214123456`)?

3. **Caching**: Where should transcript cache live? Options:
   - `.cache/transcripts/` (gitignored)
   - `public/assets/.cache/` (alongside files)
   - Database (if we add one later)

4. **Parallel Processing**: How many concurrent transcriptions? (2-4 recommended for API rate limits)

5. **Error Handling**: For videos that fail transcription:
   - Retry with exponential backoff?
   - Mark as "no speech detected"?
   - Fail the entire pipeline?

---

## Approval Required

Before implementing, please confirm:

- [ ] Solution A1 (Server-Side Transcription) approach is acceptable
- [ ] Solution B1 (Unique ID-Based Naming) approach is acceptable
- [ ] Any of the questions above need specific answers
- [ ] Any additional features to include (e.g., Deepgram integration)

Once approved, I'll implement both fixes and run the full Playwright test suite to verify everything works end-to-end.
