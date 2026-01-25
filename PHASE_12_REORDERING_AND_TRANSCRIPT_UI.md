# Phase 12: Smart Reordering & Interactive Transcript UI

## Executive Summary

Build two interconnected features that leverage our new transcription system:

1. **Smart Clip Reordering**: AI analyzes all transcripts to determine optimal narrative order
2. **Interactive Transcript Panel**: Click any word to jump to that exact moment in the video

---

## Part A: Smart Clip Reordering System

### The Problem

Currently, clips are processed in upload order. But a creator might upload clips out of sequence:
- Clip 1: "...and that's how we won the hackathon!"
- Clip 2: "We're at the Stan hackathon..."
- Clip 3: "48 hours later, we finally finished..."

The AI should recognize this is out of order and resequence to: 2 → 3 → 1

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SMART REORDERING FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Transcription Complete                                        │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ Narrative Analyzer                       │                  │
│   │ • Extract key topics from each clip      │                  │
│   │ • Identify temporal markers (then, now)  │                  │
│   │ • Detect intro/outro patterns            │                  │
│   │ • Find topic continuity chains           │                  │
│   └─────────────────────────────────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ AI Reorder Engine (Gemini)              │                  │
│   │ • Receive all transcripts + metadata     │                  │
│   │ • Analyze narrative flow                 │                  │
│   │ • Return optimal clip order              │                  │
│   │ • Provide reasoning for each decision    │                  │
│   └─────────────────────────────────────────┘                  │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────┐                  │
│   │ Apply Reordering                        │                  │
│   │ • Update clip order in classification   │                  │
│   │ • Adjust transcript timestamps          │                  │
│   │ • Pass to storyboard generator          │                  │
│   └─────────────────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### New File: `lib/pipeline/narrative-reorder.ts`

```typescript
/**
 * Smart Narrative Reordering
 *
 * Analyzes transcripts to determine optimal clip order for storytelling.
 */

import { GoogleGenAI } from "@google/genai";
import type { VideoTranscript } from "./types";

interface ClipContext {
  clipId: string;
  publicPath: string;
  transcript: string;
  wordCount: number;
  duration: number;
  // Extracted features
  topics: string[];
  temporalMarkers: string[];
  isIntro: boolean;
  isOutro: boolean;
  mentionedClipIds: string[]; // References to other clips
}

interface ReorderResult {
  originalOrder: string[];
  suggestedOrder: string[];
  reasoning: string;
  confidence: number;
  changes: {
    clipId: string;
    from: number;
    to: number;
    reason: string;
  }[];
}

const REORDER_PROMPT = `You are a video editor AI analyzing transcripts to determine the best narrative order.

## Clips to Analyze

{{CLIPS_CONTEXT}}

## Your Task

Analyze these clips and determine the optimal order for a coherent narrative. Consider:

1. **Chronological Flow**: Look for temporal markers ("first", "then", "finally", "48 hours later")
2. **Introduction Detection**: Which clip introduces the topic/person/event?
3. **Conclusion Detection**: Which clip wraps up or has a call-to-action?
4. **Topic Continuity**: Which clips naturally follow each other based on subject matter?
5. **Speaker Transitions**: Maintain natural flow when speakers change

## Response Format (JSON)

{
  "suggestedOrder": ["clip_id_1", "clip_id_2", ...],
  "reasoning": "Brief explanation of the overall narrative structure",
  "confidence": 0.85,
  "changes": [
    {
      "clipId": "clip_id",
      "from": 0,
      "to": 2,
      "reason": "This clip contains the introduction"
    }
  ]
}

IMPORTANT: Only suggest reordering if you're confident it improves the narrative. If clips seem fine in their current order, return them unchanged with high confidence.`;

export async function analyzeAndReorder(
  transcripts: VideoTranscript[]
): Promise<ReorderResult> {
  // Build context for each clip
  const clipContexts = transcripts.map((t, i) => ({
    clipId: t.assetId,
    index: i,
    transcript: t.text,
    wordCount: t.wordCount,
    duration: t.duration,
  }));

  // Format for AI
  const clipsContext = clipContexts.map((c, i) =>
    `### Clip ${i + 1} (ID: ${c.clipId})
Duration: ${c.duration.toFixed(1)}s | Words: ${c.wordCount}
Transcript: "${c.transcript}"`
  ).join('\n\n');

  const prompt = REORDER_PROMPT.replace('{{CLIPS_CONTEXT}}', clipsContext);

  // Call Gemini for analysis
  const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const model = genai.models.get("gemini-2.0-flash");

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = JSON.parse(response.text || "{}");

  return {
    originalOrder: transcripts.map(t => t.assetId),
    suggestedOrder: result.suggestedOrder || transcripts.map(t => t.assetId),
    reasoning: result.reasoning || "No changes needed",
    confidence: result.confidence || 1.0,
    changes: result.changes || [],
  };
}

/**
 * Apply reordering to transcripts
 */
export function applyReorder(
  transcripts: VideoTranscript[],
  newOrder: string[]
): VideoTranscript[] {
  const transcriptMap = new Map(transcripts.map(t => [t.assetId, t]));
  return newOrder
    .map(id => transcriptMap.get(id))
    .filter((t): t is VideoTranscript => t !== undefined);
}
```

### Integration into Pipeline

Update `lib/pipeline/orchestrator.ts` to include reordering phase:

```typescript
// After transcription, before classification
const reorderResult = await this.reorderPhase(transcripts);
if (reorderResult.changes.length > 0) {
  transcripts = applyReorder(transcripts, reorderResult.suggestedOrder);
  this.emit({
    type: 'reorder_complete',
    originalOrder: reorderResult.originalOrder,
    newOrder: reorderResult.suggestedOrder,
    reasoning: reorderResult.reasoning,
  });
}
```

---

## Part B: Interactive Transcript Panel

### The Vision

A sidebar panel that shows the complete transcript with:
- Words grouped by clip
- Current word highlighted during playback
- Click any word to seek to that timestamp
- Visual indicators for clip boundaries

### UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│ TRANSCRIPT                                            [Minimize]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ Clip 1: img_7335_0.mov (0:00 - 0:10) ───────────────────────│
│ │                                                               │
│ │  We're at the [Stan] [hackathon] and I'll be                 │
│ │  [documenting] his [journey] over the next                   │
│ │  [48] [hours].                                                │
│ │                                                               │
│ └───────────────────────────────────────────────────────────────│
│                                                                 │
│ ┌─ Clip 2: img_7334_1.mov (0:10 - 0:16) ───────────────────────│
│ │                                                               │
│ │  So [follow] to see if a [19] year old can                   │
│ │  [beat] 60 of the city's best [engineering]                  │
│ │  [talent] for $[20,000].                                     │
│ │                                                               │
│ └───────────────────────────────────────────────────────────────│
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│ Total: 2 clips | 40 words | 16.0s                              │
└─────────────────────────────────────────────────────────────────┘

Legend:
- [word] = clickable word
- Currently playing word is highlighted in purple
- Clip boundaries shown with headers
```

### New Component: `components/TranscriptPanel.tsx`

```tsx
/**
 * Interactive Transcript Panel
 *
 * Displays the full transcript with clickable words that seek to timestamps.
 */

'use client';

import React, { useCallback, useMemo } from 'react';

interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  clipId?: string;
  clipName?: string;
}

interface ClipTranscript {
  clipId: string;
  clipName: string;
  startTime: number;
  endTime: number;
  words: TranscriptWord[];
}

interface TranscriptPanelProps {
  clips: ClipTranscript[];
  currentTime: number; // Current playback time in seconds
  onSeek: (time: number) => void;
  isVisible?: boolean;
  onToggle?: () => void;
}

export function TranscriptPanel({
  clips,
  currentTime,
  onSeek,
  isVisible = true,
  onToggle,
}: TranscriptPanelProps) {
  // Find currently active word
  const activeWordIndex = useMemo(() => {
    for (const clip of clips) {
      for (let i = 0; i < clip.words.length; i++) {
        const word = clip.words[i];
        if (currentTime >= word.start && currentTime < word.end) {
          return { clipId: clip.clipId, wordIndex: i };
        }
      }
    }
    return null;
  }, [clips, currentTime]);

  const handleWordClick = useCallback((time: number) => {
    onSeek(time);
  }, [onSeek]);

  const totalWords = clips.reduce((sum, c) => sum + c.words.length, 0);
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.endTime), 0);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-20 bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors"
      >
        Show Transcript
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border-l border-zinc-800 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-white font-medium">Transcript</h3>
        <button
          onClick={onToggle}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable transcript */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {clips.map((clip) => (
          <ClipSection
            key={clip.clipId}
            clip={clip}
            activeWordIndex={
              activeWordIndex?.clipId === clip.clipId
                ? activeWordIndex.wordIndex
                : null
            }
            onWordClick={handleWordClick}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500">
        {clips.length} clips | {totalWords} words | {totalDuration.toFixed(1)}s
      </div>
    </div>
  );
}

interface ClipSectionProps {
  clip: ClipTranscript;
  activeWordIndex: number | null;
  onWordClick: (time: number) => void;
}

function ClipSection({ clip, activeWordIndex, onWordClick }: ClipSectionProps) {
  return (
    <div className="rounded-lg bg-zinc-800/50 overflow-hidden">
      {/* Clip header */}
      <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs text-zinc-300 font-medium truncate">
          {clip.clipName}
        </span>
        <span className="text-xs text-zinc-500 ml-auto">
          {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
        </span>
      </div>

      {/* Words */}
      <div className="p-3">
        <p className="text-sm leading-relaxed">
          {clip.words.map((word, i) => (
            <TranscriptWord
              key={`${word.start}-${i}`}
              word={word}
              isActive={activeWordIndex === i}
              onClick={() => onWordClick(word.start)}
            />
          ))}
        </p>
      </div>
    </div>
  );
}

interface TranscriptWordProps {
  word: TranscriptWord;
  isActive: boolean;
  onClick: () => void;
}

function TranscriptWord({ word, isActive, onClick }: TranscriptWordProps) {
  return (
    <span
      onClick={onClick}
      className={`
        cursor-pointer rounded px-0.5 transition-all duration-150
        ${isActive
          ? 'bg-purple-600 text-white'
          : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
        }
      `}
    >
      {word.text}{' '}
    </span>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### Integration into Sandbox Page

Update `app/sandbox/page.tsx`:

```tsx
// Add state for transcript panel
const [showTranscript, setShowTranscript] = useState(true);
const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);

// Build clip transcripts from storyboard
const clipTranscripts = useMemo(() => {
  if (!storyboard) return [];

  // Get A-roll scenes that have transcripts
  return storyboard.scenes
    .filter(s => s.type === 'a-roll' && s.words?.length > 0)
    .map(scene => ({
      clipId: scene.id,
      clipName: scene.asset?.split('/').pop() || scene.id,
      startTime: scene.compositionStartTime || 0,
      endTime: (scene.compositionStartTime || 0) + scene.duration,
      words: scene.words || [],
    }));
}, [storyboard]);

// Handle seek from transcript click
const handleTranscriptSeek = useCallback((time: number) => {
  if (previewRef.current) {
    previewRef.current.seekTo(time);
  }
}, []);

// In the layout, add the transcript panel
<div className="flex h-full">
  {/* Main content */}
  <div className="flex-1">
    {/* Existing preview/code panel */}
  </div>

  {/* Transcript panel */}
  {clipTranscripts.length > 0 && (
    <div className={`w-80 transition-all ${showTranscript ? '' : 'w-0'}`}>
      <TranscriptPanel
        clips={clipTranscripts}
        currentTime={currentPlaybackTime}
        onSeek={handleTranscriptSeek}
        isVisible={showTranscript}
        onToggle={() => setShowTranscript(!showTranscript)}
      />
    </div>
  )}
</div>
```

---

## Part C: Pipeline Event Updates

Add new events for the reordering phase:

```typescript
// lib/pipeline/types.ts

export type PipelineEventType =
  | 'phase_start'
  | 'phase_complete'
  | 'phase_progress'
  | 'phase_error'
  | 'transcript_ready'
  | 'reorder_suggested'    // NEW
  | 'reorder_applied'      // NEW
  | 'classification_ready'
  | 'storyboard_ready'
  | 'composition_ready'
  | 'pipeline_complete'
  | 'pipeline_error';

export interface ReorderEvent {
  type: 'reorder_suggested' | 'reorder_applied';
  originalOrder: string[];
  newOrder: string[];
  reasoning: string;
  confidence: number;
  changes: Array<{
    clipId: string;
    from: number;
    to: number;
    reason: string;
  }>;
}
```

---

## Part D: UI Updates for Reorder Feedback

Show the user when clips are reordered:

```tsx
// In sandbox page message handling

case 'reorder_applied':
  setMessages((prev) => [
    ...prev,
    {
      id: `msg-${Date.now()}-reorder`,
      role: 'assistant',
      content: `🔄 **Clips Reordered for Better Flow**\n\n${data.reasoning}\n\n${
        data.changes.map((c: any) =>
          `• Moved clip ${c.from + 1} → ${c.to + 1}: ${c.reason}`
        ).join('\n')
      }`,
      timestamp: new Date(),
    },
  ]);
  break;
```

---

## Implementation Plan

### Phase 1: Narrative Reordering (Day 1)
1. Create `lib/pipeline/narrative-reorder.ts`
2. Add `reorder` phase to orchestrator
3. Update pipeline events
4. Test with out-of-order clips

### Phase 2: Transcript Panel UI (Day 1-2)
1. Create `components/TranscriptPanel.tsx`
2. Add transcript state management to sandbox
3. Implement click-to-seek functionality
4. Add current word highlighting

### Phase 3: Integration & Polish (Day 2)
1. Connect transcript panel to Remotion player
2. Add reorder feedback messages
3. Handle edge cases (no transcripts, single clip)
4. Performance optimization for large transcripts

---

## Data Flow Diagram

```
Upload Complete
      │
      ▼
┌─────────────────┐
│  Transcription  │ ──────────────────────────────┐
│  (per clip)     │                               │
└────────┬────────┘                               │
         │                                        │
         ▼                                        │
┌─────────────────┐     ┌────────────────────┐   │
│  Smart Reorder  │ ──▶ │  Reorder Event     │   │
│  (Gemini AI)    │     │  (show to user)    │   │
└────────┬────────┘     └────────────────────┘   │
         │                                        │
         │  Reordered                             │
         │  Transcripts                           │
         ▼                                        ▼
┌─────────────────┐                    ┌─────────────────┐
│  Classification │                    │  Transcript     │
│  (A-roll/B-roll)│                    │  Panel UI       │
└────────┬────────┘                    │  (clickable)    │
         │                             └────────┬────────┘
         ▼                                      │
┌─────────────────┐                             │
│  Storyboard     │                             │
│  Generation     │                             │
└────────┬────────┘                             │
         │                                      │
         ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│  Composition    │                    │  Seek on Click  │
│  Code           │◀───────────────────│  (sync player)  │
└─────────────────┘                    └─────────────────┘
```

---

## Testing Checklist

### Reordering Tests
- [ ] 2 clips in wrong order → correctly reordered
- [ ] 3+ clips with clear intro/outro → detected
- [ ] Clips already in order → no changes (high confidence)
- [ ] Clips with no clear order → minimal changes
- [ ] Reorder reasoning shown to user

### Transcript Panel Tests
- [ ] All clips displayed with headers
- [ ] Words clickable → seeks to timestamp
- [ ] Current word highlighted during playback
- [ ] Scroll follows current word
- [ ] Panel toggleable (show/hide)
- [ ] Stats accurate (clips, words, duration)

### Integration Tests
- [ ] Full flow: Upload → Transcribe → Reorder → Generate
- [ ] Transcript syncs with preview player
- [ ] Reorder applies to final composition
- [ ] Performance with 10+ clips

---

## Questions to Consider

1. **Reorder Threshold**: Should we only reorder if confidence > 0.7?
2. **User Override**: Should users be able to manually reorder after AI suggestion?
3. **Transcript Editing**: Should users be able to correct transcription errors?
4. **Export Transcript**: Should there be a "Copy Transcript" button?

---

Ready to implement when approved!
