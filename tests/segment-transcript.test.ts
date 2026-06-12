import { describe, it, expect } from "vitest";
import {
  segmentTranscript,
  type TranscriptWord,
} from "../src/utils/segmentTranscript";

const tw = (
  word: string,
  start: number,
  end: number,
  punctuated?: string
): TranscriptWord => ({
  word,
  start,
  end,
  confidence: 0.9,
  punctuated_word: punctuated ?? word,
});

describe("segmentTranscript", () => {
  it("returns no segments for an empty word list", () => {
    expect(segmentTranscript([])).toEqual([]);
  });

  it("puts a single word into one segment with matching start/end times", () => {
    const segments = segmentTranscript([tw("Word", 0, 0.5)]);
    expect(segments).toEqual([
      {
        id: 0,
        startTime: 0,
        endTime: 0.5,
        words: [{ text: "Word", start: 0, end: 0.5 }],
      },
    ]);
  });

  it("breaks on a sentence ender once minWords (4) is reached", () => {
    // "Hello there my friend." -> sentence end at word 4 -> first segment closes.
    const words = [
      tw("Hello", 0, 0.3),
      tw("there", 0.3, 0.6),
      tw("my", 0.6, 0.8),
      tw("friend", 0.8, 1.1, "friend."),
      tw("This", 1.1, 1.3),
      tw("is", 1.3, 1.4),
      tw("a", 1.4, 1.5),
      tw("test", 1.5, 1.8),
      tw("of", 1.8, 1.9),
      tw("things", 1.9, 2.2),
    ];
    const segments = segmentTranscript(words);
    expect(segments).toHaveLength(2);
    expect(segments[0].words.map((w) => w.text)).toEqual(["Hello", "there", "my", "friend."]);
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(1.1);
    expect(segments[1].id).toBe(1);
    expect(segments[1].startTime).toBe(1.1);
    expect(segments[1].endTime).toBe(2.2);
  });

  it("does NOT break on a sentence ender before minWords is reached", () => {
    // Period after the 2nd word (< minWords 4) should not split there.
    const words = [
      tw("Yes", 0, 0.3, "Yes."),
      tw("ok", 0.3, 0.6, "ok."),
      tw("then", 0.6, 0.9),
      tw("we", 0.9, 1.1),
      tw("go", 1.1, 1.4, "go."),
    ];
    const segments = segmentTranscript(words);
    // First period at word 2 is below minWords, so the whole thing stays one segment.
    expect(segments).toHaveLength(1);
    expect(segments[0].words).toHaveLength(5);
  });

  it("force-breaks at maxWords (12) even without punctuation", () => {
    const words = Array.from({ length: 15 }, (_, i) => tw(`w${i}`, i, i + 0.5));
    const segments = segmentTranscript(words);
    expect(segments[0].words).toHaveLength(12); // forced break at max
    expect(segments[1].words).toHaveLength(3); // remainder closed by last-word rule
  });

  it("breaks on a comma only once targetWords (8) is reached", () => {
    const words = [
      ...Array.from({ length: 7 }, (_, i) => tw(`a${i}`, i, i + 0.4)),
      tw("eighth", 8, 8.4, "eighth,"), // comma at the 8th word -> break
      tw("ninth", 9, 9.4),
    ];
    const segments = segmentTranscript(words);
    expect(segments).toHaveLength(2);
    expect(segments[0].words).toHaveLength(8);
    expect(segments[1].words.map((w) => w.text)).toEqual(["ninth"]);
  });

  it("respects forceBreakAfter overrides", () => {
    const words = [tw("a", 0, 0.3), tw("b", 0.3, 0.6), tw("c", 0.6, 0.9)];
    const segments = segmentTranscript(words, { forceBreakAfter: [0] });
    expect(segments).toHaveLength(2);
    expect(segments[0].words.map((w) => w.text)).toEqual(["a"]);
    expect(segments[1].words.map((w) => w.text)).toEqual(["b", "c"]);
  });

  it("respects preventBreakAfter overrides at a sentence end", () => {
    const words = [
      tw("one", 0, 0.3),
      tw("two", 0.3, 0.6),
      tw("three", 0.6, 0.9),
      tw("four", 0.9, 1.2, "four."), // would normally break here (>= minWords)
      tw("five", 1.2, 1.5),
    ];
    const segments = segmentTranscript(words, { preventBreakAfter: [3] });
    // The prevented break keeps everything in one segment (last-word rule still applies).
    expect(segments).toHaveLength(1);
    expect(segments[0].words).toHaveLength(5);
  });

  it("honors a custom segmentation config", () => {
    const words = Array.from({ length: 6 }, (_, i) => tw(`w${i}`, i, i + 0.5));
    const segments = segmentTranscript(words, { config: { maxWords: 3 } });
    expect(segments[0].words).toHaveLength(3);
    expect(segments[1].words).toHaveLength(3);
  });
});
