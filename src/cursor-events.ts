/**
 * Cursor event metadata — records cursor positions and interactions as a
 * timeline that Remotion can composite over clean video.
 *
 * Instead of baking cursor effects into the DOM during Playwright recording,
 * we log events as JSON metadata and render them as SVG overlays in post.
 */

export type CursorEventType = "move" | "click" | "scroll" | "idle";

export interface CursorEvent {
  type: CursorEventType;
  /** Seconds since clean content start (after trim) */
  time: number;
  /** Viewport x coordinate */
  x: number;
  /** Viewport y coordinate */
  y: number;
  /** Bounding box of the action target (for zoom sizing) */
  targetBox?: { width: number; height: number };
}

export interface SegmentCursorData {
  segmentIndex: number;
  viewport: { width: number; height: number };
  events: CursorEvent[];
}

/**
 * Build cursor events for a segment based on the action timeline.
 *
 * Called during metadata-capture recording: the caller tracks wall-clock
 * timestamps as actions execute and passes them here with the content start
 * time so we can convert to relative seconds.
 */
export function buildCursorEventsForSegment(opts: {
  segmentIndex: number;
  viewport: { width: number; height: number };
  contentStartMs: number;
  events: Array<{
    type: CursorEventType;
    timeMs: number;
    x: number;
    y: number;
    targetBox?: { width: number; height: number };
  }>;
}): SegmentCursorData {
  const { segmentIndex, viewport, contentStartMs, events } = opts;

  const cursorEvents: CursorEvent[] = events.map((e) => ({
    type: e.type,
    time: Math.max(0, (e.timeMs - contentStartMs) / 1000),
    x: e.x,
    y: e.y,
    targetBox: e.targetBox,
  }));

  return { segmentIndex, viewport, events: cursorEvents };
}
