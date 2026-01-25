/**
 * Modify Storyboard API Endpoint
 *
 * Handles chat-based modifications to existing storyboards.
 * Classifies user intent and executes targeted modifications
 * without regenerating the entire storyboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/lib/modification/intent-classifier';
import { executeModification } from '@/lib/modification/executors';
import type {
  ModificationRequest,
  ModificationResponse,
  IntentClassification,
  ModificationOperation,
} from '@/lib/modification/types';

export async function POST(request: NextRequest) {
  try {
    const body: ModificationRequest = await request.json();

    // Validate request
    if (!body.message || !body.existingStoryboard?.scenes) {
      return NextResponse.json(
        { error: 'Missing message or storyboard' },
        { status: 400 }
      );
    }

    // 1. Classify the user's intent
    const intent = classifyIntent(body.message, body.existingStoryboard.scenes);

    console.log(
      '[Modify] Intent:',
      intent.intent,
      'Confidence:',
      intent.confidence,
      'Targets:',
      intent.targetScenes
    );

    // 2. If low confidence or regenerate/style intent, signal full regeneration needed
    if (
      intent.confidence < 0.5 ||
      intent.intent === 'regenerate' ||
      intent.intent === 'style' ||
      intent.intent === 'add' // Add requires AI to generate new content
    ) {
      return NextResponse.json({
        success: true,
        operations: [],
        message: getRegenerationMessage(intent),
        requiresRegeneration: true,
      } satisfies ModificationResponse);
    }

    // 3. Execute the modification
    const operations = executeModification(intent, body.existingStoryboard.scenes);

    // 4. If no operations could be generated, ask for clarification
    if (operations.length === 0) {
      return NextResponse.json({
        success: false,
        operations: [],
        message: getClarificationMessage(intent),
        requiresRegeneration: false,
      } satisfies ModificationResponse);
    }

    // 5. Generate success response message
    const responseMessage = generateResponseMessage(intent, operations);

    return NextResponse.json({
      success: true,
      operations,
      message: responseMessage,
      requiresRegeneration: false,
    } satisfies ModificationResponse);
  } catch (error) {
    console.error('[Modify] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process modification' },
      { status: 500 }
    );
  }
}

/**
 * Generate a message explaining why regeneration is needed
 */
function getRegenerationMessage(intent: IntentClassification): string {
  switch (intent.intent) {
    case 'style':
      return "I'll regenerate the video with your style preferences.";
    case 'add':
      return "I'll generate a new scene and update the video.";
    case 'regenerate':
      return "Starting fresh with a new video.";
    default:
      return "I'll regenerate the video with your feedback.";
  }
}

/**
 * Generate a clarification message when we couldn't understand
 */
function getClarificationMessage(intent: IntentClassification): string {
  switch (intent.intent) {
    case 'reorder':
      return "I couldn't understand which scenes to swap. Try 'swap scene 2 and 3' or 'move scene 1 after scene 3'.";
    case 'duration':
      return "Which scene should I adjust? Try 'make the intro shorter' or 'make scene 2 longer'.";
    case 'content':
      return "What text would you like to change? Try 'change the title to...' or 'update the CTA to...'.";
    case 'remove':
      return "Which scene should I remove? Try 'delete scene 3' or 'remove the last scene'.";
    default:
      return "I couldn't understand that modification. Could you be more specific?";
  }
}

/**
 * Generate a success response message
 */
function generateResponseMessage(
  intent: IntentClassification,
  operations: ModificationOperation[]
): string {
  switch (intent.intent) {
    case 'reorder':
      return "Done! I've swapped the scenes for you.";
    case 'duration': {
      const updateOp = operations.find((op) => op.type === 'update');
      const newDuration = updateOp?.scene?.duration;
      return newDuration
        ? `Done! I've updated the scene duration to ${newDuration}s.`
        : "Done! I've adjusted the scene duration.";
    }
    case 'content':
      return "Done! I've updated the text content.";
    case 'remove':
      return `Done! I've removed ${operations.length} scene(s).`;
    default:
      return "Done! I've applied your changes.";
  }
}
