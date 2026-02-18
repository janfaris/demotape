/**
 * CameraFollow — continuous cinematic camera that tracks the cursor.
 *
 * This is the Screen Studio signature effect: the viewport is always slightly
 * zoomed in and gently drifting toward wherever the cursor is. On click events
 * the zoom increases dramatically. The camera never stops — it breathes.
 *
 * Architecture:
 * - Base zoom: 1.03x always (never shows raw video edges)
 * - Camera "look at" follows cursor with ~12 frame delay + heavy smoothing
 * - Click events boost zoom to autoZoom level with spring physics
 * - EMA (exponential moving average) simulation per frame for smooth tracking
 *
 * All animation is frame-driven (no CSS transitions — Remotion requirement).
 */
import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import type { CursorEventInput } from "./types.js";

interface CameraFollowProps {
  children: React.ReactNode;
  /** ALL cursor events for this segment (not just clicks) */
  allEvents: CursorEventInput[];
  /** Click events extracted for zoom boost */
  clickEvents: CursorEventInput[];
  autoZoom: number;
  viewport: { width: number; height: number };
  outputSize: { width: number; height: number };
  segmentStartFrame: number;
  segmentDurationFrames: number;
}

const BASE_ZOOM = 1.03;
const CAMERA_SMOOTHING = 0.04; // EMA alpha — lower = more lag
const ZOOM_IN_FRAMES = 18;
const ZOOM_HOLD_FRAMES = 22;
const ZOOM_OUT_FRAMES = 24;
const TOTAL_ZOOM_FRAMES = ZOOM_IN_FRAMES + ZOOM_HOLD_FRAMES + ZOOM_OUT_FRAMES;

/**
 * Get the cursor target position at a given local frame.
 * Linearly interpolates between bracketing events.
 */
function getCursorTargetAt(
  events: CursorEventInput[],
  localFrame: number
): { x: number; y: number } {
  if (events.length === 0) return { x: 0.5, y: 0.5 };
  if (localFrame <= events[0].frame) {
    return { x: events[0].x, y: events[0].y };
  }
  if (localFrame >= events[events.length - 1].frame) {
    const last = events[events.length - 1];
    return { x: last.x, y: last.y };
  }
  for (let i = 0; i < events.length - 1; i++) {
    if (localFrame >= events[i].frame && localFrame < events[i + 1].frame) {
      const span = events[i + 1].frame - events[i].frame;
      const t = span > 0 ? (localFrame - events[i].frame) / span : 0;
      return {
        x: events[i].x + (events[i + 1].x - events[i].x) * t,
        y: events[i].y + (events[i + 1].y - events[i].y) * t,
      };
    }
  }
  const last = events[events.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * Simulate camera EMA tracking from frame 0 to the target frame.
 * Runs the exponential moving average forward from the start to produce
 * a deterministic, smoothly lagging camera position.
 */
function computeCameraPosition(
  events: CursorEventInput[],
  targetFrame: number,
  alpha: number
): { x: number; y: number } {
  const initial = getCursorTargetAt(events, 0);
  let camX = initial.x;
  let camY = initial.y;

  // Step through frames, applying EMA at each step
  // Optimization: skip frames in large gaps (camera barely moves when cursor is still)
  const step = targetFrame > 120 ? 2 : 1;
  const adjustedAlpha = alpha * step;

  for (let f = 1; f <= targetFrame; f += step) {
    const target = getCursorTargetAt(events, f);
    camX += (target.x - camX) * adjustedAlpha;
    camY += (target.y - camY) * adjustedAlpha;
  }

  return { x: camX, y: camY };
}

/**
 * Adaptive zoom level based on target element size.
 */
function adaptiveZoom(
  baseZoom: number,
  targetBox?: { width: number; height: number }
): number {
  if (!targetBox) return baseZoom;
  const maxDim = Math.max(targetBox.width, targetBox.height);
  if (maxDim < 100) return Math.min(baseZoom * 1.15, 2.0);
  if (maxDim < 300) return baseZoom;
  return Math.max(baseZoom * 0.88, 1.05);
}

export const CameraFollow: React.FC<CameraFollowProps> = ({
  children,
  allEvents,
  clickEvents,
  autoZoom,
  viewport,
  outputSize,
  segmentStartFrame,
  segmentDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - segmentStartFrame;

  if (allEvents.length === 0) {
    return <>{children}</>;
  }

  const scaleX = outputSize.width / viewport.width;
  const scaleY = outputSize.height / viewport.height;
  const centerX = outputSize.width / 2;
  const centerY = outputSize.height / 2;

  // ─── Continuous camera tracking (EMA simulation) ───
  const camPos = computeCameraPosition(allEvents, localFrame, CAMERA_SMOOTHING);
  const camScreenX = camPos.x * scaleX;
  const camScreenY = camPos.y * scaleY;

  // ─── Click zoom boost ───
  let clickZoomScale = 1;
  let clickOriginX = camScreenX;
  let clickOriginY = camScreenY;

  for (let i = 0; i < clickEvents.length; i++) {
    const click = clickEvents[i];
    const clickLocalFrame = localFrame - click.frame;

    const nextClick = clickEvents[i + 1];
    const nextFrame = nextClick ? nextClick.frame : Infinity;
    const effectiveTotal = Math.min(TOTAL_ZOOM_FRAMES, nextFrame - click.frame);

    if (clickLocalFrame < 0 || clickLocalFrame >= effectiveTotal) continue;

    const targetZoom = adaptiveZoom(autoZoom, click.targetBox);

    let zoomProgress: number;
    if (clickLocalFrame < ZOOM_IN_FRAMES) {
      zoomProgress = spring({
        frame: clickLocalFrame,
        fps,
        config: { damping: 200 },
        durationInFrames: ZOOM_IN_FRAMES,
      });
    } else if (clickLocalFrame < ZOOM_IN_FRAMES + ZOOM_HOLD_FRAMES) {
      zoomProgress = 1;
    } else {
      const outFrame = clickLocalFrame - ZOOM_IN_FRAMES - ZOOM_HOLD_FRAMES;
      const outDuration = effectiveTotal - ZOOM_IN_FRAMES - ZOOM_HOLD_FRAMES;
      zoomProgress =
        1 -
        spring({
          frame: outFrame,
          fps,
          config: { damping: 200 },
          durationInFrames: Math.max(1, outDuration),
        });
    }

    clickZoomScale = interpolate(zoomProgress, [0, 1], [1, targetZoom]);
    clickOriginX = click.x * scaleX;
    clickOriginY = click.y * scaleY;
    break;
  }

  // ─── Combine base zoom + click zoom ───
  const totalZoom = BASE_ZOOM * clickZoomScale;

  // ─── Camera offset: pan toward look-at point ───
  // Blend camera position (continuous) with click target (discrete)
  const blendedX =
    clickZoomScale > 1.01
      ? centerX * 0.5 + clickOriginX * 0.3 + camScreenX * 0.2
      : centerX * 0.6 + camScreenX * 0.4;
  const blendedY =
    clickZoomScale > 1.01
      ? centerY * 0.5 + clickOriginY * 0.3 + camScreenY * 0.2
      : centerY * 0.6 + camScreenY * 0.4;

  const translateX = (centerX - blendedX) * (totalZoom - 1);
  const translateY = (centerY - blendedY) * (totalZoom - 1);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        transform: `scale(${totalZoom}) translate(${translateX / totalZoom}px, ${translateY / totalZoom}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};
