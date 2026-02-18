import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
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
import {
  type CursorEventType,
  type SegmentCursorData,
  buildCursorEventsForSegment,
} from "./cursor-events.js";

export interface SegmentResult {
  name: string;
  videoPath: string;
  trimSec: number;
  narrationScript?: string;
  cursorEventsPath?: string;
}

/**
 * Record a single page segment.
 *
 * Opens a new page in the recording context, navigates to the URL, waits for
 * content to fully render, removes dev overlays, then performs scroll/dwell
 * actions. The loading period is measured so FFmpeg can trim it later.
 *
 * When `captureMetadata` is true (Remotion renderer), cursor effects are NOT
 * injected into the DOM. Instead, cursor positions and interactions are logged
 * as JSON metadata for Remotion to composite in post-processing.
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
    captureMetadata?: boolean;
    segmentIndex?: number;
  }
): Promise<SegmentResult> {
  const { name, path, waitFor, settleMs, scroll, dwellMs, actions } = segment;
  const url = `${baseUrl}${path}`;
  const captureMetadata = options.captureMetadata ?? false;

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
  const contentStartMs = Date.now();

  // ─── Content is now fully rendered ───

  // Cursor event log for metadata capture mode
  const rawEvents: Array<{
    type: CursorEventType;
    timeMs: number;
    x: number;
    y: number;
    targetBox?: { width: number; height: number };
  }> = [];

  // In metadata mode, record idle cursor position at content start
  // In DOM mode, inject the fake cursor element
  if (options.cursor) {
    if (captureMetadata) {
      const vp = page.viewportSize()!;
      rawEvents.push({
        type: "idle",
        timeMs: contentStartMs,
        x: vp.width * 0.6,
        y: vp.height * 0.4,
      });
    } else {
      await page.evaluate(getCursorInjectionScript(options.cursor));
    }
  }

  // Execute actions (click, hover) with optional cursor animation + zoom
  if (actions) {
    for (const action of actions) {
      if (action.delay) {
        await page.waitForTimeout(action.delay);
      }

      // Get target element bounding box
      let actionCenter: { cx: number; cy: number } | null = null;
      let targetBox: { width: number; height: number } | undefined;

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
          targetBox = { width: box.width, height: box.height };

          if (captureMetadata) {
            // Log move event (Remotion will animate with spring physics)
            rawEvents.push({
              type: "move",
              timeMs: Date.now(),
              x: cx,
              y: cy,
              targetBox,
            });
            // Brief pause so subsequent events have distinct timestamps
            await page.waitForTimeout(100);
          } else {
            await page.evaluate(getCursorMoveScript(cx, cy));
            await page.waitForTimeout(650); // wait for CSS transition (600ms) + buffer
          }
        }
      }

      // Zoom into the target area (cinematic hover-zoom effect)
      const shouldZoom = options.cursor?.hoverZoom && actionCenter;
      if (shouldZoom && !captureMetadata) {
        await page.evaluate(
          getCursorZoomInScript(
            actionCenter!.cx,
            actionCenter!.cy,
            options.cursor!.hoverZoom!
          )
        );
        await page.waitForTimeout(900);
      }

      if (action.type === "click") {
        if (captureMetadata && options.cursor) {
          // Log click event for Remotion
          rawEvents.push({
            type: "click",
            timeMs: Date.now(),
            x: actionCenter?.cx ?? 0,
            y: actionCenter?.cy ?? 0,
            targetBox,
          });
        } else if (options.cursor?.clickEffect) {
          await page.evaluate(getCursorClickScript());
          await page.waitForTimeout(350);
        }
        await page.click(action.selector);
      } else if (action.type === "hover") {
        await page.hover(action.selector);
      }

      // In metadata mode, just wait briefly for the action to settle
      // In DOM mode, handle zoom out
      if (shouldZoom) {
        if (captureMetadata) {
          await page.waitForTimeout(400);
        } else {
          await page.waitForTimeout(800);
          await page.evaluate(getCursorZoomOutScript());
          await page.waitForTimeout(700);
        }
      }
    }
  }

  // Scroll if configured
  if (scroll) {
    if (captureMetadata && options.cursor) {
      // Log scroll event at cursor's last known position
      const lastEvent = rawEvents[rawEvents.length - 1];
      rawEvents.push({
        type: "scroll",
        timeMs: Date.now(),
        x: lastEvent?.x ?? page.viewportSize()!.width * 0.6,
        y: lastEvent?.y ?? page.viewportSize()!.height * 0.4,
      });
    }
    await smoothScroll(page, scroll.distance, scroll.duration, options.fps);
    await page.waitForTimeout(500);
  }

  // Dwell
  await page.waitForTimeout(dwellMs);

  // Close page to finalize video
  await page.close();
  const videoPath = await page.video()!.path();

  // Write cursor events JSON if in metadata mode
  let cursorEventsPath: string | undefined;
  if (captureMetadata && options.cursor && rawEvents.length > 0) {
    const segIdx = options.segmentIndex ?? 0;
    const vp = page.viewportSize() ?? { width: 1280, height: 800 };
    const cursorData = buildCursorEventsForSegment({
      segmentIndex: segIdx,
      viewport: vp,
      contentStartMs,
      events: rawEvents,
    });
    cursorEventsPath = resolve(
      dirname(videoPath),
      `segment-${segIdx}.events.json`
    );
    writeFileSync(cursorEventsPath, JSON.stringify(cursorData, null, 2));
    console.log(`    Cursor events: ${cursorData.events.length} events -> ${cursorEventsPath}`);
  }

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
    cursorEventsPath,
  };
}
