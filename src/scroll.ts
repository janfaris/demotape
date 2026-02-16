import type { Page } from "playwright";

/**
 * Smooth scroll by `distance` px over `durationMs`.
 * Uses FPS-matched steps for buttery playback at the target framerate.
 */
export async function smoothScroll(
  page: Page,
  distance: number,
  durationMs: number = 2000,
  fps: number = 30
): Promise<void> {
  const steps = Math.max(60, Math.round((durationMs / 1000) * fps));
  const stepPx = distance / steps;
  const stepMs = durationMs / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((px) => window.scrollBy(0, px), stepPx);
    await page.waitForTimeout(stepMs);
  }
}
