/**
 * IntroCard — animated title card at the start of the video.
 *
 * Spring fade-in from below with scale. Uses the theme's wallpaper background.
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

interface IntroCardProps {
  title: string;
  subtitle?: string;
  theme?: ThemeInput;
}

export const IntroCard: React.FC<IntroCardProps> = ({
  title,
  subtitle,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ─── Entrance (frames 0 → 20): spring from below ───
  const enterProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });

  const enterY = interpolate(enterProgress, [0, 1], [40, 0]);
  const enterOpacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const enterScale = interpolate(enterProgress, [0, 1], [0.95, 1]);

  // ─── Exit (last 15 frames): fade out ───
  const exitStart = durationInFrames - 15;
  const exitOpacity =
    frame >= exitStart
      ? interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.in(Easing.quad),
        })
      : 1;

  const opacity = enterOpacity * exitOpacity;

  // ─── Subtitle entrance (delayed by 8 frames) ───
  const subtitleProgress = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });
  const subtitleY = interpolate(subtitleProgress, [0, 1], [20, 0]);
  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]) * exitOpacity;

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
          transform: `translateY(${enterY}px) scale(${enterScale})`,
        }}
      >
        <div
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
            fontSize: 64,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-0.02em",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>

        {subtitle && (
          <div
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
              fontSize: 24,
              fontWeight: 400,
              color: "rgba(255, 255, 255, 0.5)",
              marginTop: 16,
              letterSpacing: "0.01em",
              textAlign: "center",
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            {subtitle}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
