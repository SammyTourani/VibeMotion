import { describe, it, expect } from "vitest";
import {
  secondsToFrames,
  framesToSeconds,
  getDurationInFrames,
  DEFAULT_FPS,
  VIDEO_CONFIG,
} from "../src/config";

describe("timing utilities", () => {
  it("defaults to 60fps", () => {
    expect(DEFAULT_FPS).toBe(60);
  });

  describe("secondsToFrames", () => {
    it("converts at the default 60fps", () => {
      expect(secondsToFrames(2.5)).toBe(150);
      expect(secondsToFrames(0)).toBe(0);
      expect(secondsToFrames(1)).toBe(60);
    });

    it("supports a custom fps", () => {
      expect(secondsToFrames(2.5, 30)).toBe(75);
    });

    it("rounds to the nearest whole frame", () => {
      // 2.504 * 60 = 150.24 -> 150
      expect(secondsToFrames(2.504)).toBe(150);
      // 2.51 * 60 = 150.6 -> 151
      expect(secondsToFrames(2.51)).toBe(151);
    });
  });

  describe("framesToSeconds", () => {
    it("converts at the default 60fps", () => {
      expect(framesToSeconds(150)).toBe(2.5);
      expect(framesToSeconds(0)).toBe(0);
    });

    it("supports a custom fps", () => {
      expect(framesToSeconds(150, 30)).toBe(5);
    });

    it("round-trips with secondsToFrames for whole-frame inputs", () => {
      expect(framesToSeconds(secondsToFrames(3))).toBe(3);
    });
  });

  it("keeps getDurationInFrames as an alias of secondsToFrames", () => {
    expect(getDurationInFrames).toBe(secondsToFrames);
    expect(getDurationInFrames(2.5)).toBe(150);
  });

  it("exposes a 1280x720 @ 60fps base config", () => {
    expect(VIDEO_CONFIG).toEqual({ width: 1280, height: 720, fps: 60 });
  });
});
