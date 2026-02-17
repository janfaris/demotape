import { createPublicKey, verify } from "crypto";
import type { DemotapeConfig } from "./config.js";

/* ─── Constants ─── */

const PAYLOAD_HEX_LEN = 16; // 8 random bytes

// Ed25519 public key — can verify signatures but CANNOT generate them.
// The private key is kept offline and never committed.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA88D37wAapj+79bWddXTROVAlIs0k7I/ZprUIrGqZqd8=
-----END PUBLIC KEY-----`;

const publicKey = createPublicKey(PUBLIC_KEY_PEM);

/* ─── License Error ─── */

export class LicenseError extends Error {
  public readonly features: string[];

  constructor(features: string[]) {
    const featureList = features.map((f) => `  - ${f}`).join("\n");
    const lines = [
      "This config uses Pro features that require a license key:",
      "",
      featureList,
      "",
      "Get a key at https://demotape.dev/pro",
      "",
      "  export DEMOTAPE_LICENSE_KEY=DMTP-PRO-xxxx-xxxx",
      "",
      "Or: demotape record --config demo.json --license DMTP-PRO-xxxx-xxxx",
    ];

    if (process.env.CI) {
      lines.push(
        "",
        "In CI/CD, set DEMOTAPE_LICENSE_KEY as a repository secret."
      );
    }

    const message = lines.join("\n");

    super(message);
    this.name = "LicenseError";
    this.features = features;
  }
}

/* ─── Key Validation ─── */

/**
 * Validate a license key offline using Ed25519 signature verification.
 *
 * Key format: DMTP-PRO-<16 hex payload>-<base64url Ed25519 signature>
 *
 * Only the public key is embedded — the private key never leaves the developer's
 * machine, so reading this source code does NOT allow generating valid keys.
 */
export function validateLicenseKey(key: string): boolean {
  // Split into exactly 3 parts on the first two dashes after prefix
  // Format: DMTP-PRO-<payload>-<signature>
  const match = key.match(/^(DMTP-PRO-[0-9a-f]{16})-(.+)$/);
  if (!match) return false;

  const message = match[1];
  const signatureB64 = match[2];

  // Validate payload hex
  const payload = message.slice("DMTP-PRO-".length);
  if (payload.length !== PAYLOAD_HEX_LEN) return false;

  // Decode base64url signature
  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signatureB64, "base64url");
  } catch {
    return false;
  }

  // Ed25519 signatures are always 64 bytes
  if (signatureBuf.length !== 64) return false;

  // Verify signature against the embedded public key
  try {
    return verify(null, Buffer.from(message), publicKey, signatureBuf);
  } catch {
    return false;
  }
}

/* ─── Pro Feature Detection ─── */

export function detectProFeatures(config: DemotapeConfig): string[] {
  const features: string[] = [];

  if (config.output.format === "webm" || config.output.format === "both") {
    features.push(
      `Multi-format output (output.format = "${config.output.format}")`
    );
  }

  if (config.overlays?.top || config.overlays?.bottom) {
    const parts: string[] = [];
    if (config.overlays.top) parts.push("overlays.top");
    if (config.overlays.bottom) parts.push("overlays.bottom");
    features.push(`Text overlays (${parts.join(", ")})`);
  }

  if (config.auth?.provider === "supabase") {
    features.push('Supabase auth (auth.provider = "supabase")');
  }

  if (config.visualReadiness) {
    features.push("Visual readiness detection (visualReadiness)");
  }

  if (
    config.narration ||
    config.segments.some((s) => s.narration)
  ) {
    features.push("AI narration (narration)");
  }

  if (config.subtitles) {
    features.push("Subtitles/captions (subtitles)");
  }

  if (config.transitions || config.segments.some((s) => s.transition)) {
    features.push("Segment transitions (transitions)");
  }

  if (config.cursor) {
    features.push("Cursor animation (cursor)");
  }

  if (process.env.CI) {
    features.push("CI/CD environment (CI env var detected)");
  }

  return features;
}

/* ─── Enforcement ─── */

export function enforceLicense(
  config: DemotapeConfig,
  licenseKey?: string
): void {
  const proFeatures = detectProFeatures(config);
  if (proFeatures.length === 0) return;

  const key = licenseKey || process.env.DEMOTAPE_LICENSE_KEY;

  if (!key) {
    throw new LicenseError(proFeatures);
  }

  if (!validateLicenseKey(key)) {
    throw new LicenseError(proFeatures);
  }
}
