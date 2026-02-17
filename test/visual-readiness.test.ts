import { describe, it, expect, afterEach } from "vitest";
import { compareScreenshots } from "../src/ai/visual-readiness.js";
import { DemotapeConfigSchema } from "../src/config.js";
import { detectProFeatures } from "../src/license.js";

describe("compareScreenshots", () => {
  it("returns 0 for identical buffers", () => {
    const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(compareScreenshots(buf, buf)).toBe(0);
  });

  it("returns 0 for two identical copies", () => {
    const a = Buffer.from([10, 20, 30, 40]);
    const b = Buffer.from([10, 20, 30, 40]);
    expect(compareScreenshots(a, b)).toBe(0);
  });

  it("returns 1.0 for completely different buffers of same length", () => {
    const a = Buffer.from([0, 0, 0, 0]);
    const b = Buffer.from([255, 255, 255, 255]);
    expect(compareScreenshots(a, b)).toBe(1.0);
  });

  it("returns a small fraction for slightly different buffers", () => {
    const a = Buffer.alloc(1000, 0);
    const b = Buffer.alloc(1000, 0);
    b[500] = 1; // One byte different
    const diff = compareScreenshots(a, b);
    expect(diff).toBeCloseTo(0.001, 3);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThan(0.01);
  });

  it("handles different length buffers", () => {
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([1, 2, 3, 4, 5]);
    const diff = compareScreenshots(a, b);
    // 2 extra bytes out of max(3, 5) = 5
    expect(diff).toBeCloseTo(0.4, 1);
  });

  it("returns 0 for two empty buffers", () => {
    expect(compareScreenshots(Buffer.alloc(0), Buffer.alloc(0))).toBe(0);
  });
});

describe("visualReadiness config schema", () => {
  const baseConfig = {
    baseUrl: "http://localhost:3000",
    segments: [{ name: "Home", path: "/" }],
  };

  it("accepts visualReadiness: true", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      visualReadiness: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visualReadiness).toBe(true);
    }
  });

  it("accepts visualReadiness: false", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      visualReadiness: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visualReadiness).toBe(false);
    }
  });

  it("accepts visualReadiness with custom config", () => {
    const result = DemotapeConfigSchema.safeParse({
      ...baseConfig,
      visualReadiness: { threshold: 0.005 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const vr = result.data.visualReadiness as Record<string, unknown>;
      expect(vr.threshold).toBe(0.005);
      // defaults should be applied
      expect(vr.intervalMs).toBe(200);
      expect(vr.maxWaitMs).toBe(10000);
      expect(vr.consecutiveStable).toBe(2);
    }
  });

  it("defaults to undefined when not specified", () => {
    const result = DemotapeConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visualReadiness).toBeUndefined();
    }
  });
});

describe("visualReadiness license detection", () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it("detects visualReadiness: true as Pro feature", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Home", path: "/" }],
      visualReadiness: true,
    });
    const features = detectProFeatures(config);
    expect(features).toContainEqual(
      expect.stringContaining("Visual readiness")
    );
  });

  it("detects visualReadiness config object as Pro feature", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Home", path: "/" }],
      visualReadiness: { threshold: 0.01 },
    });
    const features = detectProFeatures(config);
    expect(features).toContainEqual(
      expect.stringContaining("Visual readiness")
    );
  });

  it("does not flag when visualReadiness is absent", () => {
    delete process.env.CI;
    const config = DemotapeConfigSchema.parse({
      baseUrl: "http://localhost:3000",
      segments: [{ name: "Home", path: "/" }],
    });
    const features = detectProFeatures(config);
    expect(features).not.toContainEqual(
      expect.stringContaining("Visual readiness")
    );
  });
});
