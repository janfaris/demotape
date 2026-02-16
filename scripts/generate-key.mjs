#!/usr/bin/env node

/**
 * Generate Pro license keys for Gumroad/LemonSqueezy upload.
 *
 * Reads the Ed25519 private key from .license-private-key (gitignored).
 * Only you can generate keys — the public repo only has the public key.
 *
 * Usage:
 *   node scripts/generate-key.mjs          # generate 1 key
 *   node scripts/generate-key.mjs 100      # generate 100 keys
 */

import { createPrivateKey, sign, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(__dirname, "..", ".license-private-key");

let privPem;
try {
  privPem = readFileSync(keyPath, "utf8");
} catch {
  console.error(
    `Private key not found: ${keyPath}\n\n` +
      `This file is gitignored and must exist locally to generate keys.\n` +
      `If you've lost it, you need to generate a new Ed25519 keypair\n` +
      `and update the public key in src/license.ts.`
  );
  process.exit(1);
}

const privateKey = createPrivateKey(privPem);

function generateKey() {
  const payload = randomBytes(8).toString("hex");
  const message = `DMTP-PRO-${payload}`;
  const signature = sign(null, Buffer.from(message), privateKey).toString(
    "base64url"
  );
  return `${message}-${signature}`;
}

const count = parseInt(process.argv[2] || "1", 10);

if (isNaN(count) || count < 1) {
  console.error("Usage: node scripts/generate-key.mjs [count]");
  process.exit(1);
}

for (let i = 0; i < count; i++) {
  console.log(generateKey());
}
