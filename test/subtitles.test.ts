import { describe, it, expect } from "vitest";
import {
  formatSrtTimestamp,
  generateSrt,
  splitIntoChunks,
  buildSubtitleEntries,
  buildSubtitleFilter,
  type SrtEntry,
} from "../src/subtitles.js";

describe("formatSrtTimestamp", () => {
  it("formats zero seconds", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
  });

  it("formats fractional seconds", () => {
    expect(formatSrtTimestamp(1.5)).toBe("00:00:01,500");
  });

  it("formats minutes", () => {
    expect(formatSrtTimestamp(65.25)).toBe("00:01:05,250");
  });

  it("formats hours", () => {
    expect(formatSrtTimestamp(3661.1)).toBe("01:01:01,100");
  });

  it("handles large values", () => {
    expect(formatSrtTimestamp(7200)).toBe("02:00:00,000");
  });
});

describe("generateSrt", () => {
  it("generates valid SRT from entries", () => {
    const entries: SrtEntry[] = [
      { index: 1, startSec: 0, endSec: 3.5, text: "Welcome to the app." },
      { index: 2, startSec: 3.5, endSec: 7, text: "Here is the dashboard." },
    ];

    const srt = generateSrt(entries);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:03,500\nWelcome to the app.");
    expect(srt).toContain("2\n00:00:03,500 --> 00:00:07,000\nHere is the dashboard.");
  });

  it("separates entries with blank lines", () => {
    const entries: SrtEntry[] = [
      { index: 1, startSec: 0, endSec: 2, text: "First" },
      { index: 2, startSec: 2, endSec: 4, text: "Second" },
    ];

    const srt = generateSrt(entries);
    expect(srt).toContain("First\n\n2\n");
  });

  it("handles empty entries array", () => {
    const srt = generateSrt([]);
    expect(srt).toBe("\n");
  });
});

describe("splitIntoChunks", () => {
  it("returns single chunk for short text", () => {
    expect(splitIntoChunks("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits on sentence boundaries", () => {
    const chunks = splitIntoChunks("First sentence. Second sentence. Third.");
    expect(chunks).toEqual(["First sentence.", "Second sentence.", "Third."]);
  });

  it("splits long sentences into maxWords chunks", () => {
    const text = "One two three four five six seven eight nine ten eleven twelve.";
    const chunks = splitIntoChunks(text, 5);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.split(/\s+/).length).toBeLessThanOrEqual(5));
  });

  it("handles text without punctuation", () => {
    const chunks = splitIntoChunks("a b c d e f g h i j k l", 5);
    expect(chunks.length).toBe(3); // 5 + 5 + 2
  });
});

describe("buildSubtitleEntries", () => {
  it("creates entries for segments with narration scripts", () => {
    const segments = [
      { name: "Home", videoPath: "/tmp/v1.webm", trimSec: 1, narrationScript: "Welcome" },
      { name: "About", videoPath: "/tmp/v2.webm", trimSec: 0.5 },
      { name: "Features", videoPath: "/tmp/v3.webm", trimSec: 1, narrationScript: "Check out features" },
    ];
    const durations = [5, 3, 4];

    const entries = buildSubtitleEntries(segments, durations);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      index: 1,
      startSec: 0,
      endSec: 5,
      text: "Welcome",
    });
    expect(entries[1]).toEqual({
      index: 2,
      startSec: 8, // 5 + 3
      endSec: 12, // 8 + 4
      text: "Check out features",
    });
  });

  it("returns empty array when no segments have scripts", () => {
    const segments = [
      { name: "Home", videoPath: "/tmp/v.webm", trimSec: 1 },
    ];
    const durations = [5];

    const entries = buildSubtitleEntries(segments, durations);
    expect(entries).toEqual([]);
  });

  it("splits long narration into multiple subtitle chunks", () => {
    const segments = [
      {
        name: "Home",
        videoPath: "/tmp/v.webm",
        trimSec: 0,
        narrationScript:
          "Welcome to the app where you can manage all your projects. Here you can see the dashboard with all your data.",
      },
    ];
    const durations = [10];

    const entries = buildSubtitleEntries(segments, durations);
    expect(entries.length).toBeGreaterThan(1);
    // Each chunk should be timed within the segment
    expect(entries[0].startSec).toBe(0);
    expect(entries[entries.length - 1].endSec).toBe(10);
    // Chunks should be sequential
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].startSec).toBeCloseTo(entries[i - 1].endSec, 5);
    }
  });

  it("handles single segment with script", () => {
    const segments = [
      { name: "Home", videoPath: "/tmp/v.webm", trimSec: 0, narrationScript: "Hello" },
    ];
    const durations = [3];

    const entries = buildSubtitleEntries(segments, durations);
    expect(entries).toHaveLength(1);
    expect(entries[0].startSec).toBe(0);
    expect(entries[0].endSec).toBe(3);
  });
});

describe("buildSubtitleFilter", () => {
  it("builds a subtitles filter with default style", () => {
    const result = buildSubtitleFilter("/tmp/subs.srt", "scaled");
    expect(result.outputLabel).toBe("subtitled");
    expect(result.filters).toContain("[scaled]subtitles=");
    expect(result.filters).toContain("[subtitled]");
    expect(result.filters).toContain("FontSize=18");
    expect(result.filters).toContain("Alignment=2"); // bottom
  });

  it("applies custom style options", () => {
    const result = buildSubtitleFilter("/tmp/subs.srt", "scaled", {
      fontSize: 36,
      fontColor: "&Hffff00",
      bgColor: "&H40000000",
      position: "top",
    });
    expect(result.filters).toContain("FontSize=36");
    expect(result.filters).toContain("PrimaryColour=&Hffff00");
    expect(result.filters).toContain("BackColour=&H40000000");
    expect(result.filters).toContain("Alignment=6"); // top
  });

  it("escapes colons in file path", () => {
    const result = buildSubtitleFilter("/tmp/C:/videos/subs.srt", "scaled");
    expect(result.filters).toContain("\\:");
  });

  it("uses provided input label", () => {
    const result = buildSubtitleFilter("/tmp/subs.srt", "customlabel");
    expect(result.filters).toContain("[customlabel]subtitles=");
  });
});
