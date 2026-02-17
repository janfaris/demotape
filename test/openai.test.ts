import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getApiKey, TTS_VOICES } from "../src/ai/openai.js";

describe("getApiKey", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("throws when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getApiKey()).toThrow("OPENAI_API_KEY");
  });

  it("returns the key when set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key-123";
    expect(getApiKey()).toBe("sk-test-key-123");
  });
});

describe("TTS_VOICES", () => {
  it("includes all 13 voices from gpt-4o-mini-tts", () => {
    expect(TTS_VOICES).toHaveLength(13);
    expect(TTS_VOICES).toContain("alloy");
    expect(TTS_VOICES).toContain("coral");
    expect(TTS_VOICES).toContain("marin");
    expect(TTS_VOICES).toContain("cedar");
    expect(TTS_VOICES).toContain("verse");
  });
});
