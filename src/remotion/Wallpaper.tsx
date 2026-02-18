/**
 * Wallpaper — animated background behind the window frame.
 *
 * Frame-driven gradient animation (no CSS transitions — Remotion requirement).
 * Multiple radial gradient blobs slowly drift to create an aurora/mesh effect.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export type WallpaperType = "aurora" | "mesh" | "gradient" | "none";

interface WallpaperProps {
  type: WallpaperType;
  /** Fallback solid/gradient background color */
  background: string;
}

export const Wallpaper: React.FC<WallpaperProps> = ({ type, background }) => {
  const frame = useCurrentFrame();

  if (type === "none") {
    return <AbsoluteFill style={{ background }} />;
  }

  if (type === "gradient") {
    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        }}
      />
    );
  }

  if (type === "mesh") {
    // Static mesh gradient — 4 color points
    return (
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.25) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(168, 85, 247, 0.2) 0%, transparent 50%),
            radial-gradient(circle at 60% 80%, rgba(59, 130, 246, 0.18) 0%, transparent 50%),
            radial-gradient(circle at 30% 70%, rgba(236, 72, 153, 0.12) 0%, transparent 50%),
            linear-gradient(135deg, #0a0a1a 0%, #12101f 50%, #0a0a1a 100%)
          `,
        }}
      />
    );
  }

  // Aurora — animated drifting blobs
  const b1x = 25 + Math.sin(frame * 0.006) * 12;
  const b1y = 28 + Math.cos(frame * 0.005) * 8;
  const b2x = 72 + Math.sin(frame * 0.008 + 2.1) * 14;
  const b2y = 22 + Math.cos(frame * 0.006 + 1.3) * 10;
  const b3x = 55 + Math.sin(frame * 0.005 + 4.2) * 10;
  const b3y = 75 + Math.cos(frame * 0.007 + 0.8) * 12;
  const b4x = 35 + Math.sin(frame * 0.009 + 3.0) * 8;
  const b4y = 60 + Math.cos(frame * 0.004 + 2.5) * 6;

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(ellipse 60% 50% at ${b1x}% ${b1y}%, rgba(99, 102, 241, 0.28) 0%, transparent 70%),
          radial-gradient(ellipse 55% 45% at ${b2x}% ${b2y}%, rgba(168, 85, 247, 0.22) 0%, transparent 70%),
          radial-gradient(ellipse 65% 55% at ${b3x}% ${b3y}%, rgba(59, 130, 246, 0.18) 0%, transparent 65%),
          radial-gradient(ellipse 50% 40% at ${b4x}% ${b4y}%, rgba(236, 72, 153, 0.12) 0%, transparent 60%),
          linear-gradient(145deg, #07060e 0%, #0e0b1a 30%, #130f22 60%, #0a0814 100%)
        `,
      }}
    />
  );
};
