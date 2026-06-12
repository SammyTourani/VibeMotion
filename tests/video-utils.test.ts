import { describe, it, expect } from "vitest";
import { formatFileSize, formatDuration } from "../lib/video-utils";

describe("formatFileSize", () => {
  it("returns '0 Bytes' for zero", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("formats bytes, KB, MB, and GB", () => {
    expect(formatFileSize(512)).toBe("512 Bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("rounds to two decimal places", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB"); // 1.5 KB exactly
    expect(formatFileSize(1234567)).toBe("1.18 MB"); // 1.1773... -> 1.18
  });
});

describe("formatDuration", () => {
  it("formats as M:SS with a zero-padded seconds field", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(605)).toBe("10:05");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(59.9)).toBe("0:59");
    expect(formatDuration(60.4)).toBe("1:00");
  });
});
