/**
 * OutroCard — CTA card at the end of the video.
 *
 * Spring fade-in with scale. Matches the theme's wallpaper background.
 * All animation frame-driven via useCurrentFrame() (Remotion requirement).
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
import { Wallpaper } from "./Wallpaper.js";
import type { ThemeInput } from "./types.js";

interface OutroCardProps {
  text: string;
  url?: string;
  theme?: ThemeInput;
}

export const OutroCard: React.FC<OutroCardProps> = ({ text, url, theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ─── Entrance: spring scale-in ───
  const enterProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });

  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 1], [0, 1]);

  // ─── Exit: fade out in last 10 frames ───
  const exitStart = durationInFrames - 10;
  const exitOpacity =
    frame >= exitStart
      ? interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.in(Easing.quad),
        })
      : 1;

  const opacity = enterOpacity * exitOpacity;

  // ─── URL entrance (delayed by 10 frames) ───
  const urlProgress = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });
  const urlOpacity = interpolate(urlProgress, [0, 1], [0, 1]) * exitOpacity;
  const urlY = interpolate(urlProgress, [0, 1], [15, 0]);

  return (
    <AbsoluteFill>
      {/* Background */}
      <Wallpaper
        type={theme?.wallpaper ?? "aurora"}
        background={theme?.background ?? "#0a0a1a"}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity,
          transform: `scale(${enterScale})`,
        }}
      >
        <div
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
            fontSize: 48,
            fontWeight: 600,
            color: "white",
            letterSpacing: "-0.01em",
            textAlign: "center",
          }}
        >
          {text}
        </div>

        {url && (
          <div
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
              fontSize: 22,
              fontWeight: 400,
              color: "rgba(99, 102, 241, 0.8)",
              marginTop: 14,
              letterSpacing: "0.02em",
              textAlign: "center",
              opacity: urlOpacity,
              transform: `translateY(${urlY}px)`,
            }}
          >
            {url}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
