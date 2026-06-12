import { describe, it, expect } from "vitest";
import {
  validateTranscript,
  hasLikelyHallucinations,
  getTranscriptQuality,
} from "../lib/pipeline/transcript-validator";
import type { TranscriptWord } from "../lib/pipeline/types";

describe("validateTranscript", () => {
  it("removes zero-duration, empty, and known hallucination phrases", () => {
    const words: TranscriptWord[] = [
      { text: "real", start: 0, end: 0.3 },
      { text: "zero", start: 0.4, end: 0.4 }, // zero duration
      { text: "", start: 0.5, end: 0.7 }, // empty
      { text: "thank you for watching", start: 1, end: 1.5 }, // hallucination
      { text: "[Music]", start: 2, end: 2.3 }, // bracketed annotation
    ];
    const result = validateTranscript(words);

    expect(result.validWords).toEqual([{ text: "real", start: 0, end: 0.3 }]);
    expect(result.stats.originalCount).toBe(5);
    expect(result.stats.validCount).toBe(1);
    expect(result.stats.removedCount).toBe(4);
    expect(result.stats.removalReasons).toEqual({
      zero_duration: 1,
      empty_word: 1,
      hallucination_phrase: 2,
    });
  });

  it("removes sub-50ms words as short_duration", () => {
    const words: TranscriptWord[] = [
      { text: "ok", start: 0, end: 0.04 }, // 40ms < 50ms min
      { text: "good", start: 0.1, end: 0.6 },
    ];
    const result = validateTranscript(words);
    expect(result.stats.removalReasons.short_duration).toBe(1);
    expect(result.validWords).toEqual([{ text: "good", start: 0.1, end: 0.6 }]);
  });

  it("drops all-but-the-first word in a run of 3+ identical timestamps", () => {
    const words: TranscriptWord[] = [
      { text: "a", start: 1, end: 1.1 },
      { text: "b", start: 2, end: 2.1 },
      { text: "c", start: 2, end: 2.1 },
      { text: "d", start: 2, end: 2.1 },
      { text: "e", start: 3, end: 3.1 },
    ];
    const result = validateTranscript(words);
    expect(result.stats.validCount).toBe(3);
    expect(result.stats.removalReasons.identical_timestamps).toBe(2);
    // first of the identical run survives
    expect(result.validWords.map((w) => w.text)).toEqual(["a", "b", "e"]);
  });

  it("keeps a pair of identical timestamps (run shorter than 3)", () => {
    const words: TranscriptWord[] = [
      { text: "a", start: 2, end: 2.1 },
      { text: "b", start: 2, end: 2.1 },
    ];
    const result = validateTranscript(words);
    expect(result.stats.validCount).toBe(2);
  });

  it("honors disabled filters", () => {
    const words: TranscriptWord[] = [{ text: "", start: 0, end: 0 }];
    const result = validateTranscript(words, {
      filterEmptyWords: false,
      filterZeroDuration: false,
    });
    expect(result.stats.validCount).toBe(1);
  });

  it("normalizes output words to only text/start/end", () => {
    const result = validateTranscript([
      { text: "x", start: 0, end: 0.5, extra: "junk" } as TranscriptWord,
    ]);
    expect(result.validWords[0]).toEqual({ text: "x", start: 0, end: 0.5 });
    expect(Object.keys(result.validWords[0])).toEqual(["text", "start", "end"]);
  });
});

describe("hasLikelyHallucinations", () => {
  it("returns false for transcripts with fewer than 3 words", () => {
    expect(hasLikelyHallucinations([{ text: "a", start: 0, end: 0.1 }])).toBe(false);
    expect(
      hasLikelyHallucinations([
        { text: "a", start: 0, end: 0.1 },
        { text: "b", start: 1, end: 1.1 },
      ])
    ).toBe(false);
  });

  it("detects a run of 3+ identical start times", () => {
    expect(
      hasLikelyHallucinations([
        { text: "a", start: 1, end: 1.1 },
        { text: "b", start: 2, end: 2.1 },
        { text: "c", start: 2, end: 2.1 },
        { text: "d", start: 2, end: 2.1 },
        { text: "e", start: 3, end: 3.1 },
      ])
    ).toBe(true);
  });

  it("detects when more than 30% of words have zero duration", () => {
    expect(
      hasLikelyHallucinations([
        { text: "a", start: 0, end: 0 },
        { text: "b", start: 1, end: 1 },
        { text: "c", start: 2, end: 2.3 },
      ])
    ).toBe(true);
  });

  it("returns false for a clean transcript", () => {
    expect(
      hasLikelyHallucinations([
        { text: "a", start: 0, end: 0.3 },
        { text: "b", start: 0.5, end: 0.8 },
        { text: "c", start: 1.0, end: 1.3 },
      ])
    ).toBe(false);
  });
});

describe("getTranscriptQuality", () => {
  it("scores an empty transcript as 0", () => {
    expect(getTranscriptQuality([])).toBe(0);
  });

  it("scores a clean transcript as 100", () => {
    expect(
      getTranscriptQuality([
        { text: "a", start: 0, end: 0.4 },
        { text: "b", start: 0.5, end: 0.9 },
        { text: "c", start: 1.0, end: 1.4 },
      ])
    ).toBe(100);
  });

  it("applies the zero-duration and short-average penalties", () => {
    // both words zero-duration: -50 (100% zero), no identical-start run, avg<0.1: -20 => 30
    expect(
      getTranscriptQuality([
        { text: "a", start: 0, end: 0 },
        { text: "b", start: 1, end: 1 },
      ])
    ).toBe(30);
  });

  it("never returns a negative score", () => {
    const allBad: TranscriptWord[] = Array.from({ length: 5 }, () => ({
      text: "x",
      start: 0,
      end: 0,
    }));
    expect(getTranscriptQuality(allBad)).toBeGreaterThanOrEqual(0);
  });
});
