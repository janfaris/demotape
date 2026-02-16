import type { BrowserContext } from "playwright";
import type { Segment } from "./config.js";
import { smoothScroll } from "./scroll.js";
import { waitForIdle, removeDevOverlays, safeGoto } from "./utils.js";

export interface SegmentResult {
  name: string;
  videoPath: string;
  trimSec: number;
}

/**
 * Record a single page segment.
 *
 * Opens a new page in the recording context, navigates to the URL, waits for
 * content to fully render, removes dev overlays, then performs scroll/dwell
 * actions. The loading period is measured so FFmpeg can trim it later.
 *
 * Returns the video path and how many seconds to trim from the start.
 */
export async function recordSegment(
  context: BrowserContext,
  segment: Segment,
  baseUrl: string,
  options: { removeOverlays: boolean; fps: number }
): Promise<SegmentResult> {
  const { name, path, waitFor, settleMs, scroll, dwellMs, actions } = segment;
  const url = `${baseUrl}${path}`;

  console.log(`  [${name}]`);

  const t0 = Date.now();
  const page = await context.newPage();

  // Navigate with fallback
  await safeGoto(page, url);

  // Wait for specific content if specified
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
  }
  await waitForIdle(page, 3000);
  await page.waitForTimeout(settleMs);

  // Remove dev overlays before recording clean content
  if (options.removeOverlays) {
    await removeDevOverlays(page);
  }

  // Everything up to now was loading — trim it
  const trimSec = (Date.now() - t0) / 1000;

  // ─── Content is now fully rendered ───

  // Execute actions (click, hover)
  if (actions) {
    for (const action of actions) {
      if (action.delay) {
        await page.waitForTimeout(action.delay);
      }
      if (action.type === "click") {
        await page.click(action.selector);
      } else if (action.type === "hover") {
        await page.hover(action.selector);
      }
    }
  }

  // Scroll if configured
  if (scroll) {
    await smoothScroll(page, scroll.distance, scroll.duration, options.fps);
    await page.waitForTimeout(500);
  }

  // Dwell
  await page.waitForTimeout(dwellMs);

  // Close page to finalize video
  await page.close();
  const videoPath = await page.video()!.path();

  const totalSec = (Date.now() - t0) / 1000;
  const goodSec = (totalSec - trimSec).toFixed(1);
  console.log(
    `    ${totalSec.toFixed(1)}s total -> trimming ${trimSec.toFixed(1)}s -> ${goodSec}s of clean content`
  );

  return { name, videoPath, trimSec };
}
