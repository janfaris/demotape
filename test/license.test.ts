import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateLicenseKey,
  detectProFeatures,
  enforceLicense,
  LicenseError,
} from "../src/license.js";
import type { DemotapeConfig } from "../src/config.js";
import { DemotapeConfigSchema } from "../src/config.js";

// Generated with the Ed25519 private key (gitignored)
const VALID_KEY =
  "DMTP-PRO-7706a03ca582eeb5-AVYy-W8eLTbosZIVS7hr_s7wT6Iqes8qLvMZX0OxtpWnXhv9crcTQrHNCJEg0tVnK3LW4enPPwv896hmMUC9Aw";

function makeConfig(overrides: Record<string, unknown> = {}): DemotapeConfig {
  return DemotapeConfigSchema.parse({
    baseUrl: "http://localhost:3000",
    segments: [{ name: "Home", path: "/" }],
    ...overrides,
  });
}

/* ─── validateLicenseKey ─── */

describe("validateLicenseKey", () => {
  it("accepts a valid key", () => {
    expect(validateLicenseKey(VALID_KEY)).toBe(true);
  });

  it("rejects a key with wrong signature", () => {
    expect(
      validateLicenseKey(
        "DMTP-PRO-7706a03ca582eeb5-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      )
    ).toBe(false);
  });

  it("rejects a key with wrong prefix", () => {
    // Replace DMTP with XMTP but keep the rest
    const broken = VALID_KEY.replace("DMTP-PRO-", "XMTP-PRO-");
    expect(validateLicenseKey(broken)).toBe(false);
  });

  it("rejects a key with tampered payload", () => {
    // Flip first hex char of payload
    const broken = VALID_KEY.replace(
      "DMTP-PRO-7706a03ca582eeb5",
      "DMTP-PRO-0706a03ca582eeb5"
    );
    expect(validateLicenseKey(broken)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validateLicenseKey("")).toBe(false);
  });

  it("rejects a random string", () => {
    expect(validateLicenseKey("not-a-license-key")).toBe(false);
  });

  it("rejects a key with missing signature", () => {
    expect(validateLicenseKey("DMTP-PRO-7706a03ca582eeb5")).toBe(false);
  });

  it("rejects a key with non-hex payload", () => {
    expect(
      validateLicenseKey(
        "DMTP-PRO-zzzzzzzzzzzzzzzz-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      )
    ).toBe(false);
  });

  it("rejects a key with short signature (not 64 bytes)", () => {
    expect(validateLicenseKey("DMTP-PRO-7706a03ca582eeb5-dG9vc2hvcnQ")).toBe(
      false
    );
  });
});

/* ─── detectProFeatures ─── */

describe("detectProFeatures", () => {
  it("returns empty for a free config (mp4, no overlays, no supabase)", () => {
    const config = makeConfig();
    expect(detectProFeatures(config)).toEqual([]);
  });

  it("detects multi-format output (both)", () => {
    const config = makeConfig({ output: { format: "both" } });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("Multi-format");
  });

  it("detects multi-format output (webm)", () => {
    const config = makeConfig({ output: { format: "webm" } });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("Multi-format");
  });

  it("detects text overlays (top only)", () => {
    const config = makeConfig({ overlays: { top: { text: "Hi" } } });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("Text overlays");
    expect(features[0]).toContain("overlays.top");
  });

  it("detects text overlays (bottom only)", () => {
    const config = makeConfig({ overlays: { bottom: { text: "CTA" } } });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("overlays.bottom");
  });

  it("detects text overlays (both top and bottom)", () => {
    const config = makeConfig({
      overlays: { top: { text: "Hi" }, bottom: { text: "CTA" } },
    });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("overlays.top");
    expect(features[0]).toContain("overlays.bottom");
  });

  it("detects Supabase auth", () => {
    const config = makeConfig({
      auth: { provider: "supabase", email: "test@example.com" },
    });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(1);
    expect(features[0]).toContain("Supabase auth");
  });

  it("does not flag cookie auth", () => {
    const config = makeConfig({
      auth: { provider: "cookies", cookies: [{ name: "s", value: "v" }] },
    });
    expect(detectProFeatures(config)).toEqual([]);
  });

  it("does not flag localStorage auth", () => {
    const config = makeConfig({
      auth: { provider: "localStorage", localStorage: { t: "v" } },
    });
    expect(detectProFeatures(config)).toEqual([]);
  });

  it("detects multiple Pro features at once", () => {
    const config = makeConfig({
      output: { format: "both" },
      overlays: { top: { text: "Hi" } },
      auth: { provider: "supabase", email: "test@example.com" },
    });
    const features = detectProFeatures(config);
    expect(features).toHaveLength(3);
  });
});

/* ─── enforceLicense ─── */

describe("enforceLicense", () => {
  const originalEnv = process.env.DEMOTAPE_LICENSE_KEY;

  beforeEach(() => {
    delete process.env.DEMOTAPE_LICENSE_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEMOTAPE_LICENSE_KEY = originalEnv;
    } else {
      delete process.env.DEMOTAPE_LICENSE_KEY;
    }
  });

  it("passes for a free config without a key", () => {
    const config = makeConfig();
    expect(() => enforceLicense(config)).not.toThrow();
  });

  it("passes for a Pro config with a valid key argument", () => {
    const config = makeConfig({ output: { format: "both" } });
    expect(() => enforceLicense(config, VALID_KEY)).not.toThrow();
  });

  it("passes for a Pro config with a valid env key", () => {
    process.env.DEMOTAPE_LICENSE_KEY = VALID_KEY;
    const config = makeConfig({ output: { format: "both" } });
    expect(() => enforceLicense(config)).not.toThrow();
  });

  it("throws LicenseError for Pro config without a key", () => {
    const config = makeConfig({ output: { format: "both" } });
    expect(() => enforceLicense(config)).toThrow(LicenseError);
  });

  it("throws LicenseError for Pro config with an invalid key", () => {
    const config = makeConfig({ output: { format: "both" } });
    expect(() =>
      enforceLicense(config, "DMTP-PRO-0000000000000000-invalidkeydata")
    ).toThrow(LicenseError);
  });

  it("error message lists the detected Pro features", () => {
    const config = makeConfig({
      output: { format: "both" },
      overlays: { top: { text: "Hi" } },
    });
    try {
      enforceLicense(config);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LicenseError);
      const licErr = err as LicenseError;
      expect(licErr.features).toHaveLength(2);
      expect(licErr.message).toContain("Multi-format");
      expect(licErr.message).toContain("Text overlays");
      expect(licErr.message).toContain("https://demotape.dev/pro");
    }
  });

  it("key argument takes precedence over env var", () => {
    process.env.DEMOTAPE_LICENSE_KEY =
      "DMTP-PRO-0000000000000000-invalidkeydata";
    const config = makeConfig({ output: { format: "both" } });
    // Valid key as argument should pass even though env has invalid key
    expect(() => enforceLicense(config, VALID_KEY)).not.toThrow();
  });
});
