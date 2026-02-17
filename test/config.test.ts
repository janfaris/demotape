import { describe, it, expect } from "vitest";
import { DemotapeConfigSchema } from "../src/config.js";

describe("DemotapeConfigSchema", () => {
  it("validates a minimal config", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.viewport.width).toBe(1280);
      expect(result.data.viewport.height).toBe(800);
      expect(result.data.output.format).toBe("mp4");
      expect(result.data.output.fps).toBe(30);
      expect(result.data.colorScheme).toBe("dark");
      expect(result.data.removeDevOverlays).toBe(true);
      expect(result.data.suppressAnimations).toBe(true);
    }
  });

  it("validates a full config with all options", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      auth: {
        provider: "supabase",
        supabaseUrl: "https://abc.supabase.co",
        supabaseServiceRoleKey: "key",
        supabaseAnonKey: "anon",
        email: "test@example.com",
      },
      viewport: { width: 540, height: 960 },
      output: {
        size: { width: 1080, height: 1920 },
        format: "both",
        fps: 60,
        crf: 23,
        name: "story",
        dir: "./output",
      },
      colorScheme: "light",
      removeDevOverlays: false,
      suppressAnimations: false,
      setup: {
        localStorage: { theme: "dark", "onboarding-done": "1" },
        waitAfterSetup: 2000,
      },
      overlays: {
        top: { text: "My App", height: 120, fontSize: 48 },
        bottom: { text: "Try it free", height: 100, fontSize: 32 },
      },
      segments: [
        {
          name: "Home",
          path: "/",
          waitFor: "h1",
          settleMs: 2000,
          scroll: { distance: 500, duration: 3000 },
          dwellMs: 1500,
          actions: [
            { type: "click", selector: "button.cta", delay: 500 },
            { type: "hover", selector: ".card" },
          ],
        },
        {
          name: "Features",
          path: "/features",
          waitFor: "main",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects config without baseUrl", () => {
    const result = DemotapeConfigSchema.safeParse({
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects config with invalid baseUrl", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "not-a-url",
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects config with empty segments", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects config with no segments", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults to segments", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Page", path: "/page" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].settleMs).toBe(1000);
      expect(result.data.segments[0].dwellMs).toBe(2000);
    }
  });

  it("validates cookie auth provider", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      auth: {
        provider: "cookies",
        cookies: [
          { name: "session", value: "abc123", domain: "localhost" },
        ],
      },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
  });

  it("validates localStorage auth provider", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      auth: {
        provider: "localStorage",
        localStorage: { token: "abc123" },
      },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid auth provider", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      auth: { provider: "oauth" },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid output format", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      output: { format: "avi" },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects CRF out of range", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      output: { crf: 100 },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  // ─── Subtitles ───

  it("accepts subtitles config with defaults", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      subtitles: {},
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subtitles?.enabled).toBe(true);
      expect(result.data.subtitles?.burn).toBe(false);
    }
  });

  it("accepts subtitles with burn-in and style", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      subtitles: {
        enabled: true,
        burn: true,
        style: { fontSize: 36, position: "top" },
      },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subtitles?.burn).toBe(true);
      expect(result.data.subtitles?.style?.fontSize).toBe(36);
      expect(result.data.subtitles?.style?.position).toBe("top");
    }
  });

  // ─── Transitions ───

  it("accepts global transitions config", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      transitions: { type: "fade", duration: 0.5 },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transitions?.type).toBe("fade");
      expect(result.data.transitions?.duration).toBe(0.5);
    }
  });

  it("accepts per-segment transitions", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [
        {
          name: "Home",
          path: "/",
          transition: { type: "wipeleft", duration: 1.0 },
        },
        { name: "About", path: "/about" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].transition?.type).toBe("wipeleft");
      expect(result.data.segments[1].transition).toBeUndefined();
    }
  });

  it("applies transition defaults", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      transitions: {},
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transitions?.type).toBe("fade");
      expect(result.data.transitions?.duration).toBe(0.5);
    }
  });

  it("rejects invalid transition type", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      transitions: { type: "dissolve" },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects transition duration out of range", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      transitions: { type: "fade", duration: 10 },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(false);
  });

  // ─── Cursor ───

  it("accepts cursor as boolean true", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      cursor: true,
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe(true);
    }
  });

  it("accepts cursor as boolean false", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      cursor: false,
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts cursor as object with options", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      cursor: { size: 30, color: "red", clickEffect: false },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success && typeof result.data.cursor === "object") {
      expect(result.data.cursor.size).toBe(30);
      expect(result.data.cursor.color).toBe("red");
      expect(result.data.cursor.clickEffect).toBe(false);
    }
  });

  // ─── Auto-narration ───

  it("accepts segment narration with auto flag", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [
        { name: "Home", path: "/", narration: { auto: true } },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.auto).toBe(true);
    }
  });

  it("accepts segment narration with script only (no auto)", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      segments: [
        { name: "Home", path: "/", narration: { script: "Hello" } },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.segments[0].narration?.script).toBe("Hello");
      expect(result.data.segments[0].narration?.auto).toBeUndefined();
    }
  });

  it("accepts top-level narration with auto flag", () => {
    const result = DemotapeConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      narration: { auto: true },
      segments: [{ name: "Home", path: "/" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.narration?.auto).toBe(true);
    }
  });
});
