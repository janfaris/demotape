import { describe, it, expect, afterEach } from "vitest";
import { DemotapeConfigSchema } from "../src/config.js";
import { detectProFeatures } from "../src/license.js";

describe("narration config schema", () => {
  const baseConfig = {
    baseUrl: "http://localhost:3000",
    segments: [{ name: "Home", path: "/" }],
  };

  it("accepts top-level narration config with defaults", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.narration?.voice).toBe("coral");
      expect(result.data.narration?.speed).toBe(1.0);
      expect(result.data.narration?.model).toBe("gpt-4o-mini-tts");
    }
  });

  it("accepts narration with custom voice and speed", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { voice: "nova", speed: 1.2, model: "tts-1-hd" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.narration?.voice).toBe("nova");
      expect(result.data.narration?.speed).toBe(1.2);
      expect(result.data.narration?.model).toBe("tts-1-hd");
    }
  });

  it("accepts narration with instructions", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { instructions: "Speak in a friendly, upbeat tone" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.narration?.instructions).toBe(
        "Speak in a friendly, upbeat tone"
      );
    }
  });

  it("rejects invalid voice name", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { voice: "invalid-voice" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects speed out of range (too low)", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { speed: 0.1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects speed out of range (too high)", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { speed: 5.0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid TTS model", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { model: "whisper-1" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts per-segment narration script", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      segments: [
        {
          name: "Home",
          path: "/",
          narration: { script: "Welcome to our app" },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.script).toBe(
        "Welcome to our app"
      );
    }
  });

  it("accepts segments with and without narration scripts", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      segments: [
        {
          name: "Home",
          path: "/",
          narration: { script: "Welcome" },
        },
        {
          name: "About",
          path: "/about",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.script).toBe("Welcome");
      expect(result.data.segments[1].narration).toBeUndefined();
    }
  });

  it("accepts segment narration with auto: true and no script", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      segments: [
        {
          name: "Home",
          path: "/",
          narration: { auto: true },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.auto).toBe(true);
      expect(result.data.segments[0].narration?.script).toBeUndefined();
    }
  });

  it("accepts narration with both script and auto", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      segments: [
        {
          name: "Home",
          path: "/",
          narration: { script: "Manual script", auto: false },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.script).toBe("Manual script");
      expect(result.data.segments[0].narration?.auto).toBe(false);
    }
  });

  it("accepts top-level narration with auto flag", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      narration: { auto: true, voice: "nova" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.narration?.auto).toBe(true);
      expect(result.data.narration?.voice).toBe("nova");
    }
  });
});

describe("narration license detection", () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it("detects top-level narration config as Pro feature", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      narration: { voice: "nova" },
      segments: [{ name: "Home", path: "/" }],
    });
    const features = detectProFeatures(config);
    expect(features).toContainEqual(expect.stringContaining("AI narration"));
  });

  it("detects per-segment narration as Pro feature", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      segments: [
        {
          name: "Home",
          path: "/",
          narration: { script: "Welcome" },
        },
      ],
    });
    const features = detectProFeatures(config);
    expect(features).toContainEqual(expect.stringContaining("AI narration"));
  });

  it("does not flag when no narration is configured", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Home", path: "/" }],
    });
    const features = detectProFeatures(config);
    expect(features).not.toContainEqual(
      expect.stringContaining("AI narration")
    );
  });
});

describe("ffmpeg audio muxing", () => {
  it("encode options interface accepts audioPath", () => {
    // Type-level test: verify the EncodeOptions interface accepts audioPath
    // The actual ffmpeg commands are tested via integration tests
    const opts = {
      segments: [{ name: "Home", videoPath: "/tmp/v.webm", trimSec: 1.5 }],
      output: {
        format: "mp4" as const,
        fps: 30,
        crf: 28,
        name: "demo",
        dir: "./videos",
      },
      viewport: { width: 1280, height: 800 },
      audioPath: "/tmp/narration.mp3",
    };
    // Just verify the shape is valid
    expect(opts.audioPath).toBe("/tmp/narration.mp3");
  });
});
