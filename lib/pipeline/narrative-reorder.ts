/**
 * Smart Narrative Reordering
 *
 * Analyzes transcripts to determine optimal clip order for storytelling.
 * Uses AI to understand narrative flow and resequence clips for maximum impact.
 *
 * Phase 12 Implementation
 */

import { GoogleGenAI } from "@google/genai";
import type { VideoTranscript } from "./types";

// ============================================
// Types
// ============================================

export interface ReorderChange {
  clipId: string;
  from: number;
  to: number;
  reason: string;
}

export interface ReorderResult {
  /** Original clip order (asset IDs) */
  originalOrder: string[];
  /** Suggested new order (asset IDs) */
  suggestedOrder: string[];
  /** Human-readable explanation of the reordering logic */
  reasoning: string;
  /** Confidence in the reordering (0-1) */
  confidence: number;
  /** Individual change explanations */
  changes: ReorderChange[];
  /** Whether reordering was applied (confidence > threshold) */
  applied: boolean;
}

// ============================================
// Constants
// ============================================

/** Minimum confidence to apply reordering (0.7 = 70%) */
const REORDER_CONFIDENCE_THRESHOLD = 0.7;

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

IMPORTANT:
- Only suggest reordering if you're confident it improves the narrative
- If clips seem fine in their current order, return them unchanged with high confidence
- Be conservative - only reorder when there's clear narrative benefit
- The "changes" array should only include clips that actually moved position`;

// ============================================
// Main Functions
// ============================================

/**
 * Analyze transcripts and suggest optimal narrative order
 */
export async function analyzeAndReorder(
  transcripts: VideoTranscript[]
): Promise<ReorderResult> {
  // Need at least 2 clips to reorder
  if (transcripts.length < 2) {
    return {
      originalOrder: transcripts.map((t) => t.assetId),
      suggestedOrder: transcripts.map((t) => t.assetId),
      reasoning: "Single clip - no reordering needed",
      confidence: 1.0,
      changes: [],
      applied: false,
    };
  }

  // Check for Google API key
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("[Reorder] Google API key not configured, skipping reorder");
    return {
      originalOrder: transcripts.map((t) => t.assetId),
      suggestedOrder: transcripts.map((t) => t.assetId),
      reasoning: "Reordering unavailable - API not configured",
      confidence: 1.0,
      changes: [],
      applied: false,
    };
  }

  // Skip if all clips have no transcripts (all B-roll)
  const hasContent = transcripts.some((t) => t.wordCount > 0);
  if (!hasContent) {
    return {
      originalOrder: transcripts.map((t) => t.assetId),
      suggestedOrder: transcripts.map((t) => t.assetId),
      reasoning: "No speech content detected - maintaining upload order",
      confidence: 1.0,
      changes: [],
      applied: false,
    };
  }

  try {
    // Build context for each clip
    const clipsContext = transcripts
      .map((t, i) => {
        const transcript = t.text.trim() || "(no speech)";
        return `### Clip ${i + 1} (ID: ${t.assetId})
Duration: ${t.duration.toFixed(1)}s | Words: ${t.wordCount}
Transcript: "${transcript}"`;
      })
      .join("\n\n");

    const prompt = REORDER_PROMPT.replace("{{CLIPS_CONTEXT}}", clipsContext);

    // Call Gemini for analysis
    const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "{}";
    const result = JSON.parse(resultText);

    const originalOrder = transcripts.map((t) => t.assetId);
    const suggestedOrder: string[] =
      result.suggestedOrder || transcripts.map((t) => t.assetId);

    // Validate suggested order contains all clip IDs
    const validOrder = validateOrder(originalOrder, suggestedOrder);

    // Calculate actual changes
    const changes: ReorderChange[] = result.changes || [];

    // Determine if we should apply the reorder
    const confidence = result.confidence || 0.5;
    const hasChanges = !arraysEqual(originalOrder, validOrder);
    const applied = hasChanges && confidence >= REORDER_CONFIDENCE_THRESHOLD;

    console.log(
      `[Reorder] Confidence: ${confidence.toFixed(2)}, Has changes: ${hasChanges}, Applied: ${applied}`
    );

    return {
      originalOrder,
      suggestedOrder: validOrder,
      reasoning: result.reasoning || "No changes needed",
      confidence,
      changes,
      applied,
    };
  } catch (error) {
    console.error("[Reorder] Analysis failed:", error);
    return {
      originalOrder: transcripts.map((t) => t.assetId),
      suggestedOrder: transcripts.map((t) => t.assetId),
      reasoning: "Reordering analysis failed - maintaining upload order",
      confidence: 1.0,
      changes: [],
      applied: false,
    };
  }
}

/**
 * Apply reordering to transcripts
 */
export function applyReorder(
  transcripts: VideoTranscript[],
  newOrder: string[]
): VideoTranscript[] {
  const transcriptMap = new Map(transcripts.map((t) => [t.assetId, t]));

  return newOrder
    .map((id) => transcriptMap.get(id))
    .filter((t): t is VideoTranscript => t !== undefined);
}

/**
 * Calculate the timeline offset for each transcript after reordering
 * Returns a map of assetId -> compositionStartTime
 */
export function calculateTimelineOffsets(
  transcripts: VideoTranscript[]
): Map<string, number> {
  const offsets = new Map<string, number>();
  let currentTime = 0;

  for (const transcript of transcripts) {
    offsets.set(transcript.assetId, currentTime);
    currentTime += transcript.duration;
  }

  return offsets;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Validate that suggested order contains exactly the same IDs as original
 */
function validateOrder(original: string[], suggested: string[]): string[] {
  const originalSet = new Set(original);
  const suggestedSet = new Set(suggested);

  // Check if all original IDs are in suggested
  for (const id of original) {
    if (!suggestedSet.has(id)) {
      console.warn(`[Reorder] Missing clip ${id} in suggested order, using original`);
      return original;
    }
  }

  // Check if suggested has any extra IDs
  for (const id of suggested) {
    if (!originalSet.has(id)) {
      console.warn(`[Reorder] Unknown clip ${id} in suggested order, using original`);
      return original;
    }
  }

  // Check same length
  if (original.length !== suggested.length) {
    console.warn("[Reorder] Length mismatch, using original order");
    return original;
  }

  return suggested;
}

/**
 * Check if two arrays are equal
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Get a human-readable summary of reordering changes
 */
export function formatReorderSummary(result: ReorderResult): string {
  if (!result.applied || result.changes.length === 0) {
    return result.reasoning;
  }

  const changeLines = result.changes.map(
    (c) => `  - Clip moved from position ${c.from + 1} to ${c.to + 1}: ${c.reason}`
  );

  return `${result.reasoning}\n\nChanges:\n${changeLines.join("\n")}`;
}
