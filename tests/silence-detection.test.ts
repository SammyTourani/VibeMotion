import { describe, it, expect } from "vitest";
import {
  detectSilence,
  generateTrimRecommendations,
  analyzeVideoSilence,
  getSpeechSegments,
  getRecommendedStartTime,
  getRecommendedEndTime,
  calculateSpeechDuration,
  formatSilenceAnalysis,
  MIN_SILENCE_THRESHOLD,
  TRIM_THRESHOLD,
  SPEECH_BUFFER,
} from "../lib/pipeline/silence-detection";
import type { TranscriptWord } from "../lib/pipeline/types";

// "again" starts 2.0s after "world" ends -> one inner silent gap; trailing 1.6s gap.
const WORDS: TranscriptWord[] = [
  { text: "hello", start: 0.2, end: 0.5 },
  { text: "world", start: 0.7, end: 1.0 },
  { text: "again", start: 3.0, end: 3.4 },
];

describe("config constants", () => {
  it("exposes the documented thresholds", () => {
    expect(MIN_SILENCE_THRESHOLD).toBe(0.5);
    expect(TRIM_THRESHOLD).toBe(1.0);
    expect(SPEECH_BUFFER).toBe(0.1);
  });
});

describe("detectSilence", () => {
  it("finds the gap between words and the trailing tail", () => {
    const segments = detectSilence(WORDS, 5);
    expect(segments).toEqual([
      { start: 1.0, end: 3.0, duration: 2.0, wordBefore: "world", wordAfter: "again" },
      { start: 3.4, end: 5, duration: 1.6, wordBefore: "again", wordAfter: "[END]" },
    ]);
  });

  it("treats an empty transcript as fully silent when video is longer than the gap", () => {
    expect(detectSilence([], 5)).toEqual([
      { start: 0, end: 5, duration: 5, wordBefore: "[START]", wordAfter: "[END]" },
    ]);
  });

  it("returns no silence for an empty transcript shorter than the min gap", () => {
    // videoDuration 0.3 is not > the default 0.5 min gap.
    expect(detectSilence([], 0.3)).toEqual([]);
  });

  it("emits inner gaps at exactly the min gap (>=) but not leading silence at exactly the min gap (>)", () => {
    // A single word starting at exactly 0.5 (== default min gap):
    // leading silence uses a strict `>` so it is NOT emitted; only the tail is.
    const segments = detectSilence([{ text: "x", start: 0.5, end: 1.0 }], 5);
    expect(segments).toEqual([
      { start: 1.0, end: 5, duration: 4.0, wordBefore: "x", wordAfter: "[END]" },
    ]);
  });

  it("emits leading silence when the first word starts after the min gap", () => {
    const segments = detectSilence([{ text: "x", start: 1.2, end: 1.5 }], 5);
    expect(segments[0]).toEqual({
      start: 0,
      end: 1.2,
      duration: 1.2,
      wordBefore: "[START]",
      wordAfter: "x",
    });
  });

  it("respects a custom minimum gap", () => {
    // With a 3s min gap, the 2.0s inner gap is no longer silence; only the 1.6s tail is too small as well.
    expect(detectSilence(WORDS, 5, 3)).toEqual([]);
  });
});

describe("generateTrimRecommendations", () => {
  it("recommends trims for gaps at/above the threshold, keeping min(0.3, 20%)", () => {
    const recs = generateTrimRecommendations(detectSilence(WORDS, 5), 5);
    expect(recs).toHaveLength(2);
    // 2.0s gap: keep min(0.3, 0.4) = 0.3 -> trimmedEnd 1.3
    expect(recs[0].trimmedStart).toBe(1.0);
    expect(recs[0].trimmedEnd).toBeCloseTo(1.3, 10);
    expect(recs[0].reason).toContain('silence between "world" and "again"');
    // 1.6s gap: keep min(0.3, 0.32) = 0.3
    expect(recs[1].trimmedEnd - recs[1].trimmedStart).toBeCloseTo(0.3, 10);
  });

  it("ignores gaps shorter than the threshold", () => {
    const shortGaps = [
      { start: 0, end: 0.6, duration: 0.6, wordBefore: "a", wordAfter: "b" },
    ];
    expect(generateTrimRecommendations(shortGaps, 5)).toEqual([]);
  });
});

describe("analyzeVideoSilence", () => {
  it("aggregates total silence and percentage", () => {
    const analysis = analyzeVideoSilence("clip-1", WORDS, 5);
    expect(analysis.assetId).toBe("clip-1");
    expect(analysis.totalSilenceDuration).toBeCloseTo(3.6, 10);
    expect(analysis.silencePercentage).toBeCloseTo(72, 10);
    expect(analysis.segments).toHaveLength(2);
    expect(analysis.recommendedTrims).toHaveLength(2);
  });

  it("reports 0% silence for a zero-duration video without dividing by zero", () => {
    const analysis = analyzeVideoSilence("clip-2", [], 0);
    expect(analysis.silencePercentage).toBe(0);
  });
});

describe("getSpeechSegments", () => {
  it("buffers speech and splits on gaps larger than the trim threshold", () => {
    // The 2.0s gap (> 1.0 TRIM_THRESHOLD) splits into two buffered segments.
    expect(getSpeechSegments(WORDS, 5)).toEqual([
      { start: 0.1, end: 1.1 },
      { start: 2.9, end: 3.5 },
    ]);
  });

  it("returns the full duration when there is no speech", () => {
    expect(getSpeechSegments([], 5)).toEqual([{ start: 0, end: 5 }]);
  });

  it("clamps the final segment end to the video duration", () => {
    const segments = getSpeechSegments([{ text: "a", start: 0, end: 4.95 }], 5);
    expect(segments[0].end).toBe(5); // 4.95 + 0.1 buffer clamped to 5
  });
});

describe("recommended start/end times", () => {
  it("subtracts the buffer from the first word but never goes below zero", () => {
    expect(getRecommendedStartTime(WORDS)).toBeCloseTo(0.1, 10);
    expect(getRecommendedStartTime([{ text: "a", start: 0.05, end: 1 }])).toBe(0);
    expect(getRecommendedStartTime([])).toBe(0);
  });

  it("adds the buffer to the last word but never exceeds the video duration", () => {
    expect(getRecommendedEndTime(WORDS, 5)).toBeCloseTo(3.5, 10);
    expect(getRecommendedEndTime([{ text: "a", start: 0, end: 4.99 }], 5)).toBe(5);
    expect(getRecommendedEndTime([], 5)).toBe(5);
  });
});

describe("calculateSpeechDuration", () => {
  it("returns video duration minus total silence", () => {
    expect(calculateSpeechDuration(WORDS, 5)).toBeCloseTo(1.4, 10);
  });
});

describe("formatSilenceAnalysis", () => {
  it("produces a human-readable summary", () => {
    const out = formatSilenceAnalysis(analyzeVideoSilence("clip-1", WORDS, 5));
    expect(out).toContain("Silence Analysis for clip-1:");
    expect(out).toContain("Total Silence: 3.6s (72.0%)");
    expect(out).toContain("Silent Gaps: 2");
    expect(out).toContain("Recommended Trims: 2");
  });
});
