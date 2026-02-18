/**
 * ZoomLayer — spring-animated zoom that triggers on click events.
 *
 * Wraps video content with CSS `transform: scale() translate()`.
 * On click events from cursor data:
 * - Adaptive zoom level based on target element size
 * - Zoom origin blended: 70% viewport center + 30% click target
 * - Spring-animated in/out using Remotion spring()
 * - Holds zoom for ~20 frames, then springs back
 * - Consecutive clicks transition directly between zoom targets
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { CursorEventInput } from "./types.js";

interface ZoomLayerProps {
  children: React.ReactNode;
  clickEvents: CursorEventInput[];
  autoZoom: number; // base zoom level (e.g. 1.3)
  viewport: { width: number; height: number };
  outputSize: { width: number; height: number };
  /** Frame offset: the global frame where this segment starts */
  segmentStartFrame: number;
}

const ZOOM_IN_FRAMES = 15;
const ZOOM_HOLD_FRAMES = 20;
const ZOOM_OUT_FRAMES = 18;
const TOTAL_ZOOM_FRAMES = ZOOM_IN_FRAMES + ZOOM_HOLD_FRAMES + ZOOM_OUT_FRAMES;

/**
 * Compute adaptive zoom level based on target element size.
 * Small targets get more zoom, large targets get less.
 */
function adaptiveZoom(
  baseZoom: number,
  targetBox?: { width: number; height: number }
): number {
  if (!targetBox) return baseZoom;
  const maxDim = Math.max(targetBox.width, targetBox.height);
  if (maxDim < 100) return Math.min(baseZoom * 1.15, 2.0); // small target → more zoom
  if (maxDim < 300) return baseZoom; // medium → base zoom
  return Math.max(baseZoom * 0.88, 1.05); // large → less zoom
}

export const ZoomLayer: React.FC<ZoomLayerProps> = ({
  children,
  clickEvents,
  autoZoom,
  viewport,
  outputSize,
  segmentStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (clickEvents.length === 0) {
    return <>{children}</>;
  }

  const scaleX = outputSize.width / viewport.width;
  const scaleY = outputSize.height / viewport.height;

  // Find the active zoom region for the current frame
  let zoomScale = 1;
  let translateX = 0;
  let translateY = 0;

  for (let i = 0; i < clickEvents.length; i++) {
    const click = clickEvents[i];
    const clickGlobalFrame = click.frame + segmentStartFrame;
    const localFrame = frame - clickGlobalFrame;

    // Check if next click happens before this zoom finishes
    const nextClick = clickEvents[i + 1];
    const nextClickFrame = nextClick
      ? nextClick.frame + segmentStartFrame
      : Infinity;
    const effectiveTotal = Math.min(
      TOTAL_ZOOM_FRAMES,
      nextClickFrame - clickGlobalFrame
    );

    if (localFrame < 0 || localFrame >= effectiveTotal) {
      continue;
    }

    const targetZoom = adaptiveZoom(autoZoom, click.targetBox);

    // Compute zoom progress using spring
    let zoomProgress: number;

    if (localFrame < ZOOM_IN_FRAMES) {
      // Zooming in
      zoomProgress = spring({
        frame: localFrame,
        fps,
        config: { stiffness: 120, damping: 200 },
        durationInFrames: ZOOM_IN_FRAMES,
      });
    } else if (localFrame < ZOOM_IN_FRAMES + ZOOM_HOLD_FRAMES) {
      // Holding
      zoomProgress = 1;
    } else {
      // Zooming out (or transitioning to next click)
      const outFrame = localFrame - ZOOM_IN_FRAMES - ZOOM_HOLD_FRAMES;
      const outDuration = effectiveTotal - ZOOM_IN_FRAMES - ZOOM_HOLD_FRAMES;
      zoomProgress =
        1 -
        spring({
          frame: outFrame,
          fps,
          config: { stiffness: 120, damping: 200 },
          durationInFrames: Math.max(1, outDuration),
        });
    }

    zoomScale = interpolate(zoomProgress, [0, 1], [1, targetZoom]);

    // Compute zoom origin — blend 70% viewport center + 30% click target
    const centerX = outputSize.width / 2;
    const centerY = outputSize.height / 2;
    const targetX = click.x * scaleX;
    const targetY = click.y * scaleY;
    const originX = centerX * 0.7 + targetX * 0.3;
    const originY = centerY * 0.7 + targetY * 0.3;

    // Translate so the zoom origin stays visually centered
    translateX = (centerX - originX) * (zoomScale - 1);
    translateY = (centerY - originY) * (zoomScale - 1);

    break; // Only apply the first active zoom
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        transform: `scale(${zoomScale}) translate(${translateX / zoomScale}px, ${translateY / zoomScale}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};
