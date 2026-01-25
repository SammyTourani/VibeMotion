/**
 * A-Roll / B-Roll Classifier
 *
 * Analyzes video transcripts AND visual content to classify footage as:
 * - A-roll: Main content with meaningful speech (talking head, narration)
 * - B-roll: Supporting visuals with minimal/no speech (scenery, actions)
 *
 * Now enhanced with visual analysis from Gemini Vision for smarter classification.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  VideoTranscript,
  ClassifiedClip,
  ClassificationResult,
  ClipRole,
  VisualAnalysis,
} from "./types";
import {
  getRecommendedStartTime,
  getRecommendedEndTime,
} from "./silence-detection";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

const MODEL_ID = "gemini-2.0-flash";

/** Speech density thresholds */
const THRESHOLDS = {
  A_ROLL_HIGH: 2.0, // words per second - definitely talking
  B_ROLL_LOW: 0.3,  // words per second - definitely visual only
};

/**
 * Classification prompt for Gemini - now includes visual analysis context
 */
const CLASSIFICATION_PROMPT = `You are a professional video editor analyzing footage for classification.

Your task: Determine if each clip is A-roll or B-roll based on BOTH its transcript AND visual analysis.

DEFINITIONS:
- **A-roll**: Primary footage with meaningful speech, narration, or dialogue. This is the "main content" that drives the story. Examples: interviews, tutorials, talking to camera, product explanations.

- **B-roll**: Supplementary footage with minimal/no speech. Used to illustrate, enhance, or provide visual interest. Examples: scenery shots, product close-ups, action sequences, establishing shots.

CLASSIFICATION RULES (in priority order):
1. Person talking to camera + meaningful speech → A-roll (high confidence)
2. Person visible + coherent sentences in transcript → A-roll
3. No speech but visual analysis shows person facing camera → likely A-roll intro/outro
4. Action shots, scenery, product close-ups with little/no speech → B-roll
5. Hands-only shots or demonstrations without clear narration → B-roll
6. If the visual suggests main content but audio is silent → could be A-roll intro needing voiceover

IMPORTANT: The visual analysis tells you WHAT you SEE, the transcript tells you WHAT you HEAR.
Combine both signals to make the best decision.

For each clip, also provide:
- A confidence score (0-1) for your classification
- A suggested use for the clip in the final video
- Key moments or phrases worth highlighting (for A-roll)

OUTPUT FORMAT (JSON only, no explanation):
{
  "clips": [
    {
      "assetId": "asset_123",
      "role": "A-roll" or "B-roll",
      "confidence": 0.95,
      "suggestedUse": "Use as main intro segment",
      "keyMoments": ["This is a great hook", "Important point here"]
    }
  ],
  "summary": {
    "narrativeStrength": "strong" | "moderate" | "weak"
  }
}`;

/**
 * Pre-classify clips using speech density AND visual analysis
 * This provides a baseline before AI analysis
 */
function preClassifyBySpeechDensity(
  transcript: VideoTranscript,
  visualAnalysis?: VisualAnalysis
): { role: ClipRole; confidence: number } {
  const { speechDensity, wordCount, duration } = transcript;

  // If we have visual analysis, use it to inform the decision
  if (visualAnalysis) {
    // Visual shows person talking + high speech = definitely A-roll
    if (
      visualAnalysis.subjects.some(s =>
        s.toLowerCase().includes("person") ||
        s.toLowerCase().includes("face") ||
        s.toLowerCase().includes("speaker")
      ) &&
      visualAnalysis.actions.some(a =>
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
      (visualAnalysis.suggestedRole === "B-roll" && visualAnalysis.roleConfidence > 0.7) &&
      speechDensity < THRESHOLDS.A_ROLL_HIGH
    ) {
      return { role: "B-roll", confidence: Math.max(0.85, visualAnalysis.roleConfidence) };
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
 * Use Gemini to classify clips with ambiguous speech density
 * Now includes visual analysis context for smarter decisions
 */
async function classifyWithAI(
  transcripts: VideoTranscript[],
  visualAnalyses?: Map<string, VisualAnalysis>
): Promise<Map<string, { role: ClipRole; confidence: number; suggestedUse: string; keyMoments?: string[] }>> {
  if (!genai) {
    throw new Error("Google API key not configured");
  }

  // Prepare clips data for AI - now includes visual context
  const clipsData = transcripts.map((t) => {
    const visual = visualAnalyses?.get(t.assetId);
    return {
      assetId: t.assetId,
      transcript: t.text.slice(0, 500), // Limit text for prompt size
      duration: t.duration,
      wordCount: t.wordCount,
      speechDensity: t.speechDensity.toFixed(2),
      // Include visual analysis if available
      visualAnalysis: visual ? {
        sceneDescription: visual.sceneDescription,
        subjects: visual.subjects,
        actions: visual.actions,
        mood: visual.mood,
        visualSuggestedRole: visual.suggestedRole,
        visualConfidence: visual.roleConfidence.toFixed(2),
      } : null,
    };
  });

  const userPrompt = `Classify these ${clipsData.length} video clips based on BOTH audio (transcript) and visual analysis:

${JSON.stringify(clipsData, null, 2)}

Remember:
- Consider both the transcript (what you HEAR) and visual analysis (what you SEE)
- If visual shows person talking to camera + speech exists → A-roll
- If visual shows scenery/products + no meaningful speech → B-roll
- Output ONLY valid JSON matching the specified format.`;

  try {
    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: userPrompt,
      config: {
        systemInstruction: CLASSIFICATION_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    const responseText = response.text || "";

    // Parse JSON response
    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const result = JSON.parse(cleanJson);
    const classifications = new Map<string, {
      role: ClipRole;
      confidence: number;
      suggestedUse: string;
      keyMoments?: string[];
    }>();

    for (const clip of result.clips || []) {
      classifications.set(clip.assetId, {
        role: clip.role as ClipRole,
        confidence: clip.confidence || 0.7,
        suggestedUse: clip.suggestedUse || "",
        keyMoments: clip.keyMoments,
      });
    }

    return classifications;
  } catch (error) {
    console.error("[Classifier] AI classification failed:", error);
    // Return empty map - will fall back to heuristic
    return new Map();
  }
}

/**
 * Main classification function
 * Combines heuristic pre-classification with AI analysis
 *
 * @param transcripts - Video transcripts with speech data
 * @param visualAnalyses - Optional visual analysis data for smarter classification
 */
export async function classifyClips(
  transcripts: VideoTranscript[],
  visualAnalyses?: Map<string, VisualAnalysis>
): Promise<ClassificationResult> {
  console.log(`[Classifier] Classifying ${transcripts.length} clips...`);
  if (visualAnalyses && visualAnalyses.size > 0) {
    console.log(`[Classifier] Using visual analysis for ${visualAnalyses.size} clips`);
  }

  // Step 1: Pre-classify using speech density + visual analysis
  const preClassified = transcripts.map((t) => ({
    transcript: t,
    visual: visualAnalyses?.get(t.assetId),
    preClass: preClassifyBySpeechDensity(t, visualAnalyses?.get(t.assetId)),
  }));

  // Step 2: Find clips that need AI analysis (low confidence)
  const needsAI = preClassified.filter((p) => p.preClass.confidence < 0.7);

  // Step 3: Get AI classifications for ambiguous clips
  let aiClassifications = new Map<string, {
    role: ClipRole;
    confidence: number;
    suggestedUse: string;
    keyMoments?: string[];
  }>();

  if (needsAI.length > 0 && genai) {
    console.log(`[Classifier] ${needsAI.length} clips need AI analysis`);
    aiClassifications = await classifyWithAI(
      needsAI.map((p) => p.transcript),
      visualAnalyses
    );
  }

  // Step 4: Combine results
  const clips: ClassifiedClip[] = preClassified.map(({ transcript, visual, preClass }) => {
    const aiResult = aiClassifications.get(transcript.assetId);

    // Use AI result if available and more confident
    const finalRole = aiResult && aiResult.confidence > preClass.confidence
      ? aiResult.role
      : preClass.role;

    const finalConfidence = aiResult && aiResult.confidence > preClass.confidence
      ? aiResult.confidence
      : preClass.confidence;

    // Calculate recommended trim points from silence analysis
    let recommendedTrimStart: number | undefined;
    let recommendedTrimEnd: number | undefined;

    if (transcript.words.length > 0) {
      recommendedTrimStart = getRecommendedStartTime(transcript.words);
      recommendedTrimEnd = getRecommendedEndTime(transcript.words, transcript.duration);
    }

    return {
      assetId: transcript.assetId,
      publicPath: transcript.publicPath,
      name: transcript.publicPath.split("/").pop() || "unknown",
      role: finalRole,
      confidence: finalConfidence,
      transcript: transcript.text,
      words: transcript.words, // Word-level timestamps for transcript panel
      duration: transcript.duration,
      speechDensity: transcript.speechDensity,
      suggestedUse: aiResult?.suggestedUse || generateDefaultSuggestedUse(finalRole, transcript),
      keyMoments: aiResult?.keyMoments,
      // Include visual analysis data if available
      visualDescription: visual?.sceneDescription,
      subjects: visual?.subjects,
      // Include silence analysis for trimming
      silenceAnalysis: transcript.silenceAnalysis,
      recommendedTrimStart,
      recommendedTrimEnd,
    };
  });

  // Step 5: Generate summary
  const aRollClips = clips.filter((c) => c.role === "A-roll");
  const bRollClips = clips.filter((c) => c.role === "B-roll");
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  // Determine narrative strength based on A-roll content
  let narrativeStrength: "strong" | "moderate" | "weak";
  const aRollDuration = aRollClips.reduce((sum, c) => sum + c.duration, 0);
  const aRollRatio = aRollDuration / totalDuration;

  if (aRollRatio > 0.5 && aRollClips.length >= 2) {
    narrativeStrength = "strong";
  } else if (aRollRatio > 0.25 || aRollClips.length >= 1) {
    narrativeStrength = "moderate";
  } else {
    narrativeStrength = "weak";
  }

  const result: ClassificationResult = {
    clips,
    summary: {
      totalClips: clips.length,
      aRollCount: aRollClips.length,
      bRollCount: bRollClips.length,
      totalDuration,
      narrativeStrength,
    },
  };

  console.log(
    `[Classifier] Complete: ${aRollClips.length} A-roll, ${bRollClips.length} B-roll, ` +
    `narrative strength: ${narrativeStrength}`
  );

  return result;
}

/**
 * Generate default suggested use based on role
 */
function generateDefaultSuggestedUse(role: ClipRole, transcript: VideoTranscript): string {
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
      narrativeStrength: aRollRatio > 0.5 ? "strong" : aRollRatio > 0.25 ? "moderate" : "weak",
    },
  };
}
