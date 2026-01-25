/**
 * Visual Analysis Module
 *
 * Extracts key frames from videos and analyzes them with Gemini Vision
 * to understand what's happening visually in each clip.
 *
 * This gives the AI "eyes" to see the video content, not just "ears"
 * to hear the transcription.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import type { VisualAnalysis, FrameExtractionResult, DenseFrameAnalysis } from "./types";
import { analyzeDenseFrames } from "./dense-frame-analyzer";

// Set ffmpeg path from ffmpeg-static
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Initialize Gemini
const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

const MODEL_ID = "gemini-2.0-flash";

// Frame extraction settings
const DEFAULT_NUM_FRAMES = 3; // beginning, middle, end
const FRAME_WIDTH = 640; // Scale frames to this width for faster API calls

/**
 * Extract key frames from a video file
 *
 * @param videoPath - Full path to the video file
 * @param outputDir - Directory to save extracted frames
 * @param numFrames - Number of frames to extract (default: 3)
 */
export async function extractKeyFrames(
  videoPath: string,
  outputDir: string,
  numFrames: number = DEFAULT_NUM_FRAMES
): Promise<FrameExtractionResult> {
  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });

  // Generate unique prefix for frame files
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const framePrefix = `${videoName}_frame`;

  console.log(`[VisualAnalyzer] Extracting ${numFrames} frames from: ${videoPath}`);

  return new Promise((resolve) => {
    // First, get video duration to calculate frame timestamps
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error(`[VisualAnalyzer] FFprobe error: ${err.message}`);
        resolve({
          success: false,
          framePaths: [],
          error: `Failed to probe video: ${err.message}`,
        });
        return;
      }

      const duration = metadata.format.duration || 10;
      const framePaths: string[] = [];

      // Calculate timestamps for frames (evenly distributed)
      const timestamps: number[] = [];
      for (let i = 0; i < numFrames; i++) {
        // Slightly offset from exact start/end to avoid black frames
        const offset = 0.5; // 0.5 seconds offset
        const position = (i / (numFrames - 1)) * (duration - offset * 2) + offset;
        timestamps.push(Math.max(0.5, Math.min(position, duration - 0.5)));
      }

      console.log(`[VisualAnalyzer] Video duration: ${duration.toFixed(1)}s, extracting at: ${timestamps.map(t => t.toFixed(1)).join(', ')}s`);

      // Extract frames at calculated timestamps
      let completedFrames = 0;
      let hasError = false;

      timestamps.forEach((timestamp, index) => {
        const framePath = path.join(outputDir, `${framePrefix}_${index}.jpg`);
        framePaths.push(framePath);

        ffmpeg(videoPath)
          .seekInput(timestamp)
          .outputOptions([
            `-vframes 1`,
            `-vf scale=${FRAME_WIDTH}:-1`,
            `-q:v 2`, // High quality JPEG
          ])
          .output(framePath)
          .on("end", () => {
            completedFrames++;
            console.log(`[VisualAnalyzer] Extracted frame ${index + 1}/${numFrames}: ${path.basename(framePath)}`);

            if (completedFrames === numFrames && !hasError) {
              resolve({
                success: true,
                framePaths,
              });
            }
          })
          .on("error", (frameErr) => {
            if (!hasError) {
              hasError = true;
              console.error(`[VisualAnalyzer] Frame extraction error: ${frameErr.message}`);
              resolve({
                success: false,
                framePaths: [],
                error: `Failed to extract frame: ${frameErr.message}`,
              });
            }
          })
          .run();
      });
    });
  });
}

/**
 * Analyze extracted frames with Gemini Vision
 *
 * @param framePaths - Paths to the extracted frame images
 * @param assetId - Asset identifier for tracking
 */
export async function analyzeFramesWithVision(
  framePaths: string[],
  assetId: string
): Promise<VisualAnalysis> {
  if (!genai) {
    console.warn("[VisualAnalyzer] Gemini API key not configured, using fallback analysis");
    return createFallbackAnalysis(assetId, framePaths);
  }

  console.log(`[VisualAnalyzer] Analyzing ${framePaths.length} frames for asset: ${assetId}`);

  try {
    // Read frames as base64
    const frameData = await Promise.all(
      framePaths.map(async (framePath) => {
        const buffer = await fs.readFile(framePath);
        return {
          inlineData: {
            mimeType: "image/jpeg",
            data: buffer.toString("base64"),
          },
        };
      })
    );

    const prompt = `Analyze these ${framePaths.length} frames extracted from a video clip. These are from the beginning, middle, and end of the clip.

Your task is to understand what's happening visually in this video and help classify it as either:
- A-roll: Main content featuring a person talking to camera, narration, or primary story content
- B-roll: Supporting footage like scenery, product shots, demonstrations without speech, action shots

Analyze and respond with this exact JSON structure:
{
  "sceneDescription": "One sentence describing what's happening in this video",
  "subjects": ["list", "of", "main", "subjects", "visible"],
  "actions": ["list", "of", "actions", "being", "performed"],
  "mood": "overall mood/tone (professional, casual, energetic, calm, etc.)",
  "suggestedRole": "A-roll" or "B-roll",
  "roleConfidence": 0.0 to 1.0,
  "context": "Additional context that might help with classification"
}

CLASSIFICATION GUIDELINES:
- If a person's face is visible and they appear to be talking → likely A-roll
- If a person is demonstrating something or performing an action → could be either, consider context
- If it's scenery, products, or visuals without a speaking person → likely B-roll
- If it's a close-up of hands doing something → likely B-roll unless there's clear narration context
- If the camera is moving/panning through a space → likely B-roll

Output ONLY valid JSON, no markdown or explanation.`;

    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...frameData,
          ],
        },
      ],
      config: {
        maxOutputTokens: 1024,
      },
    });

    const responseText = response.text || "";

    // Parse JSON response
    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const analysis = JSON.parse(cleanJson);

    console.log(`[VisualAnalyzer] Analysis complete for ${assetId}: ${analysis.suggestedRole} (${(analysis.roleConfidence * 100).toFixed(0)}% confidence)`);

    return {
      assetId,
      framePaths,
      sceneDescription: analysis.sceneDescription || "Unable to analyze",
      subjects: analysis.subjects || [],
      actions: analysis.actions || [],
      mood: analysis.mood || "unknown",
      suggestedRole: analysis.suggestedRole === "A-roll" ? "A-roll" : "B-roll",
      roleConfidence: analysis.roleConfidence || 0.5,
      context: analysis.context || "",
    };
  } catch (error) {
    console.error(`[VisualAnalyzer] Vision analysis failed:`, error);
    return createFallbackAnalysis(assetId, framePaths);
  }
}

/**
 * Create a fallback analysis when Vision API is unavailable
 */
function createFallbackAnalysis(assetId: string, framePaths: string[]): VisualAnalysis {
  return {
    assetId,
    framePaths,
    sceneDescription: "Visual analysis unavailable",
    subjects: [],
    actions: [],
    mood: "unknown",
    suggestedRole: "B-roll", // Default to B-roll when we can't analyze
    roleConfidence: 0.3, // Low confidence
    context: "Fallback analysis - no visual context available",
  };
}

/**
 * Full visual analysis pipeline for a video
 *
 * @param videoPath - Full path to the video file
 * @param assetId - Asset identifier
 * @param framesDir - Directory to store extracted frames
 * @param enableDenseAnalysis - Whether to perform dense frame analysis (Phase 11)
 */
export async function analyzeVideo(
  videoPath: string,
  assetId: string,
  framesDir: string,
  enableDenseAnalysis: boolean = true
): Promise<VisualAnalysis> {
  console.log(`[VisualAnalyzer] Starting full analysis for: ${assetId} (dense=${enableDenseAnalysis})`);

  // Step 1: Extract key frames (3 frames for basic analysis)
  const extraction = await extractKeyFrames(videoPath, framesDir);

  if (!extraction.success) {
    console.error(`[VisualAnalyzer] Frame extraction failed: ${extraction.error}`);
    return createFallbackAnalysis(assetId, []);
  }

  // Step 2: Analyze with Vision (basic 3-frame analysis)
  const analysis = await analyzeFramesWithVision(extraction.framePaths, assetId);

  // Step 3: Dense frame analysis (Phase 11) - more frames, scene changes, motion
  if (enableDenseAnalysis) {
    try {
      const denseAnalysis = await analyzeDenseFrames(
        videoPath,
        assetId,
        path.join(framesDir, "dense")
      );

      if (denseAnalysis) {
        analysis.denseAnalysis = denseAnalysis;

        // Enhance the analysis based on dense frame data
        enhanceAnalysisWithDenseData(analysis, denseAnalysis);

        console.log(`[VisualAnalyzer] Dense analysis complete: ${denseAnalysis.totalFrames} frames, ${denseAnalysis.segments.length} segments`);
      }
    } catch (error) {
      console.warn(`[VisualAnalyzer] Dense analysis failed for ${assetId}:`, error);
      // Continue without dense analysis - basic analysis still works
    }
  }

  // Step 4: Clean up frame files (optional - comment out to keep for debugging)
  // await cleanupFrames(extraction.framePaths);

  return analysis;
}

/**
 * Enhance basic analysis with insights from dense frame analysis
 */
function enhanceAnalysisWithDenseData(
  analysis: VisualAnalysis,
  denseAnalysis: DenseFrameAnalysis
): void {
  // Improve role classification based on segments
  const talkingHeadSegments = denseAnalysis.segments.filter(
    (s) => s.contentType === "talking-head"
  );
  const talkingHeadDuration = talkingHeadSegments.reduce(
    (sum, s) => sum + s.duration,
    0
  );
  const totalDuration = denseAnalysis.segments.reduce(
    (sum, s) => sum + s.duration,
    0
  );

  // If >50% is talking head content, it's likely A-roll
  if (totalDuration > 0 && talkingHeadDuration / totalDuration > 0.5) {
    analysis.suggestedRole = "A-roll";
    analysis.roleConfidence = Math.max(analysis.roleConfidence, 0.85);
    analysis.context += " Dense analysis confirms significant talking-head content.";
  }

  // If high motion and no talking head, likely B-roll
  if (
    denseAnalysis.motionLevel > 0.6 &&
    talkingHeadDuration / totalDuration < 0.2
  ) {
    analysis.suggestedRole = "B-roll";
    analysis.roleConfidence = Math.max(analysis.roleConfidence, 0.8);
    analysis.context += " Dense analysis shows high motion, minimal talking head.";
  }

  // Add segment information to subjects
  const contentTypes = Array.from(new Set(denseAnalysis.segments.map((s) => s.contentType)));
  for (const type of contentTypes) {
    if (!analysis.subjects.includes(type)) {
      analysis.subjects.push(type);
    }
  }

  // Add scene change info to actions if there are multiple cuts
  if (denseAnalysis.sceneChanges.length > 2) {
    analysis.actions.push(`${denseAnalysis.sceneChanges.length} scene cuts`);
  }
}

/**
 * Analyze multiple videos in parallel
 *
 * @param videos - Array of { videoPath, assetId } objects
 * @param framesDir - Base directory for storing frames
 * @param enableDenseAnalysis - Whether to perform dense frame analysis (Phase 11)
 */
export async function analyzeVideos(
  videos: Array<{ videoPath: string; assetId: string }>,
  framesDir: string,
  enableDenseAnalysis: boolean = true
): Promise<Map<string, VisualAnalysis>> {
  console.log(`[VisualAnalyzer] Analyzing ${videos.length} videos (dense=${enableDenseAnalysis})...`);

  const results = new Map<string, VisualAnalysis>();

  // Process videos in parallel (but with some concurrency limit)
  // Reduce concurrency when doing dense analysis to avoid overwhelming the system
  const CONCURRENCY = enableDenseAnalysis ? 2 : 3;
  for (let i = 0; i < videos.length; i += CONCURRENCY) {
    const batch = videos.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(({ videoPath, assetId }) =>
        analyzeVideo(videoPath, assetId, path.join(framesDir, assetId), enableDenseAnalysis)
      )
    );

    batchResults.forEach((analysis) => {
      results.set(analysis.assetId, analysis);
    });
  }

  console.log(`[VisualAnalyzer] Complete: analyzed ${results.size} videos`);
  return results;
}

/**
 * Clean up extracted frame files
 * Exported for use when frames are no longer needed
 */
export async function cleanupFrames(framePaths: string[]): Promise<void> {
  for (const framePath of framePaths) {
    try {
      await fs.unlink(framePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
