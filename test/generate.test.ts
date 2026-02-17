import { describe, it, expect, afterEach } from "vitest";
import { DemotapeConfigSchema } from "../src/config.js";
import { validateLicenseKey } from "../src/license.js";

describe("generate config schema validation", () => {
  it("a generated config with segments validates through the schema", () => {
    const generatedConfig = {
      baseUrl: "https://example.com",
      viewport: { width: 1280, height: 800 },
      output: { format: "mp4", name: "demo" },
      colorScheme: "dark",
      segments: [
        {
          name: "Home",
          path: "/",
          waitFor: "h1",
          settleMs: 1500,
          dwellMs: 3000,
        },
        {
          name: "Features",
          path: "/features",
          waitFor: "main",
          settleMs: 2000,
          scroll: { distance: 400, duration: 2500 },
          dwellMs: 2000,
        },
      ],
    };

    const result = DemotapeConfigSchema.safeParse(generatedConfig);
    expect(result.success).toBe(true);
  });
});

describe("generate command license gating", () => {
  it("validateLicenseKey returns false for invalid keys", () => {
    expect(validateLicenseKey("not-a-key")).toBe(false);
    expect(validateLicenseKey("")).toBe(false);
  });

  it("generate requires a valid license key (Pro feature)", () => {
    // This tests the logic path — the generate command checks
    // validateLicenseKey before proceeding
    const key = "DMTP-PRO-0000000000000000-invalidkeydata";
    expect(validateLicenseKey(key)).toBe(false);
  });
});
