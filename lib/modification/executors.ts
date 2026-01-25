/**
 * Modification Executors
 *
 * Functions that execute specific modification intents and return
 * the operations needed to update the storyboard.
 */

import type { StoryboardScene } from '../pipeline/types';
import type { ModificationOperation, IntentClassification } from './types';

/**
 * Execute a reorder operation (swap scenes)
 */
export function executeReorder(
  scenes: StoryboardScene[],
  params: { scene1?: number; scene2?: number; sourceScene?: number; direction?: string; targetScene?: number }
): ModificationOperation[] {
  // Handle swap
  if (params.scene1 !== undefined && params.scene2 !== undefined) {
    const newOrder = scenes.map((s) => s.id);
    const idx1 = params.scene1;
    const idx2 = params.scene2;

    if (idx1 >= 0 && idx1 < newOrder.length && idx2 >= 0 && idx2 < newOrder.length) {
      [newOrder[idx1], newOrder[idx2]] = [newOrder[idx2], newOrder[idx1]];
      return [{ type: 'reorder', newOrder }];
    }
  }

  // Handle move before/after
  if (
    params.sourceScene !== undefined &&
    params.targetScene !== undefined &&
    params.direction
  ) {
    const newOrder = scenes.map((s) => s.id);
    const sourceIdx = params.sourceScene;
    const targetIdx = params.targetScene;

    if (
      sourceIdx >= 0 &&
      sourceIdx < newOrder.length &&
      targetIdx >= 0 &&
      targetIdx < newOrder.length
    ) {
      const [removed] = newOrder.splice(sourceIdx, 1);
      const insertIdx = params.direction === 'after' ? targetIdx + 1 : targetIdx;
      newOrder.splice(insertIdx > sourceIdx ? insertIdx - 1 : insertIdx, 0, removed);
      return [{ type: 'reorder', newOrder }];
    }
  }

  return [];
}

/**
 * Execute a duration change operation
 */
export function executeDurationChange(
  scenes: StoryboardScene[],
  targetSceneIds: string[],
  params: { newDuration?: number; adjustment?: number }
): ModificationOperation[] {
  return targetSceneIds
    .map((sceneId) => {
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) return null;

      let newDuration = scene.duration;
      if (params.newDuration) {
        newDuration = params.newDuration;
      } else if (params.adjustment) {
        // Adjust by ~30% or minimum 1 second
        const adjustAmount = Math.max(1, scene.duration * 0.3);
        newDuration = Math.max(1, scene.duration + params.adjustment * adjustAmount);
      }

      return {
        type: 'update' as const,
        sceneId,
        scene: { duration: Math.round(newDuration * 10) / 10 }, // Round to 1 decimal
      };
    })
    .filter(Boolean) as ModificationOperation[];
}

/**
 * Execute a content change operation
 */
export function executeContentChange(
  scenes: StoryboardScene[],
  targetSceneIds: string[],
  params: { newText?: string }
): ModificationOperation[] {
  if (!params.newText) return [];

  return targetSceneIds.map((sceneId) => ({
    type: 'update' as const,
    sceneId,
    scene: { text: params.newText },
  }));
}

/**
 * Execute a remove operation
 */
export function executeRemove(
  scenes: StoryboardScene[],
  targetSceneIds: string[]
): ModificationOperation[] {
  // Don't allow removing all scenes
  if (targetSceneIds.length >= scenes.length) {
    return [];
  }

  return targetSceneIds.map((sceneId) => ({
    type: 'delete' as const,
    sceneId,
  }));
}

/**
 * Execute a remove-word operation
 *
 * Finds all instances of a word in scene transcripts and adjusts
 * scene timing to skip those segments.
 *
 * Note: This is a simplified implementation that removes the word from
 * the transcript display. Full audio-level word removal would require
 * re-encoding the video, which is beyond the scope of storyboard modifications.
 */
export function executeRemoveWord(
  scenes: StoryboardScene[],
  params: { wordToRemove?: string }
): ModificationOperation[] {
  if (!params.wordToRemove) return [];

  const wordToRemove = params.wordToRemove.toLowerCase();
  const operations: ModificationOperation[] = [];

  for (const scene of scenes) {
    // Only process scenes with word-level transcripts
    if (!scene.words || scene.words.length === 0) continue;

    // Filter out the target word
    const filteredWords = scene.words.filter(
      (w) => w.text.toLowerCase().replace(/[^a-z]/g, '') !== wordToRemove
    );

    // If words were removed, update the scene
    if (filteredWords.length < scene.words.length) {
      const removedCount = scene.words.length - filteredWords.length;

      operations.push({
        type: 'update' as const,
        sceneId: scene.id,
        scene: {
          words: filteredWords,
          // Add a note about removed words
          description: scene.description + ` (removed ${removedCount} instance${removedCount > 1 ? 's' : ''} of "${wordToRemove}")`,
        },
      });
    }
  }

  return operations;
}

/**
 * Main entry point - execute modification based on intent
 */
export function executeModification(
  intent: IntentClassification,
  scenes: StoryboardScene[]
): ModificationOperation[] {
  const params = intent.parameters || {};
  const targets = intent.targetScenes || [];

  switch (intent.intent) {
    case 'reorder':
      return executeReorder(
        scenes,
        params as { scene1?: number; scene2?: number; sourceScene?: number; direction?: string; targetScene?: number }
      );

    case 'duration': {
      // If no specific targets, default to first scene
      const durationTargets = targets.length > 0 ? targets : scenes.length > 0 ? [scenes[0].id] : [];
      return executeDurationChange(scenes, durationTargets, params);
    }

    case 'content': {
      // If no specific targets, default to first scene
      const contentTargets = targets.length > 0 ? targets : scenes.length > 0 ? [scenes[0].id] : [];
      return executeContentChange(scenes, contentTargets, params);
    }

    case 'remove':
      return executeRemove(scenes, targets);

    case 'remove-word':
      return executeRemoveWord(scenes, params as { wordToRemove?: string });

    default:
      return [];
  }
}

export default executeModification;
