import type { BrowserContext } from "playwright";
import type { Segment } from "./config.js";
import { smoothScroll } from "./scroll.js";
import { waitForIdle, removeDevOverlays, safeGoto } from "./utils.js";
import type { VisualReadinessOptions } from "./ai/visual-readiness.js";
import {
  type CursorOptions,
  getCursorInjectionScript,
  getCursorMoveScript,
  getCursorClickScript,
  getCursorZoomInScript,
  getCursorZoomOutScript,
} from "./cursor.js";

export interface SegmentResult {
  name: string;
  videoPath: string;
  trimSec: number;
  narrationScript?: string;
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
  options: {
    removeOverlays: boolean;
    fps: number;
    visualReadiness?: boolean | VisualReadinessOptions;
    cursor?: CursorOptions;
  }
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

  // Visual readiness: compare screenshots until stable, or fall back to settleMs
  if (options.visualReadiness) {
    const { waitForVisualReadiness } = await import(
      "./ai/visual-readiness.js"
    );
    const vrOpts =
      typeof options.visualReadiness === "object"
        ? options.visualReadiness
        : undefined;
    const waited = await waitForVisualReadiness(page, vrOpts);
    console.log(`    Visual readiness: stable after ${waited}ms`);
  } else {
    await page.waitForTimeout(settleMs);
  }

  // Remove dev overlays before recording clean content
  if (options.removeOverlays) {
    await removeDevOverlays(page);
  }

  // Everything up to now was loading — trim it
  const trimSec = (Date.now() - t0) / 1000;

  // ─── Content is now fully rendered ───

  // Inject fake cursor if configured
  if (options.cursor) {
    await page.evaluate(getCursorInjectionScript(options.cursor));
  }

  // Execute actions (click, hover) with optional cursor animation + zoom
  if (actions) {
    for (const action of actions) {
      if (action.delay) {
        await page.waitForTimeout(action.delay);
      }

      // Animate cursor to target element before action
      let actionCenter: { cx: number; cy: number } | null = null;
      if (options.cursor) {
        const box = await page
          .locator(action.selector)
          .first()
          .boundingBox()
          .catch(() => null);
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          actionCenter = { cx, cy };
          await page.evaluate(getCursorMoveScript(cx, cy));
          await page.waitForTimeout(650); // wait for CSS transition (600ms) + buffer
        }
      }

      // Zoom into the target area (cinematic hover-zoom effect)
      const shouldZoom = options.cursor?.hoverZoom && actionCenter;
      if (shouldZoom) {
        await page.evaluate(
          getCursorZoomInScript(
            actionCenter!.cx,
            actionCenter!.cy,
            options.cursor!.hoverZoom!
          )
        );
        await page.waitForTimeout(900); // wait for zoom transition (800ms) + buffer
      }

      if (action.type === "click") {
        if (options.cursor?.clickEffect) {
          await page.evaluate(getCursorClickScript());
          await page.waitForTimeout(350); // wait for ripple (300ms) + buffer
        }
        await page.click(action.selector);
      } else if (action.type === "hover") {
        await page.hover(action.selector);
      }

      // Hold the zoom briefly, then ease back out
      if (shouldZoom) {
        await page.waitForTimeout(800); // hold the zoomed view
        await page.evaluate(getCursorZoomOutScript());
        await page.waitForTimeout(700); // wait for zoom out (600ms) + buffer
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

  return {
    name,
    videoPath,
    trimSec,
    narrationScript: segment.narration?.script,
  };
}
