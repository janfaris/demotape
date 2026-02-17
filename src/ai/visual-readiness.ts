/**
 * Visual readiness detection using screenshot comparison.
 *
 * Takes consecutive screenshots and compares them byte-by-byte.
 * When the page stabilizes (consecutive frames are nearly identical),
 * recording can begin — replacing the fragile settleMs timer.
 *
 * No external deps — uses raw Buffer comparison from page.screenshot().
 */

import type { Page } from "playwright";

export interface VisualReadinessOptions {
  /** Ms between screenshots (default: 200) */
  intervalMs?: number;
  /** Max fraction of differing bytes to consider stable (default: 0.001) */
  threshold?: number;
  /** Max ms to wait before falling back (default: 10000) */
  maxWaitMs?: number;
  /** Consecutive stable frames required (default: 2) */
  consecutiveStable?: number;
}

const DEFAULTS: Required<VisualReadinessOptions> = {
  intervalMs: 200,
  threshold: 0.001,
  maxWaitMs: 10000,
  consecutiveStable: 2,
};

/**
 * Compare two screenshot buffers byte-by-byte.
 *
 * Returns the fraction of differing bytes (0.0 = identical, 1.0 = completely different).
 * PNG screenshots of identical DOM produce identical bytes from Playwright.
 */
export function compareScreenshots(a: Buffer, b: Buffer): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 0;

  let diffCount = 0;
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) diffCount++;
  }

  // Bytes present in one buffer but not the other count as differences
  diffCount += len - minLen;

  return diffCount / len;
}

/**
 * Wait until the page is visually stable by comparing consecutive screenshots.
 *
 * Returns the number of milliseconds waited.
 */
export async function waitForVisualReadiness(
  page: Page,
  options?: VisualReadinessOptions
): Promise<number> {
  const opts = { ...DEFAULTS, ...options };
  const startTime = Date.now();
  let stableCount = 0;
  let prevScreenshot = await page.screenshot({ type: "png" });

  while (Date.now() - startTime < opts.maxWaitMs) {
    await page.waitForTimeout(opts.intervalMs);

    const currentScreenshot = await page.screenshot({ type: "png" });
    const diff = compareScreenshots(prevScreenshot, currentScreenshot);

    if (diff <= opts.threshold) {
      stableCount++;
      if (stableCount >= opts.consecutiveStable) {
        const waited = Date.now() - startTime;
        return waited;
      }
    } else {
      stableCount = 0;
    }

    prevScreenshot = currentScreenshot;
  }

  // Fallback — max wait exceeded
  return Date.now() - startTime;
}
