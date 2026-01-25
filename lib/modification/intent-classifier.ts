/**
 * Intent Classifier
 *
 * Analyzes user messages to determine their modification intent.
 * Uses pattern matching for fast classification without AI calls.
 */

import type { StoryboardScene } from '../pipeline/types';
import type { ModificationIntent, IntentClassification } from './types';

/**
 * Regex patterns for each modification intent
 */
const INTENT_PATTERNS: Record<ModificationIntent, RegExp[]> = {
  reorder: [
    /swap\s+(scene|clip)/i,
    /move\s+(scene|clip)/i,
    /reorder/i,
    /put\s+.*\s+(before|after)/i,
    /switch\s+(scene|clip)/i,
  ],
  duration: [
    /shorter|longer/i,
    /(\d+)\s*seconds?/i,
    /extend|reduce|cut.*duration/i,
    /make.*(\d+)s/i,
    /increase|decrease.*time/i,
  ],
  content: [
    /change\s+(the\s+)?(text|title|cta)/i,
    /update\s+.*\s+to/i,
    /edit\s+(scene|text)/i,
    /replace\s+.*\s+with/i,
    /rename/i,
  ],
  add: [
    /add\s+(a\s+)?(scene|title|transition)/i,
    /insert/i,
    /create\s+(a\s+)?new\s+scene/i,
    /include\s+(a\s+)?new/i,
  ],
  remove: [
    /remove\s+(the\s+)?scene/i,
    /delete\s+(the\s+)?scene/i,
    /cut\s+(the\s+)?scene/i,
    /get\s+rid\s+of\s+(the\s+)?scene/i,
    /take\s+out\s+(the\s+)?scene/i,
    /drop\s+(the\s+)?scene/i,
  ],
  'remove-word': [
    /remove\s+(all\s+)?(instances?\s+of\s+)?["']?(\w+)["']?\s*(words?)?/i,
    /delete\s+(all\s+)?["']?(\w+)["']?\s*(words?)?/i,
    /cut\s+(out\s+)?(all\s+)?["']?(\w+)["']?/i,
    /get\s+rid\s+of\s+(all\s+)?["']?(\w+)["']?/i,
    /remove\s+the\s+word\s+["']?(\w+)["']?/i,
    /remove\s+["'](\w+)["']/i,
  ],
  style: [
    /more\s+(energetic|calm|professional|dynamic|subtle)/i,
    /change\s+(the\s+)?animation/i,
    /different\s+style/i,
    /make\s+it\s+(look|feel)/i,
  ],
  regenerate: [
    /start\s+over/i,
    /regenerate/i,
    /new\s+video\s+(about|for)/i,
    /from\s+scratch/i,
    /completely\s+different/i,
    /create\s+a\s+(new\s+)?video/i,
  ],
};

/**
 * Classify user intent from their message
 */
export function classifyIntent(
  message: string,
  storyboard: StoryboardScene[]
): IntentClassification {
  // Try pattern matching first (fast path)
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return {
          intent: intent as ModificationIntent,
          confidence: 0.85,
          targetScenes: extractTargetScenes(message, storyboard),
          parameters: extractParameters(message, intent as ModificationIntent),
        };
      }
    }
  }

  // Default to regenerate with low confidence (let AI decide)
  return {
    intent: 'regenerate',
    confidence: 0.3,
  };
}

/**
 * Extract which scenes the user is referring to
 */
function extractTargetScenes(
  message: string,
  scenes: StoryboardScene[]
): string[] {
  // Match "scene N" pattern
  const sceneNumMatch = message.match(/scene\s+(\d+)/i);
  if (sceneNumMatch) {
    const sceneNum = parseInt(sceneNumMatch[1]);
    const scene = scenes.find((s) => s.order === sceneNum - 1);
    return scene ? [scene.id] : [];
  }

  // Match by type keywords
  if (/intro|title|opening/i.test(message)) {
    const intro = scenes.find((s) => s.type === 'title' && s.order === 0);
    return intro ? [intro.id] : [];
  }

  if (/cta|call.to.action|ending|outro/i.test(message)) {
    const cta = scenes.find((s) => s.type === 'cta');
    return cta ? [cta.id] : [];
  }

  if (/first/i.test(message) && scenes.length > 0) {
    return [scenes[0].id];
  }

  if (/last/i.test(message) && scenes.length > 0) {
    return [scenes[scenes.length - 1].id];
  }

  return [];
}

/**
 * Extract parameters from the message based on intent
 */
function extractParameters(
  message: string,
  intent: ModificationIntent
): Record<string, unknown> {
  if (intent === 'duration') {
    // Extract explicit duration: "make it 5 seconds"
    const match = message.match(/(\d+)\s*s(ec(ond)?s?)?/i);
    if (match) return { newDuration: parseInt(match[1]) };

    // Extract relative adjustment
    if (/shorter|reduce|decrease|cut/i.test(message)) return { adjustment: -1 };
    if (/longer|extend|increase/i.test(message)) return { adjustment: 1 };
  }

  if (intent === 'content') {
    // Extract new text: "change to 'New Text'" or "update to New Text"
    const match = message.match(/to\s+["']?([^"']+)["']?$/i);
    if (match) return { newText: match[1].trim() };
  }

  if (intent === 'reorder') {
    // Extract swap: "swap scene 2 and 3"
    const swapMatch = message.match(
      /swap\s+scene\s*(\d+)\s*(and|with|&)\s*(\d+)/i
    );
    if (swapMatch) {
      return {
        scene1: parseInt(swapMatch[1]) - 1,
        scene2: parseInt(swapMatch[3]) - 1,
      };
    }

    // Extract move: "move scene 2 after scene 4"
    const moveMatch = message.match(
      /move\s+scene\s*(\d+)\s+(before|after)\s+scene\s*(\d+)/i
    );
    if (moveMatch) {
      return {
        sourceScene: parseInt(moveMatch[1]) - 1,
        direction: moveMatch[2].toLowerCase(),
        targetScene: parseInt(moveMatch[3]) - 1,
      };
    }
  }

  if (intent === 'remove-word') {
    // Extract the word to remove from various patterns
    // "remove all instances of 'like'" or "remove all like" or "remove 'like'"
    const patterns = [
      /remove\s+(?:all\s+)?(?:instances?\s+of\s+)?["']?(\w+)["']?/i,
      /delete\s+(?:all\s+)?["']?(\w+)["']?/i,
      /cut\s+(?:out\s+)?(?:all\s+)?["']?(\w+)["']?/i,
      /get\s+rid\s+of\s+(?:all\s+)?["']?(\w+)["']?/i,
      /remove\s+the\s+word\s+["']?(\w+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Normalize the word (lowercase, no punctuation)
        const wordToRemove = match[1].toLowerCase().replace(/[^a-z]/g, '');
        if (wordToRemove.length > 0) {
          return { wordToRemove };
        }
      }
    }
  }

  return {};
}

export default classifyIntent;
