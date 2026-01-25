/**
 * Silence Detection Utility
 *
 * Analyzes word-level timestamps to detect silent pauses in video clips.
 * No FFmpeg required - uses transcript data only.
 *
 * Key insight: Silent gaps can be detected by measuring the time between
 * when one word ends and the next word begins:
 *   Silent Gap = nextWord.start - currentWord.end
 */

import {
  TranscriptWord,
  SilenceSegment,
  SilenceAnalysis,
  TrimRecommendation,
} from './types';

// ============================================
// Configuration Constants
// ============================================

/** Minimum gap duration (seconds) to consider as silence */
export const MIN_SILENCE_THRESHOLD = 0.5;

/** Significant silence worth trimming (seconds) */
export const TRIM_THRESHOLD = 1.0;

/** Buffer to keep around speech (seconds) */
export const SPEECH_BUFFER = 0.1;

// ============================================
// Core Detection Functions
// ============================================

/**
 * Detect silent gaps between words in a transcript
 *
 * @param words - Array of words with start/end timestamps
 * @param videoDuration - Total video duration in seconds
 * @param minGap - Minimum gap to consider as silence (default: 0.5s)
 * @returns Array of detected silence segments
 */
export function detectSilence(
  words: TranscriptWord[],
  videoDuration: number,
  minGap: number = MIN_SILENCE_THRESHOLD
): SilenceSegment[] {
  // Need at least one word to detect silence
  if (words.length === 0) {
    // Entire video is silence
    if (videoDuration > minGap) {
      return [{
        start: 0,
        end: videoDuration,
        duration: videoDuration,
        wordBefore: '[START]',
        wordAfter: '[END]',
      }];
    }
    return [];
  }

  const segments: SilenceSegment[] = [];

  // Check for silence at the start (before first word)
  if (words[0].start > minGap) {
    segments.push({
      start: 0,
      end: words[0].start,
      duration: words[0].start,
      wordBefore: '[START]',
      wordAfter: words[0].text,
    });
  }

  // Check gaps between consecutive words
  for (let i = 0; i < words.length - 1; i++) {
    const current = words[i];
    const next = words[i + 1];
    const gap = next.start - current.end;

    if (gap >= minGap) {
      segments.push({
        start: current.end,
        end: next.start,
        duration: gap,
        wordBefore: current.text,
        wordAfter: next.text,
      });
    }
  }

  // Check for silence at the end (after last word)
  const lastWord = words[words.length - 1];
  const endGap = videoDuration - lastWord.end;
  if (endGap > minGap) {
    segments.push({
      start: lastWord.end,
      end: videoDuration,
      duration: endGap,
      wordBefore: lastWord.text,
      wordAfter: '[END]',
    });
  }

  return segments;
}

/**
 * Generate trim recommendations based on silence segments
 *
 * @param segments - Detected silence segments
 * @param videoDuration - Total video duration
 * @param threshold - Minimum silence duration to recommend trimming (default: 1.0s)
 * @returns Array of trim recommendations
 */
export function generateTrimRecommendations(
  segments: SilenceSegment[],
  videoDuration: number,
  threshold: number = TRIM_THRESHOLD
): TrimRecommendation[] {
  const recommendations: TrimRecommendation[] = [];

  for (const segment of segments) {
    if (segment.duration >= threshold) {
      // For significant silences, recommend keeping just a small buffer
      const keepDuration = Math.min(0.3, segment.duration * 0.2);

      recommendations.push({
        originalStart: segment.start,
        originalEnd: segment.end,
        trimmedStart: segment.start,
        trimmedEnd: segment.start + keepDuration,
        reason: `Remove ${(segment.duration - keepDuration).toFixed(1)}s silence between "${segment.wordBefore}" and "${segment.wordAfter}"`,
      });
    }
  }

  return recommendations;
}

/**
 * Perform full silence analysis for a video transcript
 *
 * @param assetId - Unique identifier for the video asset
 * @param words - Array of words with timestamps
 * @param videoDuration - Total video duration in seconds
 * @returns Complete silence analysis with segments and recommendations
 */
export function analyzeVideoSilence(
  assetId: string,
  words: TranscriptWord[],
  videoDuration: number
): SilenceAnalysis {
  const segments = detectSilence(words, videoDuration);
  const totalSilenceDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const silencePercentage = videoDuration > 0
    ? (totalSilenceDuration / videoDuration) * 100
    : 0;

  return {
    assetId,
    segments,
    totalSilenceDuration,
    silencePercentage,
    recommendedTrims: generateTrimRecommendations(segments, videoDuration),
  };
}

// ============================================
// Speech Segment Extraction
// ============================================

/**
 * Calculate optimal playback segments (speech-only)
 * Returns array of continuous speech segments with small buffers
 *
 * @param words - Array of words with timestamps
 * @param videoDuration - Total video duration
 * @param buffer - Buffer to keep around speech (default: 0.1s)
 * @returns Array of speech segments with start/end times
 */
export function getSpeechSegments(
  words: TranscriptWord[],
  videoDuration: number,
  buffer: number = SPEECH_BUFFER
): Array<{ start: number; end: number }> {
  if (words.length === 0) {
    // No speech - return full duration
    return [{ start: 0, end: videoDuration }];
  }

  const speechSegments: Array<{ start: number; end: number }> = [];
  let currentStart = Math.max(0, words[0].start - buffer);
  let currentEnd = words[0].end + buffer;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const gap = word.start - currentEnd;

    if (gap > TRIM_THRESHOLD) {
      // Significant gap - close current segment and start new one
      speechSegments.push({
        start: currentStart,
        end: Math.min(currentEnd, videoDuration),
      });
      currentStart = Math.max(0, word.start - buffer);
    }
    currentEnd = word.end + buffer;
  }

  // Don't forget the last segment
  speechSegments.push({
    start: currentStart,
    end: Math.min(currentEnd, videoDuration),
  });

  return speechSegments;
}

/**
 * Calculate recommended start time to skip leading silence
 *
 * @param words - Array of words with timestamps
 * @param buffer - Buffer before first word (default: 0.1s)
 * @returns Recommended start time in seconds
 */
export function getRecommendedStartTime(
  words: TranscriptWord[],
  buffer: number = SPEECH_BUFFER
): number {
  if (words.length === 0) return 0;
  return Math.max(0, words[0].start - buffer);
}

/**
 * Calculate recommended end time to skip trailing silence
 *
 * @param words - Array of words with timestamps
 * @param videoDuration - Total video duration
 * @param buffer - Buffer after last word (default: 0.1s)
 * @returns Recommended end time in seconds
 */
export function getRecommendedEndTime(
  words: TranscriptWord[],
  videoDuration: number,
  buffer: number = SPEECH_BUFFER
): number {
  if (words.length === 0) return videoDuration;
  const lastWord = words[words.length - 1];
  return Math.min(videoDuration, lastWord.end + buffer);
}

/**
 * Calculate total speech duration (video duration minus silence)
 *
 * @param words - Array of words with timestamps
 * @param videoDuration - Total video duration
 * @returns Effective speech duration in seconds
 */
export function calculateSpeechDuration(
  words: TranscriptWord[],
  videoDuration: number
): number {
  const silenceAnalysis = analyzeVideoSilence('temp', words, videoDuration);
  return videoDuration - silenceAnalysis.totalSilenceDuration;
}

/**
 * Format silence analysis for logging/display
 *
 * @param analysis - Silence analysis result
 * @returns Formatted string summary
 */
export function formatSilenceAnalysis(analysis: SilenceAnalysis): string {
  const lines = [
    `Silence Analysis for ${analysis.assetId}:`,
    `  Total Silence: ${analysis.totalSilenceDuration.toFixed(1)}s (${analysis.silencePercentage.toFixed(1)}%)`,
    `  Silent Gaps: ${analysis.segments.length}`,
  ];

  if (analysis.segments.length > 0) {
    lines.push('  Segments:');
    for (const seg of analysis.segments.slice(0, 5)) {
      lines.push(`    - ${seg.duration.toFixed(1)}s between "${seg.wordBefore}" and "${seg.wordAfter}"`);
    }
    if (analysis.segments.length > 5) {
      lines.push(`    ... and ${analysis.segments.length - 5} more`);
    }
  }

  if (analysis.recommendedTrims.length > 0) {
    lines.push(`  Recommended Trims: ${analysis.recommendedTrims.length}`);
  }

  return lines.join('\n');
}
