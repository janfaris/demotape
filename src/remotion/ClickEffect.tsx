/**
 * ClickEffect — expanding ring animation at a click location.
 *
 * Renders a white outline ring (no fill) that expands from 4px to 40px radius
 * and fades from 0.5 to 0 opacity over ~10 frames. Works on both light and
 * dark backgrounds since it's a white border with no fill.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface ClickEffectProps {
  /** Global frame when the click occurs */
  clickFrame: number;
  /** X position in output coordinates */
  x: number;
  /** Y position in output coordinates */
  y: number;
  /** Scale factor (output / viewport) */
  scale: number;
}

const EFFECT_DURATION = 10; // frames
const MIN_RADIUS = 4;
const MAX_RADIUS = 40;

export const ClickEffect: React.FC<ClickEffectProps> = ({
  clickFrame,
  x,
  y,
  scale,
}) => {
  const frame = useCurrentFrame();

  const elapsed = frame - clickFrame;

  // Only render during the effect window
  if (elapsed < 0 || elapsed >= EFFECT_DURATION) {
    return null;
  }

  const progress = elapsed / EFFECT_DURATION;

  const radius = interpolate(progress, [0, 1], [MIN_RADIUS * scale, MAX_RADIUS * scale]);
  const opacity = interpolate(progress, [0, 1], [0.5, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        border: `${2 * scale}px solid white`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};
