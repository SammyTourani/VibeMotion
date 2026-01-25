/**
 * Apply Operations
 *
 * Takes modification operations and applies them to the storyboard state.
 * This is a pure function that returns a new storyboard object.
 */

import type { StoryboardScene } from '../pipeline/types';
import type { ModificationOperation } from './types';

/**
 * Storyboard structure as used in the sandbox
 */
interface Storyboard {
  scenes: StoryboardScene[];
  totalDuration: number;
  summary: string;
}

/**
 * Apply a list of operations to a storyboard
 * Returns a new storyboard object (does not mutate input)
 */
export function applyOperations(
  storyboard: Storyboard,
  operations: ModificationOperation[]
): Storyboard {
  let scenes = [...storyboard.scenes];

  for (const op of operations) {
    switch (op.type) {
      case 'update':
        scenes = scenes.map((s) =>
          s.id === op.sceneId ? { ...s, ...op.scene } : s
        );
        break;

      case 'insert':
        if (op.scene) {
          const insertIndex = op.position ?? scenes.length;
          const newScene: StoryboardScene = {
            id: op.scene.id || `scene-${Date.now()}`,
            order: insertIndex,
            type: op.scene.type || 'content',
            duration: op.scene.duration || 3,
            description: op.scene.description || '',
            ...op.scene,
          } as StoryboardScene;
          scenes.splice(insertIndex, 0, newScene);
        }
        break;

      case 'delete':
        scenes = scenes.filter((s) => s.id !== op.sceneId);
        break;

      case 'reorder':
        if (op.newOrder) {
          const orderMap = new Map(op.newOrder.map((id, i) => [id, i]));
          scenes.sort(
            (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
          );
        }
        break;

      case 'replace_all':
        if (op.fullStoryboard) {
          scenes = op.fullStoryboard;
        }
        break;
    }
  }

  // Renumber scene orders after modifications
  scenes = scenes.map((s, i) => ({ ...s, order: i }));

  // Recalculate total duration
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

  return {
    ...storyboard,
    scenes,
    totalDuration,
  };
}

export default applyOperations;
