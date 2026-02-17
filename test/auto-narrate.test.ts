import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process and fs before importing the module
vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn(() => Buffer.from("fake-jpeg-data")),
  unlinkSync: vi.fn(),
}));

// Mock the openai module
vi.mock("../src/ai/openai.js", () => ({
  chatCompletion: vi.fn(async () => ({
    script: "Welcome to the dashboard where you can manage your projects.",
  })),
  getApiKey: vi.fn(() => "sk-test"),
}));

import {
  extractFrameAsBase64,
  generateNarrationScript,
  autoNarrateSegments,
} from "../src/ai/auto-narrate.js";
import { execSync } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { chatCompletion } from "../src/ai/openai.js";

describe("extractFrameAsBase64", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls ffmpeg to extract a frame at the given timestamp", () => {
    const result = extractFrameAsBase64("/tmp/video.webm", 3.5);

    expect(execSync).toHaveBeenCalledOnce();
    const cmd = (execSync as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(cmd).toContain("-ss 3.5");
    expect(cmd).toContain('-i "/tmp/video.webm"');
    expect(cmd).toContain("-frames:v 1");
    expect(cmd).toContain("-q:v 4");
  });

  it("returns base64-encoded frame data", () => {
    const result = extractFrameAsBase64("/tmp/video.webm", 2.0);
    expect(result).toBe(Buffer.from("fake-jpeg-data").toString("base64"));
  });

  it("cleans up the temporary file", () => {
    extractFrameAsBase64("/tmp/video.webm", 1.0);
    expect(unlinkSync).toHaveBeenCalledOnce();
  });
});

describe("generateNarrationScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends screenshot to AI and returns script", async () => {
    const script = await generateNarrationScript({
      screenshot: "base64data",
      segmentName: "Dashboard",
    });
    expect(script).toBe(
      "Welcome to the dashboard where you can manage your projects."
    );
    expect(chatCompletion).toHaveBeenCalledOnce();
  });

  it("includes segment name in the prompt", async () => {
    await generateNarrationScript({
      screenshot: "base64data",
      segmentName: "Settings",
    });

    const call = (chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userContent = call.messages[1].content;
    expect(userContent[0].text).toContain("Settings");
  });

  it("sends image as base64 data URL", async () => {
    await generateNarrationScript({
      screenshot: "abc123",
      segmentName: "Home",
    });

    const call = (chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userContent = call.messages[1].content;
    expect(userContent[1].image_url.url).toBe(
      "data:image/jpeg;base64,abc123"
    );
  });
});

describe("autoNarrateSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips segments that already have a manual script", async () => {
    const segments = [
      {
        name: "Home",
        videoPath: "/tmp/v.webm",
        trimSec: 1.0,
        narrationScript: "Existing script",
      },
    ];

    await autoNarrateSegments(
      { segments, autoAll: true },
      [{ narration: { auto: true } }]
    );

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(segments[0].narrationScript).toBe("Existing script");
  });

  it("generates script for segments with auto: true", async () => {
    const segments = [
      {
        name: "Dashboard",
        videoPath: "/tmp/v.webm",
        trimSec: 1.0,
      },
    ];

    await autoNarrateSegments(
      { segments, autoAll: false },
      [{ narration: { auto: true } }]
    );

    expect(chatCompletion).toHaveBeenCalledOnce();
    expect(segments[0].narrationScript).toBe(
      "Welcome to the dashboard where you can manage your projects."
    );
  });

  it("generates scripts for all segments when autoAll is true", async () => {
    const segments = [
      { name: "Home", videoPath: "/tmp/v1.webm", trimSec: 1.0 },
      { name: "About", videoPath: "/tmp/v2.webm", trimSec: 0.5 },
    ];

    await autoNarrateSegments(
      { segments, autoAll: true },
      [{}, {}]
    );

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(segments[0].narrationScript).toBeDefined();
    expect(segments[1].narrationScript).toBeDefined();
  });

  it("does not auto-narrate when autoAll is false and segment has no auto flag", async () => {
    const segments = [
      { name: "Home", videoPath: "/tmp/v.webm", trimSec: 1.0 },
    ];

    await autoNarrateSegments(
      { segments, autoAll: false },
      [{}]
    );

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(segments[0].narrationScript).toBeUndefined();
  });
});
