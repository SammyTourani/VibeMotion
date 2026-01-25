/**
 * Dense Frame Analyzer (Phase 11)
 *
 * Extracts frames at regular intervals (every 1-2 seconds) for richer
 * visual understanding. Includes scene change detection and motion analysis.
 *
 * Key improvements over basic 3-frame extraction:
 * - More frames = better visual context for AI
 * - Scene change detection helps identify cut points
 * - Motion analysis helps classify talking-head vs action shots
 * - Best frame selection for thumbnails
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import type {
  DenseFrameAnalysis,
  FrameAnalysis,
  SceneChange,
  VisualSegment,
  FrameExtractionResult,
} from "./types";

// Set ffmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Initialize Gemini
const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

const MODEL_ID = "gemini-2.0-flash";

// ============================================
// Configuration
// ============================================

/** Target frames per second for extraction (1 frame every N seconds) */
export const DEFAULT_EXTRACTION_INTERVAL = 1.5; // Extract 1 frame every 1.5 seconds

/** Maximum frames to extract (to avoid memory issues) */
export const MAX_FRAMES = 30;

/** Minimum frames to extract */
export const MIN_FRAMES = 5;

/** Frame width for extraction (scaled down for faster processing) */
export const FRAME_WIDTH = 480;

/** Scene change detection threshold (0-1) */
export const SCENE_CHANGE_THRESHOLD = 0.6;

// ============================================
// Frame Extraction
// ============================================

/**
 * Extract frames at regular intervals from a video
 * Returns more frames than the basic 3-frame extraction for richer analysis
 */
export async function extractDenseFrames(
  videoPath: string,
  outputDir: string,
  intervalSeconds: number = DEFAULT_EXTRACTION_INTERVAL
): Promise<FrameExtractionResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoName = path.basename(videoPath, path.extname(videoPath));
  const framePrefix = `${videoName}_dense`;

  console.log(`[DenseFrameAnalyzer] Extracting frames from: ${videoPath}`);

  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error(`[DenseFrameAnalyzer] FFprobe error: ${err.message}`);
        resolve({
          success: false,
          framePaths: [],
          error: `Failed to probe video: ${err.message}`,
        });
        return;
      }

      const duration = metadata.format.duration || 10;

      // Calculate number of frames to extract
      let numFrames = Math.floor(duration / intervalSeconds);
      numFrames = Math.max(MIN_FRAMES, Math.min(numFrames, MAX_FRAMES));

      // Calculate timestamps (evenly distributed)
      const timestamps: number[] = [];
      const actualInterval = duration / numFrames;

      for (let i = 0; i < numFrames; i++) {
        const offset = 0.3; // Avoid very start/end
        const timestamp = Math.min(
          Math.max(i * actualInterval + offset, offset),
          duration - offset
        );
        timestamps.push(timestamp);
      }

      console.log(
        `[DenseFrameAnalyzer] Video duration: ${duration.toFixed(1)}s, extracting ${numFrames} frames`
      );

      const framePaths: string[] = [];
      let completedFrames = 0;
      let hasError = false;

      // Extract frames sequentially to avoid overwhelming ffmpeg
      for (let i = 0; i < timestamps.length; i++) {
        if (hasError) break;

        const timestamp = timestamps[i];
        const framePath = path.join(outputDir, `${framePrefix}_${i.toString().padStart(3, "0")}.jpg`);
        framePaths.push(framePath);

        try {
          await new Promise<void>((resolveFrame, rejectFrame) => {
            ffmpeg(videoPath)
              .seekInput(timestamp)
              .outputOptions([
                `-vframes 1`,
                `-vf scale=${FRAME_WIDTH}:-1`,
                `-q:v 3`,
              ])
              .output(framePath)
              .on("end", () => {
                completedFrames++;
                resolveFrame();
              })
              .on("error", (frameErr) => {
                rejectFrame(frameErr);
              })
              .run();
          });
        } catch (frameErr) {
          if (!hasError) {
            hasError = true;
            console.error(`[DenseFrameAnalyzer] Frame extraction error:`, frameErr);
          }
        }
      }

      if (hasError) {
        resolve({
          success: false,
          framePaths: [],
          error: "Failed to extract some frames",
        });
      } else {
        console.log(`[DenseFrameAnalyzer] Extracted ${completedFrames} frames successfully`);
        resolve({
          success: true,
          framePaths,
          timestamps,
        });
      }
    });
  });
}

// ============================================
// Scene Change Detection
// ============================================

/**
 * Detect scene changes by comparing consecutive frames
 * Uses ffmpeg's scene detection filter for efficiency
 */
export async function detectSceneChanges(
  videoPath: string,
  threshold: number = SCENE_CHANGE_THRESHOLD
): Promise<SceneChange[]> {
  console.log(`[DenseFrameAnalyzer] Detecting scene changes in: ${videoPath}`);

  return new Promise((resolve) => {
    const sceneChanges: SceneChange[] = [];

    ffmpeg(videoPath)
      .outputOptions([
        `-vf select='gt(scene,${threshold})',showinfo`,
        `-f null`,
      ])
      .output("-")
      .on("stderr", (stderrLine: string) => {
        // Parse scene detection output from ffmpeg
        // Format: [Parsed_showinfo_1 @ ...] n:   0 pts: ... t:0.000000 ...
        const match = stderrLine.match(/pts_time:([\d.]+)/);
        if (match) {
          const timestamp = parseFloat(match[1]);
          if (!isNaN(timestamp) && timestamp > 0) {
            sceneChanges.push({
              frameIndex: Math.floor(timestamp * 30), // Approximate frame index
              timestamp,
              changeType: "cut",
              confidence: 0.8,
            });
          }
        }
      })
      .on("end", () => {
        console.log(`[DenseFrameAnalyzer] Detected ${sceneChanges.length} scene changes`);
        resolve(sceneChanges);
      })
      .on("error", (err) => {
        console.warn(`[DenseFrameAnalyzer] Scene detection warning: ${err.message}`);
        resolve([]); // Return empty on error, don't fail the whole process
      })
      .run();
  });
}

// ============================================
// AI-Powered Frame Analysis
// ============================================

/**
 * Analyze multiple frames with Gemini Vision
 * Processes in batches to avoid API limits
 */
export async function analyzeFramesBatch(
  framePaths: string[],
  timestamps: number[]
): Promise<FrameAnalysis[]> {
  if (!genai) {
    console.warn("[DenseFrameAnalyzer] Gemini not available, using basic analysis");
    return framePaths.map((framePath, i) => ({
      index: i,
      timestamp: timestamps[i] || i * DEFAULT_EXTRACTION_INTERVAL,
      path: framePath,
    }));
  }

  console.log(`[DenseFrameAnalyzer] Analyzing ${framePaths.length} frames with AI...`);

  // Process in batches of 6 frames (Gemini can handle multiple images)
  const BATCH_SIZE = 6;
  const analyses: FrameAnalysis[] = [];

  for (let i = 0; i < framePaths.length; i += BATCH_SIZE) {
    const batchPaths = framePaths.slice(i, i + BATCH_SIZE);
    const batchTimestamps = timestamps.slice(i, i + BATCH_SIZE);

    try {
      const batchAnalysis = await analyzeFrameBatch(batchPaths, batchTimestamps, i);
      analyses.push(...batchAnalysis);
    } catch (error) {
      console.error(`[DenseFrameAnalyzer] Batch ${i} analysis failed:`, error);
      // Add basic entries for failed batch
      batchPaths.forEach((framePath, j) => {
        analyses.push({
          index: i + j,
          timestamp: batchTimestamps[j] || (i + j) * DEFAULT_EXTRACTION_INTERVAL,
          path: framePath,
        });
      });
    }
  }

  return analyses;
}

/**
 * Analyze a single batch of frames
 */
async function analyzeFrameBatch(
  framePaths: string[],
  timestamps: number[],
  startIndex: number
): Promise<FrameAnalysis[]> {
  if (!genai) return [];

  // Read frames as base64
  const frameData = await Promise.all(
    framePaths.map(async (framePath) => {
      try {
        const buffer = await fs.readFile(framePath);
        return {
          inlineData: {
            mimeType: "image/jpeg",
            data: buffer.toString("base64"),
          },
        };
      } catch {
        return null;
      }
    })
  );

  const validFrameData = frameData.filter(
    (f): f is { inlineData: { mimeType: string; data: string } } => f !== null
  );
  if (validFrameData.length === 0) return [];

  const prompt = `Analyze these ${validFrameData.length} consecutive frames from a video. For each frame, determine:

1. What subjects are visible (person, face, hands, product, scenery, etc.)
2. Is a person's face clearly visible? (true/false)
3. Does it look like the person is speaking? (true/false - mouth open, animated expression)
4. Brief description (5-10 words max)
5. Quality assessment (0.0-1.0 - is it clear, well-lit, in-focus?)

Output ONLY valid JSON array:
[
  {
    "frameIndex": 0,
    "subjects": ["person", "face"],
    "hasFace": true,
    "isSpeaking": true,
    "description": "Person talking to camera, smiling",
    "qualityScore": 0.85
  }
]

One object per frame, in order. Keep descriptions concise.`;

  try {
    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, ...validFrameData],
        },
      ],
      config: { maxOutputTokens: 2048 },
    });

    const responseText = response.text || "";
    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleanJson);

    return parsed.map((item: {
      frameIndex: number;
      subjects?: string[];
      hasFace?: boolean;
      isSpeaking?: boolean;
      description?: string;
      qualityScore?: number;
    }, i: number) => ({
      index: startIndex + i,
      timestamp: timestamps[i] || (startIndex + i) * DEFAULT_EXTRACTION_INTERVAL,
      path: framePaths[i],
      subjects: item.subjects || [],
      hasFace: item.hasFace || false,
      isSpeaking: item.isSpeaking || false,
      description: item.description || "",
      qualityScore: item.qualityScore || 0.5,
    }));
  } catch (error) {
    console.warn("[DenseFrameAnalyzer] Frame batch analysis failed:", error);
    return framePaths.map((framePath, i) => ({
      index: startIndex + i,
      timestamp: timestamps[i] || (startIndex + i) * DEFAULT_EXTRACTION_INTERVAL,
      path: framePath,
    }));
  }
}

// ============================================
// Visual Segment Detection
// ============================================

/**
 * Identify visual segments based on content type
 * Groups consecutive frames with similar content
 */
export function identifyVisualSegments(
  frames: FrameAnalysis[],
  sceneChanges: SceneChange[],
  videoDuration: number
): VisualSegment[] {
  if (frames.length === 0) return [];

  const segments: VisualSegment[] = [];
  const changeTimestamps = new Set(sceneChanges.map((sc) => sc.timestamp));

  let segmentStart = 0;
  let currentFrames: FrameAnalysis[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    currentFrames.push(frame);

    // Check if we should end this segment
    const isLastFrame = i === frames.length - 1;
    const isSceneChange = changeTimestamps.has(frame.timestamp);
    const nextFrame = frames[i + 1];
    const contentTypeChanged = nextFrame &&
      getContentType(frame) !== getContentType(nextFrame);

    if (isLastFrame || isSceneChange || contentTypeChanged) {
      // End current segment
      const segmentEnd = frame.timestamp;
      const contentType = getMostCommonContentType(currentFrames);
      const motionLevel = calculateSegmentMotion(currentFrames);
      const bestFrame = findBestFrame(currentFrames);

      segments.push({
        startTime: segmentStart,
        endTime: segmentEnd,
        duration: segmentEnd - segmentStart,
        contentType,
        motionLevel,
        bestFrameIndex: bestFrame?.index || currentFrames[0].index,
        description: bestFrame?.description,
      });

      // Start new segment
      if (!isLastFrame) {
        segmentStart = nextFrame?.timestamp || segmentEnd;
        currentFrames = [];
      }
    }
  }

  // Handle final segment if needed
  if (segments.length === 0 && frames.length > 0) {
    segments.push({
      startTime: 0,
      endTime: videoDuration,
      duration: videoDuration,
      contentType: getMostCommonContentType(frames),
      motionLevel: calculateSegmentMotion(frames),
      bestFrameIndex: frames[0].index,
    });
  }

  return segments;
}

/**
 * Determine content type of a frame
 */
function getContentType(
  frame: FrameAnalysis
): VisualSegment["contentType"] {
  const subjects = frame.subjects || [];
  const subjectsLower = subjects.map((s) => s.toLowerCase());

  if (frame.hasFace && frame.isSpeaking) return "talking-head";
  if (frame.hasFace) return "talking-head";
  if (subjectsLower.some((s) => s.includes("hand"))) return "hands";
  if (subjectsLower.some((s) => s.includes("product"))) return "product";
  if (subjectsLower.some((s) => s.includes("scenery") || s.includes("landscape"))) return "scenery";
  if (subjectsLower.some((s) => s.includes("action") || s.includes("motion"))) return "action";

  return "mixed";
}

/**
 * Get most common content type in a set of frames
 */
function getMostCommonContentType(
  frames: FrameAnalysis[]
): VisualSegment["contentType"] {
  const counts = new Map<VisualSegment["contentType"], number>();

  for (const frame of frames) {
    const type = getContentType(frame);
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  let maxType: VisualSegment["contentType"] = "mixed";
  let maxCount = 0;

  counts.forEach((count, type) => {
    if (count > maxCount) {
      maxCount = count;
      maxType = type;
    }
  });

  return maxType;
}

/**
 * Calculate motion level for a segment
 * Based on similarity scores between frames
 */
function calculateSegmentMotion(frames: FrameAnalysis[]): number {
  if (frames.length < 2) return 0.5;

  const similarities = frames
    .filter((f) => f.similarityToPrevious !== undefined)
    .map((f) => f.similarityToPrevious!);

  if (similarities.length === 0) {
    // Estimate based on content - talking heads have less motion
    const hasTalkingHead = frames.some((f) => f.hasFace && f.isSpeaking);
    return hasTalkingHead ? 0.3 : 0.6;
  }

  // Lower similarity = more motion (things changed)
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  return 1 - avgSimilarity;
}

/**
 * Find the best frame in a segment for thumbnails
 */
function findBestFrame(frames: FrameAnalysis[]): FrameAnalysis | null {
  if (frames.length === 0) return null;

  // Prefer frames with faces, good quality
  return frames.reduce((best, frame) => {
    const score =
      (frame.qualityScore || 0.5) +
      (frame.hasFace ? 0.3 : 0) +
      (frame.isSpeaking ? 0.2 : 0);

    const bestScore =
      (best.qualityScore || 0.5) +
      (best.hasFace ? 0.3 : 0) +
      (best.isSpeaking ? 0.2 : 0);

    return score > bestScore ? frame : best;
  }, frames[0]);
}

// ============================================
// Main Analysis Function
// ============================================

/**
 * Perform dense frame analysis on a video
 * Returns comprehensive visual analysis data
 */
export async function analyzeDenseFrames(
  videoPath: string,
  assetId: string,
  outputDir: string
): Promise<DenseFrameAnalysis | null> {
  console.log(`[DenseFrameAnalyzer] Starting dense analysis for: ${assetId}`);

  // Get video duration first
  const duration = await getVideoDuration(videoPath);
  if (!duration) {
    console.error("[DenseFrameAnalyzer] Could not determine video duration");
    return null;
  }

  // Step 1: Extract frames
  const extraction = await extractDenseFrames(
    videoPath,
    path.join(outputDir, assetId)
  );

  if (!extraction.success || extraction.framePaths.length === 0) {
    console.error("[DenseFrameAnalyzer] Frame extraction failed");
    return null;
  }

  const timestamps = extraction.timestamps || extraction.framePaths.map((_, i) =>
    i * DEFAULT_EXTRACTION_INTERVAL
  );

  // Step 2: Detect scene changes (parallel with frame analysis)
  const sceneChangesPromise = detectSceneChanges(videoPath);

  // Step 3: Analyze frames with AI
  const frames = await analyzeFramesBatch(extraction.framePaths, timestamps);

  // Step 4: Get scene changes
  const sceneChanges = await sceneChangesPromise;

  // Step 5: Identify visual segments
  const segments = identifyVisualSegments(frames, sceneChanges, duration);

  // Step 6: Calculate overall motion level
  const motionLevel = segments.length > 0
    ? segments.reduce((sum, s) => sum + s.motionLevel * s.duration, 0) / duration
    : 0.5;

  // Step 7: Identify key frames (best frame from each segment)
  const keyFrameIndices = segments.map((s) => s.bestFrameIndex);

  const analysis: DenseFrameAnalysis = {
    totalFrames: frames.length,
    extractionFps: 1 / DEFAULT_EXTRACTION_INTERVAL,
    frames,
    sceneChanges,
    motionLevel,
    keyFrameIndices,
    segments,
  };

  console.log(
    `[DenseFrameAnalyzer] Complete: ${frames.length} frames, ${sceneChanges.length} scene changes, ${segments.length} segments`
  );

  return analysis;
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        resolve(null);
      } else {
        resolve(metadata.format.duration || null);
      }
    });
  });
}

/**
 * Clean up extracted frames
 */
export async function cleanupDenseFrames(framePaths: string[]): Promise<void> {
  for (const framePath of framePaths) {
    try {
      await fs.unlink(framePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
