import { describe, it, expect } from "vitest";
import {
  preClassifyBySpeechDensity,
  generateDefaultSuggestedUse,
  classifyClipsHeuristic,
  THRESHOLDS,
} from "../lib/pipeline/classification-heuristics";
import type { VideoTranscript, VisualAnalysis } from "../lib/pipeline/types";

function transcript(over: Partial<VideoTranscript> = {}): VideoTranscript {
  return {
    assetId: "a1",
    publicPath: "/videos/clip1.mp4",
    text: "hello world",
    words: [],
    duration: 10,
    wordCount: 30,
    speechDensity: 3.0,
    ...over,
  };
}

function visual(over: Partial<VisualAnalysis> = {}): VisualAnalysis {
  return {
    assetId: "a1",
    framePaths: [],
    sceneDescription: "",
    subjects: [],
    actions: [],
    mood: "",
    suggestedRole: "A-roll",
    roleConfidence: 0.9,
    context: "",
    ...over,
  };
}

describe("THRESHOLDS", () => {
  it("matches the documented speech-density cutoffs", () => {
    expect(THRESHOLDS.A_ROLL_HIGH).toBe(2.0);
    expect(THRESHOLDS.B_ROLL_LOW).toBe(0.3);
  });
});

describe("preClassifyBySpeechDensity (speech density only)", () => {
  it("classifies dense speech as high-confidence A-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 3.0, wordCount: 30, duration: 10 }))
    ).toEqual({ role: "A-roll", confidence: 0.9 });
  });

  it("classifies very sparse speech as B-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 0.2, wordCount: 5, duration: 10 }))
    ).toEqual({ role: "B-roll", confidence: 0.85 });
  });

  it("classifies near-empty/very-short clips as high-confidence B-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ wordCount: 1, duration: 0.5 }))
    ).toEqual({ role: "B-roll", confidence: 0.95 });
  });

  it("flags a mid-range density above 1.0 as low-confidence A-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 1.5, wordCount: 10, duration: 8 }))
    ).toEqual({ role: "A-roll", confidence: 0.5 });
  });

  it("flags a mid-range density at/below 1.0 as low-confidence B-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 0.8, wordCount: 10, duration: 12 }))
    ).toEqual({ role: "B-roll", confidence: 0.5 });
  });

  it("treats the A_ROLL_HIGH threshold (2.0) as inclusive A-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 2.0, wordCount: 20, duration: 10 })).role
    ).toBe("A-roll");
  });

  it("treats the B_ROLL_LOW threshold (0.3) as inclusive B-roll", () => {
    expect(
      preClassifyBySpeechDensity(transcript({ speechDensity: 0.3, wordCount: 4, duration: 13 }))
    ).toEqual({ role: "B-roll", confidence: 0.85 });
  });
});

describe("preClassifyBySpeechDensity (with visual analysis)", () => {
  it("returns very-high-confidence A-roll when a person is visibly talking with speech", () => {
    expect(
      preClassifyBySpeechDensity(
        transcript({ speechDensity: 1.2 }),
        visual({ subjects: ["person"], actions: ["talking to camera"], roleConfidence: 0.9 })
      )
    ).toEqual({ role: "A-roll", confidence: 0.95 });
  });

  it("trusts a confident B-roll visual when speech density is below A_ROLL_HIGH", () => {
    expect(
      preClassifyBySpeechDensity(
        transcript({ speechDensity: 0.5 }),
        visual({ suggestedRole: "B-roll", subjects: ["scenery"], actions: ["panning"], roleConfidence: 0.8 })
      )
    ).toEqual({ role: "B-roll", confidence: 0.85 });
  });

  it("uses max(0.85, visualConfidence) for confident B-roll visuals", () => {
    const result = preClassifyBySpeechDensity(
      transcript({ speechDensity: 0.5 }),
      visual({ suggestedRole: "B-roll", subjects: ["product"], actions: ["close up"], roleConfidence: 0.92 })
    );
    expect(result).toEqual({ role: "B-roll", confidence: 0.92 });
  });

  it("returns low-confidence A-roll when visual suggests A-roll but there is no speech", () => {
    expect(
      preClassifyBySpeechDensity(
        transcript({ wordCount: 1, speechDensity: 0 }),
        visual({ suggestedRole: "A-roll", subjects: ["face"], actions: ["smiling"], roleConfidence: 0.8 })
      )
    ).toEqual({ role: "A-roll", confidence: 0.5 });
  });

  it("lowers the empty-clip confidence to 0.7 when visual context is present", () => {
    expect(
      preClassifyBySpeechDensity(
        transcript({ wordCount: 1, duration: 0.5, speechDensity: 0 }),
        visual({ suggestedRole: "B-roll", subjects: ["wall"], actions: ["static"], roleConfidence: 0.4 })
      )
    ).toEqual({ role: "B-roll", confidence: 0.7 });
  });
});

describe("generateDefaultSuggestedUse", () => {
  it("suggests trimming for long A-roll", () => {
    expect(generateDefaultSuggestedUse("A-roll", transcript({ duration: 15 }))).toBe(
      "Use as main segment, consider trimming to key moments"
    );
  });

  it("suggests primary use for short A-roll", () => {
    expect(generateDefaultSuggestedUse("A-roll", transcript({ duration: 5 }))).toBe(
      "Use as primary content in sequence"
    );
  });

  it("suggests a quick cutaway for very short B-roll", () => {
    expect(generateDefaultSuggestedUse("B-roll", transcript({ duration: 2 }))).toBe(
      "Quick cutaway or transition shot"
    );
  });

  it("suggests support footage for longer B-roll", () => {
    expect(generateDefaultSuggestedUse("B-roll", transcript({ duration: 6 }))).toBe(
      "Use to illustrate or support A-roll content"
    );
  });
});

describe("classifyClipsHeuristic", () => {
  it("classifies a mixed batch and summarizes A-roll/B-roll counts", () => {
    const result = classifyClipsHeuristic([
      transcript({ assetId: "x", publicPath: "/v/talk.mp4", speechDensity: 3.0, wordCount: 30, duration: 10 }),
      transcript({ assetId: "y", publicPath: "/v/broll.mp4", speechDensity: 0.1, wordCount: 1, duration: 5 }),
    ]);

    expect(result.summary.totalClips).toBe(2);
    expect(result.summary.aRollCount).toBe(1);
    expect(result.summary.bRollCount).toBe(1);
    expect(result.summary.totalDuration).toBe(15);
    // A-roll duration 10 / 15 = 0.67 > 0.5 -> strong
    expect(result.summary.narrativeStrength).toBe("strong");

    const talk = result.clips.find((c) => c.assetId === "x")!;
    expect(talk.role).toBe("A-roll");
    expect(talk.name).toBe("talk.mp4"); // derived from publicPath basename
    expect(talk.confidence).toBe(0.9);
  });

  it("reports weak narrative strength when B-roll dominates", () => {
    const result = classifyClipsHeuristic([
      transcript({ assetId: "b1", publicPath: "/v/b1.mp4", speechDensity: 0.1, wordCount: 1, duration: 8 }),
      transcript({ assetId: "b2", publicPath: "/v/b2.mp4", speechDensity: 0.1, wordCount: 1, duration: 8 }),
    ]);
    expect(result.summary.aRollCount).toBe(0);
    expect(result.summary.narrativeStrength).toBe("weak");
  });

  it("does not divide by zero for an empty clip list", () => {
    const result = classifyClipsHeuristic([]);
    expect(result.summary.totalClips).toBe(0);
    expect(result.summary.totalDuration).toBe(0);
    expect(result.summary.narrativeStrength).toBe("weak");
    expect(result.clips).toEqual([]);
  });

  it("falls back to 'unknown' when a path has no basename", () => {
    const result = classifyClipsHeuristic([
      transcript({ assetId: "z", publicPath: "", speechDensity: 3.0, wordCount: 30, duration: 10 }),
    ]);
    expect(result.clips[0].name).toBe("unknown");
  });
});
