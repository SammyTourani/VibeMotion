/**
 * Autonomous Pipeline Orchestrator
 *
 * Chains together all pipeline phases to create a video from uploaded clips
 * with zero manual intervention.
 *
 * Pipeline Flow:
 * 1. Upload → Save assets to public/assets/
 * 2. Transcribe → Extract audio and transcribe with Whisper
 * 3. Classify → Determine A-roll vs B-roll using speech analysis
 * 4. Storyboard → Generate intelligent scene arrangement
 * 5. Composition → Generate Remotion TypeScript code
 * 6. Render → (Optional) Render final MP4
 */

import { GoogleGenAI } from "@google/genai";
import path from "path";
import type {
  PipelineInput,
  PipelineResult,
  PipelineProgress,
  PipelinePhase,
  PipelineAsset,
  VideoTranscript,
  PipelineEvent,
  PipelinePhaseName,
  VisualAnalysis,
} from "./types";
import { classifyClips } from "./classifier";
import { analyzeVideos } from "./visual-analyzer";
import { generateSmartStoryboard, validateStoryboard } from "./smart-storyboard";
import { generateSFX, buildSFXPromptSection } from "./sfx-generator";
import { analyzeVideoSilence, formatSilenceAnalysis } from "./silence-detection";
import { getTranscriptionService } from "./transcription-service";
import { getCachedTranscript, cacheTranscript } from "./transcript-cache";
import { analyzeAndReorder, applyReorder, formatReorderSummary } from "./narrative-reorder";
import { writeComposition } from "../composition-writer";
import { generateAssetManifestText } from "../asset-gallery";
import type { UploadedAsset } from "../types";
import type { GeneratedSFX } from "./types";

const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

const MODEL_ID = "gemini-2.0-flash";

/**
 * Event emitter callback type
 */
type EventCallback = (event: PipelineEvent) => void;

/**
 * Main orchestrator class
 */
export class PipelineOrchestrator {
  private projectId: string;
  private startTime: number;
  private phases: Map<PipelinePhaseName, PipelinePhase>;
  private eventCallback: EventCallback | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.startTime = Date.now();
    this.phases = new Map();

    // Initialize all phases
    const phaseNames: PipelinePhaseName[] = ['upload', 'transcribe', 'reorder', 'classify', 'storyboard', 'composition', 'render'];
    for (const name of phaseNames) {
      this.phases.set(name, {
        name,
        status: 'pending',
        progress: 0,
      });
    }
  }

  /**
   * Set event callback for real-time progress updates
   */
  onEvent(callback: EventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Emit an event to the callback
   */
  private emit(type: PipelineEvent['type'], data: Record<string, unknown>): void {
    if (this.eventCallback) {
      this.eventCallback({
        type,
        timestamp: Date.now(),
        data,
      });
    }
  }

  /**
   * Update phase status and emit event
   */
  private updatePhase(
    name: PipelinePhaseName,
    update: Partial<PipelinePhase>
  ): void {
    const phase = this.phases.get(name);
    if (phase) {
      Object.assign(phase, update);
      this.phases.set(name, phase);

      if (update.status === 'running') {
        phase.startedAt = Date.now();
        this.emit('phase_start', { phase: name, ...update });
      } else if (update.status === 'complete') {
        phase.completedAt = Date.now();
        this.emit('phase_complete', { phase: name, ...update });
      } else if (update.status === 'error') {
        this.emit('phase_error', { phase: name, ...update });
      } else if (update.progress !== undefined) {
        this.emit('phase_progress', { phase: name, progress: update.progress });
      }
    }
  }

  /**
   * Get current progress
   */
  getProgress(): PipelineProgress {
    const phases = Array.from(this.phases.values());
    const completedPhases = phases.filter(p => p.status === 'complete').length;
    const overallProgress = Math.round((completedPhases / phases.length) * 100);

    const currentPhase = phases.find(p => p.status === 'running')?.name ||
      phases.find(p => p.status === 'pending')?.name ||
      'complete';

    return {
      currentPhase,
      overallProgress,
      phases,
      elapsedTime: Date.now() - this.startTime,
    };
  }

  /**
   * Execute the full pipeline
   */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    const result: Partial<PipelineResult> = {
      success: false,
      projectId: this.projectId,
      assets: input.assets,
    };

    try {
      console.log(`[Pipeline] Starting for project ${this.projectId}`);
      console.log(`[Pipeline] ${input.assets.length} assets, config:`, input.config);

      // Phase 1: Upload (already done before pipeline starts)
      this.updatePhase('upload', { status: 'complete', progress: 100 });

      // Phase 2: Transcribe all videos + Extract visual frames
      this.updatePhase('transcribe', { status: 'running', progress: 0 });
      let transcripts = await this.transcribeAssets(input.assets);
      result.transcripts = transcripts;
      this.updatePhase('transcribe', { status: 'complete', progress: 40 });
      this.emit('transcript_ready', { transcripts });

      // Silence Detection: Analyze word gaps to find silent pauses
      this.updatePhase('transcribe', { status: 'running', progress: 40, message: 'Detecting silent pauses...' });
      for (const transcript of transcripts) {
        if (transcript.words.length > 0) {
          const silenceAnalysis = analyzeVideoSilence(
            transcript.assetId,
            transcript.words,
            transcript.duration
          );

          // Attach silence analysis to transcript
          transcript.silenceAnalysis = silenceAnalysis;

          // Log summary
          if (silenceAnalysis.segments.length > 0) {
            console.log(`[Pipeline] ${formatSilenceAnalysis(silenceAnalysis)}`);
          } else {
            console.log(`[Pipeline] No significant silence detected in ${transcript.assetId}`);
          }
        }
      }
      this.updatePhase('transcribe', { status: 'complete', progress: 50 });

      // Visual Analysis: Extract frames and analyze with Gemini Vision
      this.updatePhase('transcribe', { status: 'running', progress: 50, message: 'Analyzing visual content...' });
      const visualAnalyses = await this.analyzeVisualContent(input.assets);
      this.updatePhase('transcribe', { status: 'complete', progress: 100 });
      this.emit('phase_progress', { phase: 'transcribe', message: 'Visual analysis complete' });

      // Phase 2.5: Smart Reordering (Phase 12)
      // Analyze transcripts and determine optimal narrative order
      this.updatePhase('reorder', { status: 'running', progress: 0, message: 'Analyzing narrative order...' });
      const reorderResult = await analyzeAndReorder(transcripts);

      // Emit reorder event with full details
      this.emit('reorder_suggested', {
        originalOrder: reorderResult.originalOrder,
        newOrder: reorderResult.suggestedOrder,
        reasoning: reorderResult.reasoning,
        confidence: reorderResult.confidence,
        changes: reorderResult.changes,
        applied: reorderResult.applied,
      });

      // Apply reordering if confidence is high enough
      if (reorderResult.applied) {
        transcripts = applyReorder(transcripts, reorderResult.suggestedOrder);
        console.log(`[Pipeline] Clips reordered: ${formatReorderSummary(reorderResult)}`);

        this.emit('reorder_applied', {
          originalOrder: reorderResult.originalOrder,
          newOrder: reorderResult.suggestedOrder,
          reasoning: reorderResult.reasoning,
          confidence: reorderResult.confidence,
          changes: reorderResult.changes,
          applied: true,
        });
      } else {
        console.log(`[Pipeline] Keeping original order: ${reorderResult.reasoning}`);
      }

      this.updatePhase('reorder', {
        status: 'complete',
        progress: 100,
        message: reorderResult.applied
          ? `Reordered ${reorderResult.changes.length} clip(s)`
          : 'Original order maintained'
      });

      // Phase 3: Classify A-roll vs B-roll (now with visual context)
      this.updatePhase('classify', { status: 'running', progress: 0 });
      const classification = await classifyClips(transcripts, visualAnalyses);
      result.classification = classification;
      this.updatePhase('classify', { status: 'complete', progress: 100 });
      this.emit('classification_ready', { classification });

      // Phase 4: Generate smart storyboard
      this.updatePhase('storyboard', { status: 'running', progress: 0 });
      const storyboard = await generateSmartStoryboard(
        classification,
        input.config,
        input.prompt
      );

      // Validate storyboard
      const validation = validateStoryboard(storyboard, classification);
      if (!validation.valid) {
        console.warn('[Pipeline] Storyboard validation warnings:', validation.errors);
      }

      // Generate sound effects if enabled
      let sfx: GeneratedSFX[] = [];
      if (input.config.sfxEnabled !== false) {
        this.updatePhase('storyboard', { status: 'running', progress: 50, message: 'Generating sound effects...' });
        try {
          sfx = await generateSFX(storyboard, this.projectId, true);
          storyboard.sfx = sfx;
          console.log(`[Pipeline] Generated ${sfx.length} sound effects`);
        } catch (error) {
          console.warn('[Pipeline] SFX generation failed, continuing without:', error);
        }
      }

      result.storyboard = storyboard;
      this.updatePhase('storyboard', { status: 'complete', progress: 100 });
      this.emit('storyboard_ready', { storyboard });

      // Phase 5: Generate composition code (now with transcript support for captions)
      this.updatePhase('composition', { status: 'running', progress: 0 });
      const compositionCode = await this.generateCompositionCode(
        storyboard,
        classification,
        input.config,
        transcripts,  // Pass transcripts for caption awareness
        sfx  // Pass SFX for Audio components
      );
      result.compositionCode = compositionCode;
      this.updatePhase('composition', { status: 'complete', progress: 50 });

      // Write composition to filesystem (includes transcript.ts for captions)
      const writeResult = await writeComposition({
        projectId: this.projectId,
        compositionCode,
        config: {
          id: this.projectId.replace(/[^a-zA-Z0-9]/g, ''),
          durationInFrames: storyboard.totalDuration * 60,
          fps: 60,
          width: input.config.aspectRatio === '16:9' ? 1920 :
            input.config.aspectRatio === '1:1' ? 1080 : 1080,
          height: input.config.aspectRatio === '16:9' ? 1080 :
            input.config.aspectRatio === '1:1' ? 1080 : 1920,
        },
        storyboard: {
          scenes: storyboard.scenes,
          totalDuration: storyboard.totalDuration,
          summary: storyboard.summary,
        },
        transcripts,  // Include transcripts for caption generation
      });

      result.compositionPath = writeResult.compositionPath;
      result.compositionId = writeResult.compositionId;
      this.updatePhase('composition', { status: 'complete', progress: 100 });
      this.emit('composition_ready', {
        compositionPath: writeResult.compositionPath,
        compositionId: writeResult.compositionId,
      });

      // Phase 6: Render (optional)
      if (input.renderFinal) {
        this.updatePhase('render', { status: 'running', progress: 0 });
        // TODO: Integrate with /api/render
        // For now, skip rendering
        this.updatePhase('render', { status: 'skipped', progress: 0, message: 'Rendering not yet integrated' });
      } else {
        this.updatePhase('render', { status: 'skipped', progress: 0, message: 'Preview only mode' });
      }

      result.success = true;
      result.executionTime = Date.now() - this.startTime;

      this.emit('pipeline_complete', { result });
      console.log(`[Pipeline] Complete in ${result.executionTime}ms`);

      return result as PipelineResult;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Pipeline] Failed:', error);

      result.success = false;
      result.error = message;
      result.executionTime = Date.now() - this.startTime;

      this.emit('pipeline_error', { error: message });

      return result as PipelineResult;
    }
  }

  /**
   * Transcribe all video assets using server-side transcription service
   * Uses caching to avoid re-transcribing unchanged files
   */
  private async transcribeAssets(assets: PipelineAsset[]): Promise<VideoTranscript[]> {
    const videoAssets = assets.filter(a => a.type === 'video');
    console.log(`[Pipeline] Transcribing ${videoAssets.length} videos...`);

    const transcriptionService = getTranscriptionService();
    const transcripts: VideoTranscript[] = [];

    // Check if transcription is available
    if (!transcriptionService.isAvailable()) {
      console.warn('[Pipeline] Transcription service not available (no API key)');
      // Return empty transcripts for all videos
      return videoAssets.map(asset => ({
        assetId: asset.id,
        publicPath: asset.publicPath,
        text: '',
        words: [],
        duration: 10,
        wordCount: 0,
        speechDensity: 0,
      }));
    }

    for (let i = 0; i < videoAssets.length; i++) {
      const asset = videoAssets[i];
      this.updatePhase('transcribe', {
        progress: Math.round((i / videoAssets.length) * 100),
        message: `Transcribing ${asset.name} (${i + 1}/${videoAssets.length})...`,
      });

      // Check cache first
      const cached = await getCachedTranscript(asset.publicPath);
      if (cached) {
        console.log(`[Pipeline] Using cached transcript for ${asset.name}`);
        transcripts.push(cached);
        continue;
      }

      // Transcribe using the new service
      const result = await transcriptionService.transcribe({
        assetId: asset.id,
        publicPath: asset.publicPath,
      });

      // Cache successful transcripts
      if (result.success) {
        await cacheTranscript(asset.publicPath, result.transcript);
      }

      transcripts.push(result.transcript);

      console.log(
        `[Pipeline] Transcribed ${asset.name}: ${result.transcript.wordCount} words, ${result.transcript.speechDensity.toFixed(2)} w/s`
      );
    }

    return transcripts;
  }

  /**
   * Analyze visual content of video assets
   * Extracts frames and analyzes with Gemini Vision
   */
  private async analyzeVisualContent(
    assets: PipelineAsset[]
  ): Promise<Map<string, VisualAnalysis>> {
    const videoAssets = assets.filter(a => a.type === 'video');
    console.log(`[Pipeline] Analyzing visual content for ${videoAssets.length} videos...`);

    // Prepare video data for analysis
    const videos = videoAssets.map(asset => ({
      videoPath: path.join(process.cwd(), 'public', asset.publicPath),
      assetId: asset.id,
    }));

    // Directory for storing extracted frames
    const framesDir = path.join(process.cwd(), 'public', 'assets', 'frames');

    try {
      const analyses = await analyzeVideos(videos, framesDir);
      console.log(`[Pipeline] Visual analysis complete: ${analyses.size} videos analyzed`);
      return analyses;
    } catch (error) {
      console.error('[Pipeline] Visual analysis failed:', error);
      // Return empty map - classification will proceed without visual context
      return new Map();
    }
  }

  /**
   * Generate Remotion composition code
   */
  private async generateCompositionCode(
    storyboard: import('./types').SmartStoryboard,
    classification: import('./types').ClassificationResult,
    config: import('./types').PipelineConfig,
    transcripts: VideoTranscript[],
    sfx: GeneratedSFX[] = []
  ): Promise<string> {
    console.log('[Pipeline] Generating composition code...');

    if (!genai) {
      throw new Error('Google API key not configured');
    }

    // Build asset manifest for AI
    const assets: UploadedAsset[] = classification.clips.map(clip => ({
      id: clip.assetId,
      type: 'video' as const,
      file: null as unknown as File,
      name: clip.name,
      size: 0,
      mimeType: 'video/mp4',
      thumbnail: null,
      metadata: { duration: clip.duration },
      createdAt: Date.now(),
      publicPath: clip.publicPath,
    }));

    const assetManifest = generateAssetManifestText(assets);

    // Build scene description with explicit trim instructions
    const sceneDescriptions = storyboard.scenes.map((scene, i) => {
      if (scene.type === 'title' || scene.type === 'cta' || scene.type === 'content') {
        return `Scene ${i + 1} (${scene.type}, ${scene.duration}s): "${scene.text}" - ${scene.description}`;
      }
      // For video scenes, be explicit about startTime for trimming
      const startTimeNote = scene.assetStartTime && scene.assetStartTime > 0.1
        ? ` **USE startTime={${scene.assetStartTime.toFixed(2)}}** (auto-trimmed)`
        : '';
      return `Scene ${i + 1} (${scene.type}, ${scene.duration}s): ${scene.asset}${startTimeNote} - ${scene.description}`;
    }).join('\n');

    const componentName = this.projectId
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]+/, 'V')
      .replace(/^./, c => c.toUpperCase());

    // Build SFX section
    const sfxSection = buildSFXPromptSection(sfx);

    // Build music section based on storyboard recommendation
    const musicSection = storyboard.music && storyboard.music.mood !== 'none'
      ? `## Background Music
- Mood: ${storyboard.music.mood}
- Volume: ${(storyboard.music.volume * 100).toFixed(0)}% (${storyboard.music.volume})
- Fade in: ${storyboard.music.fadeInSeconds}s
- Fade out: ${storyboard.music.fadeOutSeconds}s
- Reason: ${storyboard.music.reasoning}

IMPORTANT: Add the Music component with these EXACT settings:
<Music
  src="audio/sample-music.mp3"
  volume={${storyboard.music.volume}}
  fadeInSeconds={${storyboard.music.fadeInSeconds}}
  fadeOutSeconds={${storyboard.music.fadeOutSeconds}}
  loop={true}
/>`
      : `## Background Music
- No background music (user preference)`;

    const prompt = `Generate Remotion composition code for this video:

## Storyboard
${sceneDescriptions}

Total duration: ${storyboard.totalDuration} seconds
Summary: ${storyboard.summary}

## Available Assets
${assetManifest}

## Configuration
- Component name: ${componentName}
- Aspect ratio: ${config.aspectRatio}
- Style: ${config.style}
- Primary color: ${config.primaryColor || '#8B5CF6'}
- Background: ${config.backgroundColor || '#000000'}
- Text color: ${config.textColor || '#FFFFFF'}
- Text animation: ${config.textAnimation || 'pop'}
- FPS: 60

${musicSection}

${sfxSection}

## Captions
Transcript data with word-level timestamps is available via:
import { TRANSCRIPT_WORDS } from './transcript';

Use the Caption component to add TikTok-style subtitles that sync with the video.
Total words in transcript: ${transcripts.reduce((sum, t) => sum + t.wordCount, 0)}

Generate COMPLETE, WORKING TypeScript code with proper imports.
Use EXACT asset paths from the Available Assets section.
Include Caption component with TRANSCRIPT_WORDS for synchronized subtitles.
Use the configured text animation (${config.textAnimation || 'pop'}) for title and CTA scenes.
${storyboard.music && storyboard.music.mood !== 'none' ? 'Include Music component with the specified settings.' : ''}
${sfx.length > 0 ? 'Include Audio components for each sound effect at the specified times.' : ''}`;

    const systemPrompt = `You are an expert Remotion developer. Generate TypeScript/React code.

CRITICAL RULES:
1. Use ONLY the exact asset paths provided in Available Assets. Do NOT invent file names.
2. NEVER add text overlays that say "A-roll", "B-roll", "Main Footage", etc.
3. The viewer should NOT know which clips are A-roll vs B-roll - it should be seamless.

## A-ROLL VS B-ROLL IMPLEMENTATION

A-roll (has speech) → Use VideoSlide component (plays audio)
B-roll (visual support) → Use BRollVideo component (muted by default!)

B-roll should OVERLAY A-roll audio using overlapping Sequences:

\`\`\`tsx
{/* A-roll plays from 0-10s with audio */}
<Sequence from={secondsToFrames(0)} durationInFrames={secondsToFrames(10)}>
  <VideoSlide filename={staticFile('assets/videos/aroll.mp4')} />
</Sequence>

{/* B-roll overlays at 3-6s (muted visual while A-roll audio continues) */}
<Sequence from={secondsToFrames(3)} durationInFrames={secondsToFrames(3)}>
  <BRollVideo filename="assets/videos/broll.mp4" />
</Sequence>
\`\`\`

The B-roll Sequence is placed AFTER in the JSX so it renders ON TOP of A-roll visually,
while A-roll audio continues underneath.

## Required Imports

\`\`\`tsx
import React from 'react';
import { AbsoluteFill, Sequence, staticFile, Audio } from 'remotion';
import { secondsToFrames } from '../../config';
import { createComposition } from '../../utils/createComposition';
import { TitleSlide } from '../../components/TitleSlide';
import { ContentSlide } from '../../components/ContentSlide';
import { VideoSlide } from '../../components/VideoSlide';
import { BRollVideo } from '../../components/BRollVideo';
import { Caption } from '../../components/Caption';
import { Music } from '../../components/Music';
import { AnimatedText } from '../../components/AnimatedText';
import { TRANSCRIPT_WORDS } from './transcript';
\`\`\`

## Component Usage

- TitleSlide: <TitleSlide title="text" className="bg-black text-white" animation="pop" />
- TitleSlide with animation: <TitleSlide title="text" animation="bounce" wordByWord={true} accentColor="#FFD700" />
- ContentSlide: <ContentSlide header="Header" content="Body text" headerAnimation="slide-up" />
- VideoSlide: <VideoSlide filename={staticFile('path/from/manifest')} startTime={0} /> (plays audio)
- VideoSlide with trimming: <VideoSlide filename={staticFile('path')} startTime={1.9} endTime={7.1} /> (auto-trimmed)
- BRollVideo: <BRollVideo filename="path/from/manifest" startTime={0} /> (muted by default)
- Music: <Music src="audio/sample-music.mp3" volume={0.2} fadeInSeconds={1} fadeOutSeconds={2} loop={true} />
- Audio (for SFX): <Audio src={staticFile('assets/sfx/projectid/sfx-id.mp3')} volume={0.5} />
- AnimatedText: <AnimatedText text="Hello" animation="pop" wordByWord={false} />

## AUTO-TRIMMING FOR TIGHTER EDITS (Phase 10.5)

When a scene has assetStartTime > 0 in the storyboard, the video should skip leading silence.
Use the startTime prop on VideoSlide:

\`\`\`tsx
{/* Scene with assetStartTime=1.9 (skip 1.9s of silence) */}
<Sequence from={secondsToFrames(0)} durationInFrames={secondsToFrames(5.2)}>
  <VideoSlide
    filename={staticFile('assets/videos/clip.mp4')}
    startTime={1.9}  {/* Skip to this point in the source video */}
  />
</Sequence>
\`\`\`

This creates professional, tight edits without dead air at the start of clips.

## CAPTIONS (TikTok-style subtitles)

The transcript.ts file is auto-generated with word-level timestamps adjusted to the composition timeline.
Add Caption as the LAST element inside AbsoluteFill so it renders on top of everything.

## BACKGROUND MUSIC

If music settings are provided in the prompt, add the Music component OUTSIDE the AbsoluteFill
at the top level of the returned JSX. Music plays throughout the entire video.

## SOUND EFFECTS (SFX)

If sound effects are provided in the prompt, add them using Remotion's Audio component.
Each SFX should be in its own Sequence at the specified startTime:

\`\`\`tsx
{/* Sound effect at specific time */}
<Sequence from={secondsToFrames(2.5)} durationInFrames={secondsToFrames(1)}>
  <Audio src={staticFile('assets/sfx/projectid/sfx-reveal.mp3')} volume={0.5} />
</Sequence>
\`\`\`

SFX Sequences should be placed AFTER the AbsoluteFill but within the fragment, similar to Music.

\`\`\`tsx
const ${this.projectId.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]+/, 'V').replace(/^./, c => c.toUpperCase())}Composition: React.FC = () => {
  return (
    <>
      {/* Background music plays throughout */}
      <Music
        src="audio/sample-music.mp3"
        volume={0.2}
        fadeInSeconds={1}
        fadeOutSeconds={2}
        loop={true}
      />

      <AbsoluteFill className="bg-black">
        {/* All Sequences for video content */}
        <Sequence from={0} durationInFrames={secondsToFrames(5)}>
          <VideoSlide filename={staticFile('assets/videos/clip.mp4')} />
        </Sequence>

        {/* Caption MUST be last to render on top */}
        <Caption words={TRANSCRIPT_WORDS} />
      </AbsoluteFill>
    </>
  );
};
\`\`\`

## TEXT ANIMATIONS (TikTok-style)

Use the animation prop on TitleSlide and ContentSlide for eye-catching text effects:

Available animations:
- "bounce" - Text bounces in from below with overshoot
- "shake" - Subtle horizontal vibration for emphasis
- "glow" - Pulsing neon text shadow effect
- "typewriter" - Characters appear one by one
- "slide-up" - Smooth slide up with fade
- "pop" - Scale up with spring physics
- "none" - Simple fade in (default)

Example usage:
\`\`\`tsx
{/* Title with pop animation */}
<TitleSlide title="Welcome!" animation="pop" />

{/* Title with word-by-word bounce */}
<TitleSlide
  title="This is Amazing"
  animation="bounce"
  wordByWord={true}
  highlightWords={["Amazing"]}
  accentColor="#FFD700"
/>

{/* Content with animated header */}
<ContentSlide
  header="Key Point"
  content="Description here"
  headerAnimation="slide-up"
/>
\`\`\`

For title and CTA scenes, prefer using dynamic animations (pop, bounce) to grab attention.

## Rules

- Use <Sequence from={secondsToFrames(X)} durationInFrames={secondsToFrames(Y)}>
- B-roll Sequences go AFTER their corresponding A-roll in JSX (to render on top)
- Music component goes OUTSIDE AbsoluteFill at the start (audio layer)
- SFX Audio components go in their own Sequences at specified times
- Caption goes LAST inside AbsoluteFill (after all video Sequences)
- Use Tailwind for styling
- NEVER add explanatory text overlays about clip types
- Use EXACT volume/fade values from the prompt if music is enabled
- Use EXACT paths and timing from the Sound Effects section if SFX are provided
- Use appropriate text animations for title/CTA scenes (pop, bounce, slide-up)

Output ONLY valid TypeScript code, no markdown blocks or explanations.`;

    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 8192,
      },
    });

    let code = response.text || '';

    // Clean up code
    code = code
      .replace(/^```(?:tsx|typescript|ts)?\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    return code;
  }
}

/**
 * Create and execute a pipeline
 */
export async function runPipeline(
  input: PipelineInput,
  onEvent?: EventCallback
): Promise<PipelineResult> {
  const orchestrator = new PipelineOrchestrator(input.projectId);

  if (onEvent) {
    orchestrator.onEvent(onEvent);
  }

  return orchestrator.execute(input);
}
