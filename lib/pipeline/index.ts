/**
 * Autonomous Pipeline Module
 *
 * Exports all pipeline components for the fully automated video generation system.
 */

// Types
export * from './types';

// Classifier
export { classifyClips, classifyClipsHeuristic } from './classifier';

// Smart Storyboard
export { generateSmartStoryboard, validateStoryboard } from './smart-storyboard';

// Orchestrator
export { PipelineOrchestrator, runPipeline } from './orchestrator';
