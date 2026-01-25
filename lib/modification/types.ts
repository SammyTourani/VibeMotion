/**
 * Chat-Based Modification Types
 *
 * Type definitions for the modification system that allows users
 * to iteratively refine storyboards through natural language commands.
 */

import type { StoryboardScene } from '../pipeline/types';
import type { UploadedAsset } from '../types';

/**
 * Supported modification intents
 */
export type ModificationIntent =
  | 'reorder'       // Swap or move scenes
  | 'duration'      // Change scene duration
  | 'content'       // Update text content
  | 'add'           // Add a new scene
  | 'remove'        // Delete a scene
  | 'remove-word'   // Remove a filler word from transcript (adjusts scene timing)
  | 'style'         // Change visual style (requires AI)
  | 'regenerate';   // Start fresh

/**
 * Result of classifying user intent from their message
 */
export interface IntentClassification {
  intent: ModificationIntent;
  confidence: number;
  targetScenes?: string[];
  parameters?: Record<string, unknown>;
}

/**
 * A single modification operation to apply to the storyboard
 */
export interface ModificationOperation {
  type: 'update' | 'insert' | 'delete' | 'reorder' | 'replace_all';
  sceneId?: string;
  scene?: Partial<StoryboardScene>;
  position?: number;
  newOrder?: string[];
  fullStoryboard?: StoryboardScene[];
}

/**
 * Request payload for the modification API
 */
export interface ModificationRequest {
  message: string;
  existingStoryboard: {
    scenes: StoryboardScene[];
    totalDuration: number;
    summary: string;
  };
  assets: UploadedAsset[];
}

/**
 * Response from the modification API
 */
export interface ModificationResponse {
  success: boolean;
  operations: ModificationOperation[];
  message: string;
  requiresRegeneration?: boolean;
}
