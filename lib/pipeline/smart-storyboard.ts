/**
 * Smart Storyboard Generator
 *
 * Creates an intelligent video edit using classified A-roll and B-roll footage.
 * Uses A-roll as the "narrative spine" and intercuts B-roll for visual interest.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  ClassificationResult,
  SmartStoryboard,
  StoryboardScene,
  PipelineConfig,
  MusicRecommendation,
  SceneType,
  TranscriptWord,
} from "./types";
import { validateTranscript } from "./transcript-validator";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

const MODEL_ID = "gemini-2.0-flash";

/**
 * Music settings presets by mood
 * These are tuned for background music that complements video content
 * without overpowering A-roll speech
 */
const MUSIC_PRESETS: Record<string, Omit<MusicRecommendation, 'reasoning'>> = {
  upbeat: {
    mood: 'upbeat',
    volume: 0.25,
    fadeInSeconds: 0.5,
    fadeOutSeconds: 2,
  },
  chill: {
    mood: 'chill',
    volume: 0.20,
    fadeInSeconds: 1.5,
    fadeOutSeconds: 3,
  },
  dramatic: {
    mood: 'dramatic',
    volume: 0.30,
    fadeInSeconds: 0.3,
    fadeOutSeconds: 2,
  },
  energetic: {
    mood: 'energetic',
    volume: 0.30,
    fadeInSeconds: 0.2,
    fadeOutSeconds: 1,
  },
  corporate: {
    mood: 'corporate',
    volume: 0.15,
    fadeInSeconds: 1.0,
    fadeOutSeconds: 2,
  },
  none: {
    mood: 'none',
    volume: 0,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  },
};

/**
 * Get music recommendation based on config and content analysis
 */
function getMusicRecommendation(
  config: PipelineConfig,
  classification: ClassificationResult
): MusicRecommendation {
  const mood = config.musicMood || 'chill';

  if (mood === 'none') {
    return {
      ...MUSIC_PRESETS.none,
      reasoning: 'User disabled background music',
    };
  }

  const preset = MUSIC_PRESETS[mood] || MUSIC_PRESETS.chill;

  // Adjust volume based on A-roll presence
  // If there's significant speech, lower the music volume
  const hasSignificantSpeech = classification.summary.aRollCount > 0;
  const adjustedVolume = hasSignificantSpeech
    ? Math.min(preset.volume, 0.20) // Keep low if speech
    : preset.volume;

  return {
    mood: preset.mood,
    volume: adjustedVolume,
    fadeInSeconds: preset.fadeInSeconds,
    fadeOutSeconds: preset.fadeOutSeconds,
    reasoning: hasSignificantSpeech
      ? `${mood} music at reduced volume (${(adjustedVolume * 100).toFixed(0)}%) to not overpower speech`
      : `${mood} music at standard volume (${(adjustedVolume * 100).toFixed(0)}%)`,
  };
}

/**
 * Smart storyboard generation prompt
 *
 * CRITICAL: This prompt teaches the AI how A-roll and B-roll actually work
 * in professional video editing - B-roll is a VISUAL OVERLAY while A-roll
 * AUDIO continues underneath. They are NOT sequential!
 */
const STORYBOARD_PROMPT = `You are a professional video editor creating a compelling short-form video.

## HOW A-ROLL AND B-ROLL ACTUALLY WORK

CRITICAL CONCEPT - Audio Layering:
- A-roll = The MAIN narrative with CONTINUOUS AUDIO (speech, dialogue)
- B-roll = MUTED visual overlay that plays OVER the A-roll audio

Think of it like this timeline:
\`\`\`
AUDIO TRACK:  [====== A-roll audio (continuous) ======]
VIDEO TRACK:  [A-roll][B-roll overlay][A-roll][B-roll][A-roll]
\`\`\`

The A-roll AUDIO never stops - B-roll just temporarily replaces the VISUAL while the speaker's voice continues.

## EDITING PRINCIPLES

1. **Hook First**: Start with 2-3 second attention-grabbing title
2. **A-roll = Audio Spine**: A-roll audio plays CONTINUOUSLY
3. **B-roll = Visual Cutaway**: B-roll is ALWAYS MUTED, shows while A-roll audio plays
4. **NO TEXT OVERLAYS**: Never add explanatory text like "A-roll" or "B-roll" to the video
5. **Pacing**: Keep scenes 2-5 seconds for viral content
6. **CTA**: End with a call-to-action

## SCENE TYPES

- "title" = Text on screen (hook, CTA)
- "a-roll" = Main video with audio (the speaker)
- "b-roll-overlay" = MUTED visual that plays OVER a-roll audio (uses overlayOnAroll field)
- "content" = Text/graphics slide

## OUTPUT FORMAT (JSON only)

{
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "type": "title",
      "duration": 3,
      "text": "Hook text here",
      "animation": "zoom-in",
      "description": "Opening hook"
    },
    {
      "id": "scene-2",
      "order": 2,
      "type": "a-roll",
      "asset": "assets/videos/clip_0.mp4",
      "assetStartTime": 0,
      "duration": 10,
      "description": "Speaker talking - AUDIO PLAYS"
    },
    {
      "id": "scene-3",
      "order": 3,
      "type": "b-roll-overlay",
      "asset": "assets/videos/clip_1.mp4",
      "assetStartTime": 0,
      "duration": 3,
      "overlayOnAroll": "scene-2",
      "overlayStartTime": 3,
      "description": "B-roll visual at 3s into scene-2 while speaker AUDIO continues"
    }
  ],
  "totalDuration": 30,
  "summary": "One sentence describing the video",
  "narrativeFlow": "How the story unfolds"
}

RULES:
- Use EXACT asset paths provided (copy them exactly as shown)
- B-roll is ALWAYS type "b-roll-overlay" with overlayOnAroll reference
- B-roll overlayStartTime = when in the A-roll to show this visual
- NEVER add text like "A Role:" or "B Roll:" to the video content
- The viewer should NOT know which is A-roll vs B-roll - it should be seamless

## SILENCE TRIMMING (MANDATORY - Tighter Edits)

**CRITICAL**: When a clip has "⚠️ AUTO-TRIMMED FOR TIGHT EDIT" in its details:
- You MUST use the exact "assetStartTime" value provided
- You MUST use the exact "duration" value provided
- These values have been calculated to skip dead air and create professional pacing
- DO NOT use the original duration - use the trimmed values

Example: If a clip shows:
\`\`\`
Original duration: 10s
⚠️ AUTO-TRIMMED FOR TIGHT EDIT:
  MUST USE assetStartTime: 1.90s
  MUST USE duration: 5.20s
\`\`\`

Your scene should be:
\`\`\`json
{
  "asset": "assets/videos/clip.mp4",
  "assetStartTime": 1.9,
  "duration": 5.2
}
\`\`\`

This removes 4.8s of silence automatically for a tighter edit.`;


/**
 * Build the classification context for the AI
 *
 * IMPORTANT: We lead with the EXACT path to use, not the original filename.
 * We also clarify that A-roll = use audio, B-roll = always muted.
 */
function buildClipsContext(classification: ClassificationResult): string {
  const lines: string[] = [];

  lines.push("## A-ROLL CLIPS (Main Content - USE AUDIO)");
  lines.push("These clips have speech. Their AUDIO should play continuously.");
  lines.push("");

  const aRolls = classification.clips.filter((c) => c.role === "A-roll");
  if (aRolls.length === 0) {
    lines.push("No A-roll clips available - will need to use titles/text for narrative.");
  } else {
    aRolls.forEach((clip, i) => {
      lines.push(`### A-roll ${i + 1}`);
      lines.push(`- **USE THIS PATH**: \`${clip.publicPath}\``);
      lines.push(`- Original duration: ${clip.duration.toFixed(1)}s`);

      // Calculate trimmed values for deterministic application
      const trimStart = clip.recommendedTrimStart ?? 0;
      const trimEnd = clip.recommendedTrimEnd ?? clip.duration;
      const trimmedDuration = trimEnd - trimStart;
      const hasTrimming = trimStart > 0.1 || trimEnd < clip.duration - 0.1;

      if (hasTrimming) {
        // DETERMINISTIC: Tell the AI exactly what values to use
        lines.push(`- **⚠️ AUTO-TRIMMED FOR TIGHT EDIT**:`);
        lines.push(`  - **MUST USE assetStartTime**: ${trimStart.toFixed(2)}s`);
        lines.push(`  - **MUST USE duration**: ${trimmedDuration.toFixed(2)}s`);
        lines.push(`  - Reason: Trimmed ${(clip.duration - trimmedDuration).toFixed(1)}s of silence`);
      } else {
        lines.push(`- Effective duration: ${clip.duration.toFixed(1)}s (no trimming needed)`);
      }

      lines.push(`- Transcript: "${clip.transcript.slice(0, 200)}${clip.transcript.length > 200 ? '...' : ''}"`);
      if (clip.keyMoments && clip.keyMoments.length > 0) {
        lines.push(`- Key moments: ${clip.keyMoments.join(", ")}`);
      }
      lines.push(`- Use: VideoSlide component (plays audio)`);
      lines.push("");
    });
  }

  lines.push("## B-ROLL CLIPS (Visual Support - ALWAYS MUTED)");
  lines.push("These clips are VISUAL ONLY. They play OVER A-roll audio.");
  lines.push("Use BRollVideo component which is muted by default.");
  lines.push("");

  const bRolls = classification.clips.filter((c) => c.role === "B-roll");
  if (bRolls.length === 0) {
    lines.push("No B-roll clips available.");
  } else {
    bRolls.forEach((clip, i) => {
      lines.push(`### B-roll ${i + 1}`);
      lines.push(`- **USE THIS PATH**: \`${clip.publicPath}\``);
      lines.push(`- Duration: ${clip.duration.toFixed(1)}s`);
      lines.push(`- Use: BRollVideo component (muted by default)`);
      lines.push("");
    });
  }

  lines.push("## SUMMARY");
  lines.push(`- Total clips: ${classification.summary.totalClips}`);
  lines.push(`- A-roll: ${classification.summary.aRollCount} clips (use VideoSlide, plays audio)`);
  lines.push(`- B-roll: ${classification.summary.bRollCount} clips (use BRollVideo, always muted)`);
  lines.push(`- Total footage: ${classification.summary.totalDuration.toFixed(1)}s`);

  return lines.join("\n");
}

/**
 * Generate a smart storyboard using AI
 */
export async function generateSmartStoryboard(
  classification: ClassificationResult,
  config: PipelineConfig,
  userPrompt?: string
): Promise<SmartStoryboard> {
  console.log("[SmartStoryboard] Generating storyboard...");

  if (!genai) {
    console.log("[SmartStoryboard] No AI available, using fallback");
    return generateFallbackStoryboard(classification, config);
  }

  const clipsContext = buildClipsContext(classification);
  const targetDuration = config.targetDuration || 30;

  const userMessage = `Create a ${targetDuration}-second video using these classified clips:

${clipsContext}

VIDEO SETTINGS:
- Aspect ratio: ${config.aspectRatio}
- Style: ${config.style}
- Target duration: ${targetDuration} seconds
- Primary color: ${config.primaryColor || '#8B5CF6'}

${userPrompt ? `USER DIRECTION:\n${userPrompt}` : 'No specific direction - create an engaging video that showcases all the content.'}

Remember:
- Use EXACT paths from the clips above
- A-roll drives the story, B-roll supports it
- Keep it punchy and engaging
- Output valid JSON only`;

  try {
    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: userMessage,
      config: {
        systemInstruction: STORYBOARD_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    const responseText = response.text || "";

    // Parse JSON
    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const result = JSON.parse(cleanJson);

    // Build a lookup map from asset path to clip (for word-level transcripts)
    const clipsByPath = new Map(classification.clips.map(c => [c.publicPath, c]));

    // First pass: Parse all scenes from AI response
    const rawScenes: StoryboardScene[] = (result.scenes || []).map((scene: Record<string, unknown>, index: number) => {
      const assetPath = scene.asset as string | undefined;
      const assetStartTime = (scene.assetStartTime as number) || 0;
      const duration = Math.min((scene.duration as number) || 3, 10);

      return {
        id: (scene.id as string) || `scene-${index + 1}`,
        order: (scene.order as number) || index + 1,
        type: (scene.type as SceneType) || "content",
        asset: assetPath,
        assetStartTime,
        duration,
        text: scene.text as string | undefined,
        voiceover: scene.voiceover as string | undefined,
        animation: (scene.animation as string) || "fade-in",
        description: (scene.description as string) || "",
        // Preserve AI-provided overlay fields if present
        overlayOnAroll: scene.overlayOnAroll as string | undefined,
        overlayStartTime: scene.overlayStartTime as number | undefined,
      };
    });

    // Second pass: Separate sequential scenes from B-roll overlays
    // B-roll overlays should NOT advance the timeline - they play DURING A-roll
    const sequentialScenes: StoryboardScene[] = [];
    const bRollOverlays: StoryboardScene[] = [];

    for (const scene of rawScenes) {
      if (scene.type === "b-roll-overlay") {
        bRollOverlays.push(scene);
      } else {
        sequentialScenes.push(scene);
      }
    }

    // Third pass: Calculate timeline for sequential scenes only
    let compositionTime = 0;
    const aRollSceneMap = new Map<string, { scene: StoryboardScene; startTime: number; endTime: number }>();

    for (const scene of sequentialScenes) {
      scene.compositionStartTime = compositionTime;

      // Add word-level transcripts for A-roll scenes
      // Words are validated twice: once during transcription, once here
      if (scene.type === "a-roll" || scene.type === "video") {
        const clip = scene.asset ? clipsByPath.get(scene.asset) : null;
        if (clip?.words && clip.words.length > 0) {
          const assetStartTime = scene.assetStartTime || 0;
          const sceneEndTime = assetStartTime + scene.duration;

          // Filter words that fall within this scene's time window
          const rawWords: TranscriptWord[] = clip.words
            .filter(w => {
              // Word must be within scene bounds
              if (w.start < assetStartTime || w.end > sceneEndTime + 0.1) return false;
              // Word must have valid duration (not hallucinated)
              const duration = w.end - w.start;
              if (duration <= 0 || duration < 0.03) return false;
              // Word must have text
              if (!w.text || w.text.trim() === "") return false;
              return true;
            })
            .map(w => ({
              text: w.text,
              start: compositionTime + (w.start - assetStartTime),
              end: compositionTime + (w.end - assetStartTime),
            }));

          // Run validation to catch any remaining hallucinations
          const validation = validateTranscript(rawWords, { verbose: false });

          if (validation.stats.removedCount > 0) {
            console.log(`[SmartStoryboard] Removed ${validation.stats.removedCount} invalid words from scene ${scene.id}`);
          }

          scene.words = validation.validWords;
        }

        // Track A-roll scenes for B-roll overlay assignment
        aRollSceneMap.set(scene.id, {
          scene,
          startTime: compositionTime,
          endTime: compositionTime + scene.duration,
        });
      }

      compositionTime += scene.duration;
    }

    // Fourth pass: Fix B-roll overlays - assign them to A-roll scenes
    // VALIDATION RULES:
    // 1. Minimum overlay duration: 1 second (shorter appears as flash)
    // 2. Overlay must fit within parent A-roll
    // 3. Overlay start + duration must not exceed parent duration
    const MIN_OVERLAY_DURATION = 1.0; // seconds
    const aRollScenes = Array.from(aRollSceneMap.values());
    let aRollIndex = 0;

    // Pre-filter: remove overlays that are too short
    const viableOverlays = bRollOverlays.filter(overlay => {
      if (overlay.duration < MIN_OVERLAY_DURATION) {
        console.log(`[SmartStoryboard] Rejecting B-roll ${overlay.id}: duration ${overlay.duration}s < minimum ${MIN_OVERLAY_DURATION}s`);
        return false;
      }
      return true;
    });

    for (const overlay of viableOverlays) {
      // If AI already provided proper overlay reference, validate and use it
      if (overlay.overlayOnAroll && aRollSceneMap.has(overlay.overlayOnAroll)) {
        const parent = aRollSceneMap.get(overlay.overlayOnAroll)!;

        // Calculate safe overlay start time
        // Ensure overlay fits within parent: startTime + duration <= parentDuration
        const maxStartTime = Math.max(0, parent.scene.duration - overlay.duration - 0.2);
        const proposedStartTime = overlay.overlayStartTime ?? Math.min(1.5, maxStartTime);
        overlay.overlayStartTime = Math.min(proposedStartTime, maxStartTime);

        // Validate the overlay actually fits
        if (overlay.overlayStartTime + overlay.duration > parent.scene.duration) {
          // Trim overlay duration to fit
          const newDuration = parent.scene.duration - overlay.overlayStartTime - 0.1;
          if (newDuration >= MIN_OVERLAY_DURATION) {
            console.log(`[SmartStoryboard] Trimmed B-roll ${overlay.id} from ${overlay.duration}s to ${newDuration}s to fit parent`);
            overlay.duration = newDuration;
          } else {
            // Can't fit, skip this overlay
            console.log(`[SmartStoryboard] Skipping B-roll ${overlay.id}: can't fit within parent ${parent.scene.id}`);
            overlay.overlayOnAroll = undefined;
          }
        }
        continue;
      }

      // Otherwise, assign to next available A-roll scene
      if (aRollIndex < aRollScenes.length) {
        const parent = aRollScenes[aRollIndex];

        // Only use this A-roll if it's long enough for the overlay
        // Need at least: overlay duration + 1s buffer (0.5s start offset + 0.5s end buffer)
        if (parent.scene.duration >= overlay.duration + 1.5) {
          overlay.overlayOnAroll = parent.scene.id;
          // Start overlay 1 second into the A-roll (but ensure it fits)
          const maxStartTime = parent.scene.duration - overlay.duration - 0.5;
          overlay.overlayStartTime = Math.min(1.0, maxStartTime);
          aRollIndex++;
          console.log(`[SmartStoryboard] Assigned B-roll ${overlay.id} (${overlay.duration}s) to overlay ${parent.scene.id} at ${overlay.overlayStartTime}s`);
        } else {
          // A-roll too short, try next one
          console.log(`[SmartStoryboard] A-roll ${parent.scene.id} (${parent.scene.duration}s) too short for B-roll ${overlay.id} (${overlay.duration}s)`);
          aRollIndex++;
        }
      }
    }

    // Combine sequential scenes with properly configured overlays
    // Filter out overlays that couldn't be assigned or are invalid
    const validOverlays = viableOverlays.filter(o => {
      if (!o.overlayOnAroll) return false;
      // Final validation: overlay must have valid timing
      if (o.overlayStartTime === undefined || o.overlayStartTime < 0) return false;
      if (o.duration < MIN_OVERLAY_DURATION) return false;
      return true;
    });
    const scenes: StoryboardScene[] = [...sequentialScenes, ...validOverlays];

    // Re-sort by order
    scenes.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Get music recommendation based on config and content
    const music = getMusicRecommendation(config, classification);

    // Calculate total duration from sequential scenes only (overlays don't add time)
    const totalDuration = sequentialScenes.reduce((sum, s) => sum + s.duration, 0);

    const storyboard: SmartStoryboard = {
      scenes,
      totalDuration, // Use calculated duration from sequential scenes only
      summary: result.summary || "Generated video",
      narrativeFlow: result.narrativeFlow || "Standard flow",
      music,
    };

    console.log(`[SmartStoryboard] Generated ${scenes.length} scenes (${sequentialScenes.length} sequential + ${validOverlays.length} overlays), ${totalDuration}s total`);
    console.log(`[SmartStoryboard] Music: ${music.mood} at ${(music.volume * 100).toFixed(0)}% volume`);
    return storyboard;

  } catch (error) {
    console.error("[SmartStoryboard] AI generation failed:", error);
    return generateFallbackStoryboard(classification, config);
  }
}

/**
 * Generate a basic storyboard without AI (fallback)
 *
 * CRITICAL: B-roll scenes are created as OVERLAYS on A-roll, NOT sequential scenes.
 * This ensures A-roll audio continues playing while B-roll visuals appear.
 *
 * Architecture:
 * - A-roll scenes form the sequential timeline (audio spine)
 * - B-roll-overlay scenes appear during A-roll scenes (visual cutaways)
 * - Audio NEVER stops - B-roll is always muted
 */
function generateFallbackStoryboard(
  classification: ClassificationResult,
  config: PipelineConfig
): SmartStoryboard {
  console.log("[SmartStoryboard] Using fallback storyboard generation (with proper B-roll overlays)");

  const scenes: StoryboardScene[] = [];
  const targetDuration = config.targetDuration || 30;
  let currentTime = 0;
  let sceneIndex = 1;

  // Scene 1: Title
  scenes.push({
    id: `scene-${sceneIndex++}`,
    order: scenes.length + 1,
    type: "title",
    duration: 3,
    text: "Watch This!",
    animation: "zoom-in",
    description: "Opening hook",
  });
  currentTime += 3;

  // Separate A-roll (with speech) and B-roll (no speech)
  const aRolls = classification.clips.filter((c) => c.role === "A-roll");
  const bRolls = classification.clips.filter((c) => c.role === "B-roll");

  console.log(`[SmartStoryboard] Found ${aRolls.length} A-roll clips, ${bRolls.length} B-roll clips`);

  // Track A-roll scenes for B-roll overlay references
  const aRollScenes: { id: string; startTime: number; duration: number }[] = [];
  let bRollIndex = 0;

  // First pass: Add all A-roll clips as the audio spine
  for (const clip of aRolls) {
    if (currentTime >= targetDuration - 3) break;

    // AUTO-APPLY SILENCE TRIMMING
    const trimStart = clip.recommendedTrimStart ?? 0;
    const trimEnd = clip.recommendedTrimEnd ?? clip.duration;
    const trimmedDuration = trimEnd - trimStart;

    // Use trimmed duration, allowing longer clips for better narrative
    const effectiveDuration = Math.min(trimmedDuration, 8, targetDuration - currentTime - 3);

    if (effectiveDuration > 0) {
      // Adjust word timestamps for trimming and composition timeline
      const adjustedWords = (clip.words || [])
        .filter(w => w.start >= trimStart && w.end <= (trimStart + effectiveDuration))
        .map(w => ({
          ...w,
          start: currentTime + (w.start - trimStart),
          end: currentTime + (w.end - trimStart),
        }));

      const sceneId = `scene-${sceneIndex++}`;
      scenes.push({
        id: sceneId,
        order: scenes.length + 1,
        type: "a-roll",
        asset: clip.publicPath,
        assetStartTime: trimStart,
        compositionStartTime: currentTime,
        duration: effectiveDuration,
        description: `A-roll: ${clip.name}${trimStart > 0.1 ? ' (auto-trimmed)' : ''}`,
        words: adjustedWords,
      });

      // Track for B-roll overlay placement
      aRollScenes.push({
        id: sceneId,
        startTime: currentTime,
        duration: effectiveDuration,
      });

      currentTime += effectiveDuration;
    }
  }

  // Second pass: Add B-roll as OVERLAYS on A-roll scenes
  // B-roll appears during A-roll scenes, NOT as separate timeline blocks
  for (const aRollScene of aRollScenes) {
    // Only add B-roll overlays if we have B-roll clips left
    if (bRollIndex >= bRolls.length) break;

    // Skip if A-roll scene is too short for overlay
    if (aRollScene.duration < 2) continue;

    const bRollClip = bRolls[bRollIndex++];
    const bRollDuration = Math.min(bRollClip.duration, 3, aRollScene.duration - 1);

    if (bRollDuration > 0) {
      // Calculate when within the A-roll to show B-roll
      // Start B-roll overlay 1-2 seconds into A-roll, not at the beginning
      const overlayStartTime = Math.min(1.5, aRollScene.duration - bRollDuration - 0.5);

      scenes.push({
        id: `scene-${sceneIndex++}`,
        order: scenes.length + 1,
        type: "b-roll-overlay", // OVERLAY type, not sequential
        asset: bRollClip.publicPath,
        assetStartTime: 0,
        duration: bRollDuration,
        description: `B-roll overlay during ${aRollScene.id}: ${bRollClip.name}`,
        overlayOnAroll: aRollScene.id, // Reference to parent A-roll
        overlayStartTime: overlayStartTime, // When in A-roll to show overlay
      });

      console.log(`[SmartStoryboard] Added B-roll overlay on ${aRollScene.id} at ${overlayStartTime}s`);
    }
  }

  // Final CTA scene
  scenes.push({
    id: `scene-${sceneIndex}`,
    order: scenes.length + 1,
    type: "cta",
    duration: 3,
    text: "Follow for more!",
    animation: "slide-up",
    description: "Call to action",
  });

  // Calculate total duration from sequential scenes only (not overlays)
  const totalDuration = scenes
    .filter(s => s.type !== "b-roll-overlay")
    .reduce((sum, s) => sum + s.duration, 0);

  // Get music recommendation
  const music = getMusicRecommendation(config, classification);

  console.log(`[SmartStoryboard] Generated storyboard: ${scenes.length} scenes (${aRollScenes.length} A-roll + ${Math.min(bRollIndex, bRolls.length)} B-roll overlays), ${totalDuration}s total`);

  return {
    scenes,
    totalDuration,
    summary: "Auto-generated video from uploaded clips",
    narrativeFlow: "Title → Main content with B-roll cutaways → Call to action",
    music,
  };
}

/**
 * Validate that all asset paths in storyboard exist in classification
 */
export function validateStoryboard(
  storyboard: SmartStoryboard,
  classification: ClassificationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validPaths = new Set(classification.clips.map((c) => c.publicPath));

  for (const scene of storyboard.scenes) {
    if (scene.asset && !validPaths.has(scene.asset)) {
      errors.push(`Scene ${scene.id}: Asset path "${scene.asset}" not found in uploaded clips`);
    }

    if (scene.duration <= 0) {
      errors.push(`Scene ${scene.id}: Invalid duration ${scene.duration}`);
    }

    if (scene.assetStartTime && scene.assetStartTime < 0) {
      errors.push(`Scene ${scene.id}: Invalid start time ${scene.assetStartTime}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
