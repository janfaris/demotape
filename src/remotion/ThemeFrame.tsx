/**
 * ThemeFrame — CSS-based theme compositor for Remotion.
 *
 * Replaces the FFmpeg geq/drawtext/boxblur filter chain with simple CSS:
 * - Dark background
 * - Content padding
 * - Rounded corners (borderRadius)
 * - Drop shadow (boxShadow)
 * - macOS window chrome with traffic light dots
 */
import { AbsoluteFill } from "remotion";
import type { ThemeInput } from "./types.js";

interface ThemeFrameProps {
  theme: ThemeInput;
  children: React.ReactNode;
}

export const ThemeFrame: React.FC<ThemeFrameProps> = ({ theme, children }) => {
  const padding = `${theme.padding * 100}%`;

  return (
    <AbsoluteFill style={{ background: theme.background }}>
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
            ? "0 20px 60px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 80px rgba(99,102,241,0.08)"
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
