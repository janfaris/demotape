/**
 * CursorOverlay — renders an SVG macOS arrow cursor over the video.
 *
 * Premium cursor rendering with:
 * - Organic Bézier curve paths (not straight lines)
 * - Spring physics with natural overshoot
 * - Deterministic arc offsets for reproducible "human" movement
 * - Radial highlight glow behind cursor
 * - Fade in/out at segment boundaries
 * - Subtle breathing motion during idle
 * - Click press animation (scale down/up)
 */
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import type { CursorEventInput, CursorConfigInput } from "./types.js";
import { ClickEffect } from "./ClickEffect.js";

/**
 * macOS arrow cursor — white fill with black stroke.
 */
const MACOS_CURSOR_PATH = "M5.5 3.21V20.8l4.86-4.86h6.78L5.5 3.21z";
const MACOS_CURSOR_VIEWBOX = "0 0 22 22";

interface CursorOverlayProps {
  events: CursorEventInput[];
  config: CursorConfigInput;
  segmentStartFrame: number;
  segmentDurationFrames: number;
  viewport: { width: number; height: number };
  outputSize: { width: number; height: number };
}

/**
 * Deterministic pseudo-random from a seed. Returns 0-1.
 */
function seededRandom(seed: number): number {
  return ((Math.sin(seed * 12345.6789 + 0.1) * 43758.5453) % 1 + 1) % 1;
}

/**
 * Evaluate a cubic Bézier curve at parameter t.
 */
function cubicBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Find the two events bracketing the current frame.
 */
function findBracketingEvents(
  events: CursorEventInput[],
  localFrame: number
): { prev: CursorEventInput; next: CursorEventInput; prevIndex: number } {
  if (events.length === 0) {
    const idle: CursorEventInput = { type: "idle", frame: 0, x: 0, y: 0 };
    return { prev: idle, next: idle, prevIndex: 0 };
  }
  if (localFrame <= events[0].frame) {
    return { prev: events[0], next: events[0], prevIndex: 0 };
  }
  if (localFrame >= events[events.length - 1].frame) {
    const last = events[events.length - 1];
    return { prev: last, next: last, prevIndex: events.length - 1 };
  }
  for (let i = 0; i < events.length - 1; i++) {
    if (localFrame >= events[i].frame && localFrame < events[i + 1].frame) {
      return { prev: events[i], next: events[i + 1], prevIndex: i };
    }
  }
  const last = events[events.length - 1];
  return { prev: last, next: last, prevIndex: events.length - 1 };
}

/**
 * Compute organic cursor position using Bézier curves + spring overshoot.
 */
function computeCursorPosition(
  prev: CursorEventInput,
  next: CursorEventInput,
  prevIndex: number,
  localFrame: number,
  fps: number
): { x: number; y: number } {
  // Same position — no interpolation needed
  if (prev === next || (prev.x === next.x && prev.y === next.y)) {
    return { x: prev.x, y: prev.y };
  }

  const span = next.frame - prev.frame;
  if (span <= 0) return { x: next.x, y: next.y };

  // Spring with slight overshoot for natural deceleration
  const springProgress = spring({
    frame: Math.max(0, localFrame - prev.frame),
    fps,
    config: { mass: 1, stiffness: 170, damping: 18 },
    durationInFrames: Math.max(1, span + 8), // extra frames for overshoot tail
  });

  // Bézier curve control points — arc perpendicular to the direct line
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return { x: next.x, y: next.y };

  // Perpendicular direction
  const perpX = -dy / dist;
  const perpY = dx / dist;

  // Deterministic arc offset — varies per event pair
  const seed = seededRandom(prevIndex + prev.frame * 0.01);
  const arcMagnitude = dist * 0.12 * (seed - 0.5); // ±6% of travel distance

  // Two control points create a natural S-curve
  const cp1x = prev.x + dx * 0.3 + perpX * arcMagnitude;
  const cp1y = prev.y + dy * 0.3 + perpY * arcMagnitude;
  const cp2x = prev.x + dx * 0.7 + perpX * arcMagnitude * 0.4;
  const cp2y = prev.y + dy * 0.7 + perpY * arcMagnitude * 0.4;

  // Evaluate Bézier at spring progress (with overshoot clamped to 1.08)
  const t = Math.min(springProgress, 1.08);
  const x = cubicBezier(t, prev.x, cp1x, cp2x, next.x);
  const y = cubicBezier(t, prev.y, cp1y, cp2y, next.y);

  return { x, y };
}

export const CursorOverlay: React.FC<CursorOverlayProps> = ({
  events,
  config,
  segmentStartFrame,
  segmentDurationFrames,
  viewport,
  outputSize,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - segmentStartFrame;

  if (localFrame < 0 || localFrame >= segmentDurationFrames) return null;

  // ─── Position via organic Bézier paths ───
  const { prev, next, prevIndex } = findBracketingEvents(events, localFrame);
  const rawPos = computeCursorPosition(prev, next, prevIndex, localFrame, fps);

  // Scale from viewport to output coordinates
  const scaleX = outputSize.width / viewport.width;
  const scaleY = outputSize.height / viewport.height;
  let cursorX = rawPos.x * scaleX;
  let cursorY = rawPos.y * scaleY;

  // ─── Idle breathing ───
  const isIdle =
    prev.type === "idle" ||
    prev.type === "scroll" ||
    (prev === next && localFrame > prev.frame + 10);
  if (isIdle) {
    cursorX += Math.sin(localFrame * 0.03) * 1.5;
    cursorY += Math.sin(localFrame * 0.05 + 0.7) * 2;
  }

  // ─── Fade in/out ───
  const FADE_FRAMES = 8;
  let opacity = 1;
  if (localFrame < FADE_FRAMES) {
    opacity = interpolate(localFrame, [0, FADE_FRAMES], [0, 1], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    });
  } else if (localFrame > segmentDurationFrames - FADE_FRAMES) {
    opacity = interpolate(
      localFrame,
      [segmentDurationFrames - FADE_FRAMES, segmentDurationFrames],
      [1, 0],
      { extrapolateLeft: "clamp", easing: Easing.in(Easing.quad) }
    );
  }

  // ─── Click press animation ───
  let cursorScale = 1;
  const PRESS_FRAMES = 8;
  const clickEvents = events.filter((e) => e.type === "click");
  for (const click of clickEvents) {
    const elapsed = localFrame - click.frame;
    if (elapsed >= 0 && elapsed < PRESS_FRAMES) {
      const half = PRESS_FRAMES / 2;
      cursorScale =
        elapsed < half
          ? 1 - 0.18 * (elapsed / half)
          : 0.82 + 0.18 * ((elapsed - half) / half);
    }
  }

  const CURSOR_SIZE = 24 * scaleX;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Radial highlight */}
      {config.highlight && (
        <div
          style={{
            position: "absolute",
            left: cursorX - 24 * scaleX,
            top: cursorY - 24 * scaleY,
            width: 48 * scaleX,
            height: 48 * scaleY,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
            opacity,
          }}
        />
      )}

      {/* Click effects */}
      {config.clickEffect &&
        clickEvents.map((click, i) => (
          <ClickEffect
            key={i}
            clickFrame={click.frame + segmentStartFrame}
            x={click.x * scaleX}
            y={click.y * scaleY}
            scale={scaleX}
          />
        ))}

      {/* Cursor */}
      <div
        style={{
          position: "absolute",
          left: cursorX,
          top: cursorY,
          opacity,
          transform: `scale(${cursorScale})`,
          transformOrigin: "top left",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
        }}
      >
        {config.style === "arrow" ? (
          <svg
            width={CURSOR_SIZE}
            height={CURSOR_SIZE}
            viewBox={MACOS_CURSOR_VIEWBOX}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d={MACOS_CURSOR_PATH}
              fill="white"
              stroke="black"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div
            style={{
              width: CURSOR_SIZE * 0.6,
              height: CURSOR_SIZE * 0.6,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.8)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
