/**
 * Sound Effects Generator
 *
 * Analyzes storyboard scenes to identify opportunities for sound effects,
 * generates them using ElevenLabs Sound Generation API, and saves them
 * to the public folder.
 */

import fs from "fs/promises";
import path from "path";
import type {
  SmartStoryboard,
  SFXOpportunity,
  GeneratedSFX,
  SFXType,
} from "./types";
import { generateSoundEffect, isConfigured } from "../elevenlabs";

/**
 * SFX presets for different opportunity types
 */
const SFX_PRESETS: Record<
  SFXType,
  { description: string; duration: number; volume: number }
> = {
  reveal: {
    description: "Cinematic whoosh impact sound for dramatic reveal",
    duration: 1.0,
    volume: 0.5,
  },
  transition: {
    description: "Quick subtle swoosh transition sound",
    duration: 0.5,
    volume: 0.35,
  },
  notification: {
    description: "Bright attention-grabbing ding notification sound",
    duration: 0.8,
    volume: 0.6,
  },
  ambient: {
    description: "Subtle atmospheric ambient sound",
    duration: 2.0,
    volume: 0.2,
  },
};

/**
 * Identify sound effect opportunities in a storyboard
 */
export function identifySFXOpportunities(
  storyboard: SmartStoryboard
): SFXOpportunity[] {
  const opportunities: SFXOpportunity[] = [];
  let currentTime = 0;

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const scene = storyboard.scenes[i];
    const prevScene = i > 0 ? storyboard.scenes[i - 1] : null;

    // Title scenes get a reveal sound
    if (scene.type === "title") {
      const preset = SFX_PRESETS.reveal;
      opportunities.push({
        id: `sfx-${scene.id}-reveal`,
        sceneId: scene.id,
        type: "reveal",
        description: `${preset.description} for title: "${scene.text?.slice(0, 30) || "title"}"`,
        startTime: currentTime,
        duration: preset.duration,
        volume: preset.volume,
      });
    }

    // CTA scenes get a notification sound
    if (scene.type === "cta") {
      const preset = SFX_PRESETS.notification;
      opportunities.push({
        id: `sfx-${scene.id}-notification`,
        sceneId: scene.id,
        type: "notification",
        description: `${preset.description} for call-to-action`,
        startTime: currentTime,
        duration: preset.duration,
        volume: preset.volume,
      });
    }

    // Transitions between different scene types
    if (prevScene) {
      const needsTransition =
        // Transition from title to video
        (prevScene.type === "title" &&
          (scene.type === "a-roll" || scene.type === "b-roll")) ||
        // Transition between A-roll and B-roll
        (prevScene.type === "a-roll" && scene.type === "b-roll") ||
        (prevScene.type === "b-roll" && scene.type === "a-roll") ||
        // Transition to CTA
        scene.type === "cta";

      if (needsTransition) {
        const preset = SFX_PRESETS.transition;
        opportunities.push({
          id: `sfx-transition-${i}`,
          sceneId: scene.id,
          type: "transition",
          description: `${preset.description} from ${prevScene.type} to ${scene.type}`,
          startTime: currentTime - 0.25, // Start slightly before scene change
          duration: preset.duration,
          volume: preset.volume,
        });
      }
    }

    currentTime += scene.duration;
  }

  console.log(
    `[SFX Generator] Identified ${opportunities.length} sound effect opportunities`
  );
  return opportunities;
}

/**
 * Generate sound effect files using ElevenLabs
 */
export async function generateSFXFiles(
  opportunities: SFXOpportunity[],
  projectId: string,
  maxEffects: number = 5
): Promise<GeneratedSFX[]> {
  if (!isConfigured()) {
    console.log(
      "[SFX Generator] ElevenLabs not configured, skipping SFX generation"
    );
    return [];
  }

  // Limit to maxEffects to control API usage
  const limitedOpportunities = opportunities.slice(0, maxEffects);
  const generatedSFX: GeneratedSFX[] = [];

  // Create output directory
  const sfxDir = path.join(process.cwd(), "public", "assets", "sfx", projectId);
  await fs.mkdir(sfxDir, { recursive: true });

  for (const opportunity of limitedOpportunities) {
    try {
      console.log(
        `[SFX Generator] Generating: ${opportunity.type} - ${opportunity.description.slice(0, 50)}...`
      );

      const result = await generateSoundEffect({
        text: opportunity.description,
        durationSeconds: opportunity.duration,
        promptInfluence: 0.3,
      });

      // Save to file
      const filename = `${opportunity.id}.mp3`;
      const filePath = path.join(sfxDir, filename);
      await fs.writeFile(filePath, result.audio);

      // Create public path
      const publicPath = `assets/sfx/${projectId}/${filename}`;

      generatedSFX.push({
        ...opportunity,
        path: publicPath,
      });

      console.log(`[SFX Generator] Generated: ${publicPath}`);
    } catch (error) {
      console.error(
        `[SFX Generator] Failed to generate ${opportunity.type}:`,
        error
      );
      // Continue with other SFX on error
    }
  }

  console.log(
    `[SFX Generator] Successfully generated ${generatedSFX.length}/${limitedOpportunities.length} sound effects`
  );
  return generatedSFX;
}

/**
 * Main entry point for SFX generation
 * Analyzes storyboard, generates sound effects, and returns updated storyboard
 */
export async function generateSFX(
  storyboard: SmartStoryboard,
  projectId: string,
  enabled: boolean = true
): Promise<GeneratedSFX[]> {
  if (!enabled) {
    console.log("[SFX Generator] Sound effects disabled by user");
    return [];
  }

  console.log("[SFX Generator] Starting sound effect generation...");

  // Identify opportunities
  const opportunities = identifySFXOpportunities(storyboard);

  if (opportunities.length === 0) {
    console.log("[SFX Generator] No sound effect opportunities found");
    return [];
  }

  // Generate SFX files
  const generatedSFX = await generateSFXFiles(opportunities, projectId);

  return generatedSFX;
}

/**
 * Build SFX section for composition prompt
 */
export function buildSFXPromptSection(sfx: GeneratedSFX[]): string {
  if (sfx.length === 0) {
    return "## Sound Effects\n- No sound effects generated";
  }

  const lines: string[] = [
    "## Sound Effects",
    "",
    "Add these sound effects using the Audio component from Remotion:",
    "```tsx",
    "import { Audio, staticFile } from 'remotion';",
    "```",
    "",
    "Each SFX should be in its own Sequence at the specified time:",
    "",
  ];

  for (const effect of sfx) {
    lines.push(`### ${effect.type.toUpperCase()} at ${effect.startTime.toFixed(1)}s`);
    lines.push(`- Path: \`${effect.path}\``);
    lines.push(`- Duration: ${effect.duration}s`);
    lines.push(`- Volume: ${effect.volume}`);
    lines.push(`- Usage:`);
    lines.push("```tsx");
    lines.push(`<Sequence from={secondsToFrames(${effect.startTime.toFixed(1)})} durationInFrames={secondsToFrames(${effect.duration})}>
  <Audio src={staticFile('${effect.path}')} volume={${effect.volume}} />
</Sequence>`);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
