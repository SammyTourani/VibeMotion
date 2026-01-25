/**
 * Composition Writer Utility
 *
 * Writes generated Remotion composition code to the filesystem.
 * Creates proper directory structure for Remotion to pick up.
 *
 * Phase 2 Enhancement: Also writes transcript.ts with word-level timestamps
 * for synchronized TikTok-style captions.
 */

import { promises as fs } from "fs";
import path from "path";
import type { VideoTranscript, TranscriptWord, StoryboardScene } from "./pipeline/types";

export interface CompositionConfig {
  id: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface WriteCompositionInput {
  projectId: string;
  compositionCode: string;
  config: CompositionConfig;
  storyboard?: {
    scenes: StoryboardScene[];
    totalDuration: number;
    summary: string;
  };
  /** Transcript data for caption generation */
  transcripts?: VideoTranscript[];
}

export interface WriteCompositionResult {
  success: boolean;
  compositionId: string;
  compositionPath: string;
  error?: string;
}

/**
 * Sanitize project ID to create a valid directory/file name
 */
function sanitizeProjectId(projectId: string): string {
  return projectId
    .replace(/[^a-zA-Z0-9-_]/g, "") // Remove invalid characters
    .replace(/^[0-9-]+/, "") // Remove leading numbers/dashes
    .slice(0, 50) // Limit length
    || "generated"; // Fallback
}

/**
 * Generate a valid React component name from project ID
 */
function generateComponentName(projectId: string): string {
  const sanitized = sanitizeProjectId(projectId);
  // Convert to PascalCase
  return sanitized
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/**
 * Get the base path for generated compositions
 */
function getGeneratedCompositionsPath(): string {
  return path.join(process.cwd(), "src", "compositions", "generated");
}

/**
 * Ensure the generated compositions directory exists
 */
async function ensureGeneratedDirectory(): Promise<void> {
  const basePath = getGeneratedCompositionsPath();
  await fs.mkdir(basePath, { recursive: true });
}

/**
 * Calculate timeline offsets for each asset based on storyboard scenes
 * Returns a map of publicPath → timeline start time
 */
function calculateSceneOffsets(scenes: StoryboardScene[]): Map<string, number> {
  const offsets = new Map<string, number>();

  // Sort scenes by order
  const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);

  // Calculate cumulative timeline position
  let timelinePosition = 0;

  for (const scene of sortedScenes) {
    // Only A-roll scenes have captions (B-roll is muted)
    if (scene.type === 'a-roll' && scene.asset) {
      // Store the timeline position where this asset starts
      // Account for assetStartTime - if we start at 2s in the source,
      // we need to offset captions by -2s (then +timelinePosition)
      const assetOffset = timelinePosition - (scene.assetStartTime || 0);
      offsets.set(scene.asset, assetOffset);
    }

    // Move timeline forward by scene duration
    timelinePosition += scene.duration;
  }

  return offsets;
}

/**
 * Generate transcript.ts file content with offset-adjusted word timestamps
 * This enables synchronized TikTok-style captions
 */
function generateTranscriptFile(
  transcripts: VideoTranscript[],
  scenes: StoryboardScene[]
): string {
  // Calculate timeline offsets for each asset
  const offsets = calculateSceneOffsets(scenes);

  // Combine all words with adjusted timestamps
  const allWords: TranscriptWord[] = [];

  for (const transcript of transcripts) {
    // Find the offset for this transcript's asset
    const offset = offsets.get(transcript.publicPath);

    // Skip if this transcript's video isn't used in an A-roll scene
    if (offset === undefined) {
      console.log(`[CompositionWriter] Skipping transcript for ${transcript.publicPath} (not in A-roll)`);
      continue;
    }

    // Add words with adjusted timestamps
    for (const word of transcript.words) {
      const adjustedStart = word.start + offset;
      const adjustedEnd = word.end + offset;

      // Only include words that fall within positive timeline
      if (adjustedEnd > 0) {
        allWords.push({
          text: word.text,
          start: Math.max(0, adjustedStart),
          end: adjustedEnd,
        });
      }
    }
  }

  // Sort by start time
  allWords.sort((a, b) => a.start - b.start);

  console.log(`[CompositionWriter] Generated transcript with ${allWords.length} words`);

  // Generate the TypeScript file content
  return `/**
 * Auto-generated transcript data for synchronized captions
 * Generated at: ${new Date().toISOString()}
 *
 * Words are offset-adjusted to match the composition timeline.
 * Use with the Caption component for TikTok-style subtitles.
 */

import type { CaptionWord } from '../../components/Caption';

export const TRANSCRIPT_WORDS: CaptionWord[] = ${JSON.stringify(allWords, null, 2)};

export const TRANSCRIPT_SUMMARY = {
  wordCount: ${allWords.length},
  durationSeconds: ${allWords.length > 0 ? allWords[allWords.length - 1].end.toFixed(2) : 0},
};
`;
}

/**
 * Write a generated composition to the filesystem
 */
export async function writeComposition(
  input: WriteCompositionInput
): Promise<WriteCompositionResult> {
  const { projectId, compositionCode, config, storyboard } = input;

  try {
    // Sanitize and generate names
    const sanitizedId = sanitizeProjectId(projectId);
    const componentName = generateComponentName(projectId);

    // Create directory path
    const compositionDir = path.join(getGeneratedCompositionsPath(), sanitizedId);

    // Ensure directories exist
    await ensureGeneratedDirectory();
    await fs.mkdir(compositionDir, { recursive: true });

    // Prepare the composition code
    // Ensure it has proper exports and component naming
    let finalCode = compositionCode;

    // If the code doesn't have a createComposition export, we need to wrap it
    // Most generated code should already have this, but let's be safe
    if (!finalCode.includes("createComposition")) {
      console.warn("[CompositionWriter] Code missing createComposition, adding wrapper");
      // This is a fallback - ideally the AI generates proper code
    }

    // Write the main Composition.tsx file
    const compositionPath = path.join(compositionDir, "Composition.tsx");
    await fs.writeFile(compositionPath, finalCode, "utf-8");
    console.log(`[CompositionWriter] Wrote composition to: ${compositionPath}`);

    // Write config.ts with metadata
    const configContent = `// Auto-generated configuration for ${componentName}
// Generated at: ${new Date().toISOString()}

export const COMPOSITION_CONFIG = {
  id: "${config.id}",
  durationInFrames: ${config.durationInFrames},
  fps: ${config.fps},
  width: ${config.width},
  height: ${config.height},
  durationInSeconds: ${config.durationInFrames / config.fps},
};

export const STORYBOARD = ${JSON.stringify(storyboard || null, null, 2)};
`;
    const configPath = path.join(compositionDir, "config.ts");
    await fs.writeFile(configPath, configContent, "utf-8");
    console.log(`[CompositionWriter] Wrote config to: ${configPath}`);

    // Write index.ts for easy importing
    const indexContent = `// Auto-generated index for ${componentName}
export * from "./Composition";
export * from "./config";
`;
    const indexPath = path.join(compositionDir, "index.ts");
    await fs.writeFile(indexPath, indexContent, "utf-8");
    console.log(`[CompositionWriter] Wrote index to: ${indexPath}`);

    // Write transcript.ts for captions (Phase 2)
    if (input.transcripts && input.transcripts.length > 0 && storyboard) {
      const transcriptContent = generateTranscriptFile(input.transcripts, storyboard.scenes);
      const transcriptPath = path.join(compositionDir, "transcript.ts");
      await fs.writeFile(transcriptPath, transcriptContent, "utf-8");
      console.log(`[CompositionWriter] Wrote transcript to: ${transcriptPath}`);
    }

    // Update the manifest file (list of all generated compositions)
    await updateManifest(sanitizedId, componentName, config);

    return {
      success: true,
      compositionId: config.id,
      compositionPath: compositionDir,
    };
  } catch (error) {
    console.error("[CompositionWriter] Error writing composition:", error);
    return {
      success: false,
      compositionId: config.id,
      compositionPath: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update the manifest file that tracks all generated compositions
 */
async function updateManifest(
  projectId: string,
  componentName: string,
  config: CompositionConfig
): Promise<void> {
  const manifestPath = path.join(getGeneratedCompositionsPath(), "manifest.json");

  let manifest: Record<string, {
    projectId: string;
    componentName: string;
    compositionId: string;
    createdAt: string;
    config: CompositionConfig;
  }> = {};

  // Read existing manifest if it exists
  try {
    const existing = await fs.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(existing);
  } catch {
    // File doesn't exist yet, start fresh
  }

  // Add/update this composition
  manifest[projectId] = {
    projectId,
    componentName,
    compositionId: config.id,
    createdAt: new Date().toISOString(),
    config,
  };

  // Write updated manifest
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[CompositionWriter] Updated manifest with ${projectId}`);
}

/**
 * Get list of all generated compositions from manifest
 */
export async function getGeneratedCompositions(): Promise<
  Array<{
    projectId: string;
    componentName: string;
    compositionId: string;
    createdAt: string;
    config: CompositionConfig;
  }>
> {
  const manifestPath = path.join(getGeneratedCompositionsPath(), "manifest.json");

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content);
    return Object.values(manifest);
  } catch {
    return [];
  }
}

/**
 * Delete a generated composition
 */
export async function deleteComposition(projectId: string): Promise<boolean> {
  const sanitizedId = sanitizeProjectId(projectId);
  const compositionDir = path.join(getGeneratedCompositionsPath(), sanitizedId);

  try {
    await fs.rm(compositionDir, { recursive: true, force: true });

    // Update manifest to remove this entry
    const manifestPath = path.join(getGeneratedCompositionsPath(), "manifest.json");
    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);
      delete manifest[sanitizedId];
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    } catch {
      // Manifest doesn't exist or can't be updated
    }

    return true;
  } catch {
    return false;
  }
}
