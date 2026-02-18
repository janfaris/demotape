/**
 * ThemeFrame — CSS-based theme compositor for Remotion.
 *
 * Replaces the FFmpeg geq/drawtext/boxblur filter chain with simple CSS:
 * - Animated aurora/mesh wallpaper background
 * - Content padding
 * - Rounded corners (borderRadius)
 * - Drop shadow (boxShadow)
 * - macOS window chrome with traffic light dots
 */
import { AbsoluteFill } from "remotion";
import { Wallpaper } from "./Wallpaper.js";
import type { ThemeInput } from "./types.js";

interface ThemeFrameProps {
  theme: ThemeInput;
  children: React.ReactNode;
}

export const ThemeFrame: React.FC<ThemeFrameProps> = ({ theme, children }) => {
  const padding = `${theme.padding * 100}%`;

  return (
    <AbsoluteFill>
      {/* Animated wallpaper background */}
      <Wallpaper
        type={theme.wallpaper ?? "none"}
        background={theme.background}
      />

      {/* Window frame */}
      <div
        style={{
          position: "absolute",
          top: padding,
          left: padding,
          right: padding,
          bottom: padding,
          borderRadius: theme.radius,
          overflow: "hidden",
          boxShadow: theme.shadow
            ? "0 25px 80px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)"
            : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* macOS window chrome */}
        {theme.windowChrome && (
          <div
            style={{
              height: 36,
              backgroundColor: "#2d2d2d",
              display: "flex",
              alignItems: "center",
              paddingLeft: 14,
              gap: 8,
              borderBottom: "1px solid #1a1a1a",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#ff5f57",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#febc2e",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#28c840",
              }}
            />
          </div>
        )}

        {/* Video content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};
