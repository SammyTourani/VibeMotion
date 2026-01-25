/**
 * Autonomous Pipeline Types
 *
 * Defines the data structures for the fully automated video generation pipeline.
 */

// ============================================
// Input Types
// ============================================

export interface PipelineInput {
  /** Unique project identifier */
  projectId: string;

  /** Uploaded video assets with their server paths */
  assets: PipelineAsset[];

  /** Optional user prompt/direction for the video */
  prompt?: string;

  /** Video configuration */
  config: PipelineConfig;

  /** Whether to render final MP4 (vs preview only) */
  renderFinal?: boolean;
}

export interface PipelineAsset {
  id: string;
  name: string;
  publicPath: string;
  size: number;
  mimeType: string;
  type: 'video' | 'image' | 'audio';
}

export interface PipelineConfig {
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  style: 'modern' | 'minimal' | 'bold' | 'playful' | 'corporate' | 'cinematic';
  targetDuration?: number; // Target video length in seconds (default: 30)
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  musicMood?: 'upbeat' | 'chill' | 'dramatic' | 'energetic' | 'corporate' | 'none';
  sfxEnabled?: boolean;
  /** Default text animation for titles and CTA scenes */
  textAnimation?: 'bounce' | 'shake' | 'glow' | 'typewriter' | 'slide-up' | 'pop' | 'none';
}

// ============================================
// Transcription Types
// ============================================

export interface TranscriptWord {
  text: string;
  start: number; // Start time in seconds
  end: number;   // End time in seconds
}

export interface VideoTranscript {
  assetId: string;
  publicPath: string;
  text: string;
  words: TranscriptWord[];
  duration: number; // Total video duration in seconds
  wordCount: number;
  speechDensity: number; // Words per second
  silenceAnalysis?: SilenceAnalysis; // Silence detection results
}

// ============================================
// Silence Detection Types
// ============================================

export interface SilenceSegment {
  /** Start time of silence in seconds */
  start: number;
  /** End time of silence in seconds */
  end: number;
  /** Duration of silence in seconds */
  duration: number;
  /** Word before the silence */
  wordBefore: string;
  /** Word after the silence */
  wordAfter: string;
}

export interface SilenceAnalysis {
  /** Asset ID this analysis belongs to */
  assetId: string;
  /** All detected silent segments */
  segments: SilenceSegment[];
  /** Total silence duration in seconds */
  totalSilenceDuration: number;
  /** Percentage of video that is silence */
  silencePercentage: number;
  /** Recommended trim points for tighter edit */
  recommendedTrims: TrimRecommendation[];
}

export interface TrimRecommendation {
  /** Original start time in source video */
  originalStart: number;
  /** Original end time in source video */
  originalEnd: number;
  /** Recommended new start (after trim) */
  trimmedStart: number;
  /** Recommended new end (after trim) */
  trimmedEnd: number;
  /** Reason for this trim */
  reason: string;
}

// ============================================
// Visual Analysis Types
// ============================================

export interface VisualAnalysis {
  /** Unique asset identifier */
  assetId: string;

  /** Paths to extracted frame images */
  framePaths: string[];

  /** High-level description of what's happening in the video */
  sceneDescription: string;

  /** Main subjects visible (person, product, hands, scenery, etc.) */
  subjects: string[];

  /** Actions being performed (talking to camera, demonstrating, walking, etc.) */
  actions: string[];

  /** Overall mood/tone (professional, casual, energetic, calm, etc.) */
  mood: string;

  /** Whether this looks like main content or supporting footage */
  suggestedRole: 'A-roll' | 'B-roll';

  /** Confidence in the suggested role (0-1) */
  roleConfidence: number;

  /** Additional context for classification */
  context: string;

  /** Dense frame analysis data (Phase 11) */
  denseAnalysis?: DenseFrameAnalysis;
}

/** Dense Frame Analysis - richer visual understanding */
export interface DenseFrameAnalysis {
  /** Total frames extracted */
  totalFrames: number;

  /** Frames per second extracted */
  extractionFps: number;

  /** Per-frame analysis data */
  frames: FrameAnalysis[];

  /** Detected scene changes (timestamps) */
  sceneChanges: SceneChange[];

  /** Overall motion level (0-1) */
  motionLevel: number;

  /** Best frame indices for thumbnails */
  keyFrameIndices: number[];

  /** Visual content segments */
  segments: VisualSegment[];
}

/** Analysis of a single frame */
export interface FrameAnalysis {
  /** Frame index */
  index: number;

  /** Timestamp in video (seconds) */
  timestamp: number;

  /** Path to frame image */
  path: string;

  /** Brief description of frame content */
  description?: string;

  /** Detected subjects in this frame */
  subjects?: string[];

  /** Is a person's face visible? */
  hasFace?: boolean;

  /** Is the person speaking/moving lips? */
  isSpeaking?: boolean;

  /** Visual similarity score to previous frame (0-1) */
  similarityToPrevious?: number;

  /** Quality score (0-1) - sharpness, exposure */
  qualityScore?: number;
}

/** Detected scene change */
export interface SceneChange {
  /** Frame index where change occurs */
  frameIndex: number;

  /** Timestamp in seconds */
  timestamp: number;

  /** Type of change */
  changeType: 'cut' | 'transition' | 'motion';

  /** Confidence in detection (0-1) */
  confidence: number;
}

/** Visual segment - continuous visual content */
export interface VisualSegment {
  /** Start timestamp */
  startTime: number;

  /** End timestamp */
  endTime: number;

  /** Duration */
  duration: number;

  /** Dominant visual content type */
  contentType: 'talking-head' | 'action' | 'scenery' | 'product' | 'hands' | 'mixed';

  /** Average motion level (0-1) */
  motionLevel: number;

  /** Best frame index in this segment */
  bestFrameIndex: number;

  /** Brief description */
  description?: string;
}

export interface FrameExtractionResult {
  success: boolean;
  framePaths: string[];
  timestamps?: number[];
  error?: string;
}

// ============================================
// Classification Types
// ============================================

export type ClipRole = 'A-roll' | 'B-roll';

export interface ClassifiedClip {
  assetId: string;
  publicPath: string;
  name: string;
  role: ClipRole;
  confidence: number; // 0-1 confidence in classification
  transcript: string;
  words?: TranscriptWord[]; // Word-level timestamps for transcript panel
  duration: number;
  speechDensity: number;
  suggestedUse: string;
  keyMoments?: string[]; // Key phrases/moments in the clip
  visualDescription?: string; // What's visually happening in the clip
  subjects?: string[]; // Main subjects visible in the clip
  silenceAnalysis?: SilenceAnalysis; // Silence detection results
  recommendedTrimStart?: number; // Where to start playing (skip leading silence)
  recommendedTrimEnd?: number; // Where to stop playing (skip trailing silence)
}

export interface ClassificationResult {
  clips: ClassifiedClip[];
  summary: {
    totalClips: number;
    aRollCount: number;
    bRollCount: number;
    totalDuration: number;
    narrativeStrength: 'strong' | 'moderate' | 'weak';
  };
}

// ============================================
// Storyboard Types
// ============================================

export type SceneType = 'title' | 'a-roll' | 'b-roll' | 'b-roll-overlay' | 'video' | 'transition' | 'cta' | 'content';

export interface StoryboardScene {
  id: string;
  order: number;
  type: SceneType;

  /** Video asset to use (for a-roll/b-roll scenes) */
  asset?: string;

  /** Start time within the source video */
  assetStartTime?: number;

  /** Start time within the composition timeline (for transcript panel) */
  compositionStartTime?: number;

  /** Duration of this scene in seconds */
  duration: number;

  /** Text content (for title/cta/content scenes) */
  text?: string;

  /** Voiceover script for this scene */
  voiceover?: string;

  /** Animation/transition effect */
  animation?: string;

  /** Description of what happens in this scene */
  description: string;

  /** Word-level timestamps for transcript panel (a-roll scenes) */
  words?: TranscriptWord[];

  /**
   * For b-roll-overlay scenes: ID of the A-roll scene this overlays.
   * B-roll overlays appear DURING an A-roll scene while the A-roll audio continues.
   */
  overlayOnAroll?: string;

  /**
   * For b-roll-overlay scenes: When (in seconds) within the A-roll to show this overlay.
   * E.g., overlayStartTime: 2 means the B-roll visual appears 2 seconds into the A-roll.
   */
  overlayStartTime?: number;
}

export interface MusicRecommendation {
  /** Music mood selected by user or recommended by AI */
  mood: 'upbeat' | 'chill' | 'dramatic' | 'energetic' | 'corporate' | 'none';
  /** Volume level 0-1 */
  volume: number;
  /** Fade in duration in seconds */
  fadeInSeconds: number;
  /** Fade out duration in seconds */
  fadeOutSeconds: number;
  /** Why this music setting was chosen */
  reasoning: string;
}

// ============================================
// Sound Effects Types
// ============================================

export type SFXType = 'reveal' | 'transition' | 'notification' | 'ambient';

export interface SFXOpportunity {
  /** Unique identifier for this SFX */
  id: string;
  /** Scene this SFX belongs to */
  sceneId: string;
  /** Type of sound effect */
  type: SFXType;
  /** Description for AI generation */
  description: string;
  /** When this SFX should play (seconds from video start) */
  startTime: number;
  /** Duration of the sound effect in seconds */
  duration: number;
  /** Volume level 0-1 */
  volume: number;
}

export interface GeneratedSFX extends SFXOpportunity {
  /** Path to the generated audio file */
  path: string;
}

export interface SmartStoryboard {
  scenes: StoryboardScene[];
  totalDuration: number;
  summary: string;
  narrativeFlow: string; // Description of how the story unfolds
  music?: MusicRecommendation; // Background music recommendation
  sfx?: GeneratedSFX[]; // Generated sound effects
}

// ============================================
// Text Animation Types
// ============================================

/** Available text animation presets */
export type TextAnimationType =
  | 'bounce'    // Text bounces in from below with overshoot
  | 'shake'     // Subtle horizontal vibration
  | 'glow'      // Pulsing text shadow effect
  | 'typewriter' // Characters appear one by one
  | 'slide-up'  // Text slides up and fades in
  | 'pop'       // Text scales from 0 with spring
  | 'none';     // No animation

/** Text animation recommendation for a scene */
export interface TextAnimationConfig {
  /** Animation preset to use */
  animation: TextAnimationType;
  /** Whether to animate word by word */
  wordByWord: boolean;
  /** Words to highlight with accent color */
  highlightWords?: string[];
  /** Delay before animation starts (frames) */
  delay?: number;
}

// ============================================
// Pipeline Result Types
// ============================================

export interface PipelinePhase {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'skipped';
  progress: number; // 0-100
  message?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineProgress {
  currentPhase: string;
  overallProgress: number; // 0-100
  phases: PipelinePhase[];
  elapsedTime: number; // milliseconds
}

export interface PipelineResult {
  success: boolean;
  projectId: string;

  /** Uploaded assets */
  assets: PipelineAsset[];

  /** Transcription results */
  transcripts?: VideoTranscript[];

  /** Classification results */
  classification?: ClassificationResult;

  /** Generated storyboard */
  storyboard?: SmartStoryboard;

  /** Generated composition code */
  compositionCode?: string;

  /** Path to saved composition */
  compositionPath?: string;

  /** Composition ID for Remotion */
  compositionId?: string;

  /** Final rendered video URL (if renderFinal=true) */
  videoUrl?: string;

  /** Total pipeline execution time */
  executionTime: number;

  /** Error details if failed */
  error?: string;
}

// ============================================
// SSE Event Types
// ============================================

export type PipelineEventType =
  | 'phase_start'
  | 'phase_progress'
  | 'phase_complete'
  | 'phase_error'
  | 'transcript_ready'
  | 'reorder_suggested'
  | 'reorder_applied'
  | 'visual_analysis_ready'
  | 'classification_ready'
  | 'storyboard_ready'
  | 'composition_ready'
  | 'render_progress'
  | 'pipeline_complete'
  | 'pipeline_error';

// ============================================
// Reorder Event Types (Phase 12)
// ============================================

export interface ReorderEventData {
  originalOrder: string[];
  newOrder: string[];
  reasoning: string;
  confidence: number;
  applied: boolean;
  changes: Array<{
    clipId: string;
    from: number;
    to: number;
    reason: string;
  }>;
}

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// ============================================
// Constants
// ============================================

export const PIPELINE_PHASES = [
  'upload',
  'transcribe',
  'reorder',
  'classify',
  'storyboard',
  'composition',
  'render'
] as const;

export type PipelinePhaseName = typeof PIPELINE_PHASES[number];

export const DEFAULT_CONFIG: PipelineConfig = {
  aspectRatio: '9:16',
  style: 'modern',
  targetDuration: 30,
  primaryColor: '#8B5CF6',
  backgroundColor: '#000000',
  textColor: '#FFFFFF',
  musicMood: 'chill',
  sfxEnabled: true,
  textAnimation: 'pop',
};

/** Speech density thresholds for classification */
export const CLASSIFICATION_THRESHOLDS = {
  /** Above this = definitely A-roll (talking head) */
  A_ROLL_HIGH: 2.0, // words per second

  /** Below this = definitely B-roll (visual only) */
  B_ROLL_LOW: 0.3,

  /** In between = let AI decide based on content */
};
