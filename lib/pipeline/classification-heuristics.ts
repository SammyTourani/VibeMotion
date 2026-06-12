/**
 * A-Roll / B-Roll Classification Heuristics
 *
 * Pure, dependency-free classification logic extracted from `classifier.ts`.
 *
 * These functions decide whether a clip is A-roll (main content with meaningful
 * speech) or B-roll (supporting visuals) using only speech-density thresholds and
 * optional visual-analysis signals. They make NO network or model calls, so they
 * can run anywhere (including the heuristic-only `classifyClipsHeuristic` fallback)
 * without loading the Gemini SDK.
 */

import type {
  VideoTranscript,
  ClassifiedClip,
  ClassificationResult,
  ClipRole,
  VisualAnalysis,
} from "./types";

/** Speech density thresholds (words per second) */
export const THRESHOLDS = {
  A_ROLL_HIGH: 2.0, // words per second - definitely talking
  B_ROLL_LOW: 0.3, // words per second - definitely visual only
};

/**
 * Pre-classify clips using speech density AND visual analysis.
 * This provides a baseline before AI analysis.
 */
export function preClassifyBySpeechDensity(
  transcript: VideoTranscript,
  visualAnalysis?: VisualAnalysis
): { role: ClipRole; confidence: number } {
  const { speechDensity, wordCount, duration } = transcript;

  // If we have visual analysis, use it to inform the decision
  if (visualAnalysis) {
    // Visual shows person talking + high speech = definitely A-roll
    if (
      visualAnalysis.subjects.some(
        (s) =>
          s.toLowerCase().includes("person") ||
          s.toLowerCase().includes("face") ||
          s.toLowerCase().includes("speaker")
      ) &&
      visualAnalysis.actions.some(
        (a) =>
          a.toLowerCase().includes("talk") ||
          a.toLowerCase().includes("speak") ||
          a.toLowerCase().includes("camera")
      ) &&
      speechDensity >= 1.0
    ) {
      return { role: "A-roll", confidence: 0.95 };
    }

    // Visual suggests B-roll (scenery, products, hands only) + low speech
    if (
      visualAnalysis.suggestedRole === "B-roll" &&
      visualAnalysis.roleConfidence > 0.7 &&
      speechDensity < THRESHOLDS.A_ROLL_HIGH
    ) {
      return {
        role: "B-roll",
        confidence: Math.max(0.85, visualAnalysis.roleConfidence),
      };
    }

    // Visual suggests A-roll but no speech - might be intro/outro
    if (visualAnalysis.suggestedRole === "A-roll" && wordCount < 3) {
      // Lower confidence - AI should analyze
      return { role: "A-roll", confidence: 0.5 };
    }
  }

  // Fallback to speech-density-only heuristics

  // Empty or very short transcript = B-roll
  if (wordCount < 3 || duration < 1) {
    return { role: "B-roll", confidence: visualAnalysis ? 0.7 : 0.95 };
  }

  // High speech density = A-roll
  if (speechDensity >= THRESHOLDS.A_ROLL_HIGH) {
    return { role: "A-roll", confidence: 0.9 };
  }

  // Very low speech density = B-roll
  if (speechDensity <= THRESHOLDS.B_ROLL_LOW) {
    return { role: "B-roll", confidence: 0.85 };
  }

  // In between - needs AI analysis
  return {
    role: speechDensity > 1.0 ? "A-roll" : "B-roll",
    confidence: 0.5, // Low confidence, AI should verify
  };
}

/**
 * Generate default suggested use based on role
 */
export function generateDefaultSuggestedUse(
  role: ClipRole,
  transcript: VideoTranscript
): string {
  if (role === "A-roll") {
    if (transcript.duration > 10) {
      return "Use as main segment, consider trimming to key moments";
    }
    return "Use as primary content in sequence";
  } else {
    if (transcript.duration < 3) {
      return "Quick cutaway or transition shot";
    }
    return "Use to illustrate or support A-roll content";
  }
}

/**
 * Quick classification without AI (for testing/fallback)
 */
export function classifyClipsHeuristic(
  transcripts: VideoTranscript[]
): ClassificationResult {
  const clips: ClassifiedClip[] = transcripts.map((transcript) => {
    const { role, confidence } = preClassifyBySpeechDensity(transcript);

    return {
      assetId: transcript.assetId,
      publicPath: transcript.publicPath,
      name: transcript.publicPath.split("/").pop() || "unknown",
      role,
      confidence,
      transcript: transcript.text,
      words: transcript.words, // Word-level timestamps for transcript panel
      duration: transcript.duration,
      speechDensity: transcript.speechDensity,
      suggestedUse: generateDefaultSuggestedUse(role, transcript),
    };
  });

  const aRollClips = clips.filter((c) => c.role === "A-roll");
  const bRollClips = clips.filter((c) => c.role === "B-roll");
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const aRollDuration = aRollClips.reduce((sum, c) => sum + c.duration, 0);
  const aRollRatio = totalDuration > 0 ? aRollDuration / totalDuration : 0;

  return {
    clips,
    summary: {
      totalClips: clips.length,
      aRollCount: aRollClips.length,
      bRollCount: bRollClips.length,
      totalDuration,
      narrativeStrength:
        aRollRatio > 0.5 ? "strong" : aRollRatio > 0.25 ? "moderate" : "weak",
    },
  };
}
