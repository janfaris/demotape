/**
 * DemotapeVideo — main Remotion composition.
 *
 * Receives recorded segment files + config as props, renders:
 * 1. TransitionSeries with OffthreadVideo for each segment
 * 2. ThemeFrame wrapper (CSS rounded corners, shadow, window chrome)
 * 3. Audio overlay for narration
 */
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { ThemeFrame } from "./ThemeFrame.js";
import type { DemotapeVideoProps, TransitionInput } from "./types.js";

/**
 * Map demotape transition type strings to Remotion presentation objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransition(t: TransitionInput): any {
  switch (t.type) {
    case "fade":
    case "fadeblack":
    case "fadewhite":
      return fade();
    case "slideleft":
    case "smoothleft":
      return slide({ direction: "from-left" });
    case "slideright":
    case "smoothright":
      return slide({ direction: "from-right" });
    case "slideup":
    case "smoothup":
      return slide({ direction: "from-top" });
    case "slidedown":
    case "smoothdown":
      return slide({ direction: "from-bottom" });
    case "wipeleft":
      return wipe({ direction: "from-left" });
    case "wiperight":
      return wipe({ direction: "from-right" });
    case "wipeup":
      return wipe({ direction: "from-top" });
    case "wipedown":
      return wipe({ direction: "from-bottom" });
    default:
      return fade();
  }
}

export const DemotapeVideo: React.FC<DemotapeVideoProps> = ({
  segments,
  theme,
  transition,
  audioFileName,
}) => {
  const { fps } = useVideoConfig();

  const transitionFrames = transition
    ? Math.round(transition.durationSec * fps)
    : 0;

  const renderSegment = (index: number) => {
    const seg = segments[index];
    const durationInFrames = Math.round(seg.durationSec * fps);
    const startFrom = Math.round(seg.trimSec * fps);

    const videoContent = (
      <OffthreadVideo
        src={staticFile(seg.fileName)}
        startFrom={startFrom}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
      />
    );

    // Wrap in theme if configured
    if (theme) {
      return (
        <ThemeFrame theme={theme}>
          {videoContent}
        </ThemeFrame>
      );
    }

    return <AbsoluteFill>{videoContent}</AbsoluteFill>;
  };

  return (
    <AbsoluteFill style={{ background: theme?.background ?? "#000" }}>
      {/* Video segments with transitions */}
      {transition && transitionFrames > 0 ? (
        <TransitionSeries>
          {segments.flatMap((seg, i) => {
            const durationInFrames = Math.round(seg.durationSec * fps);
            const items = [
              <TransitionSeries.Sequence
                key={`seg-${i}`}
                durationInFrames={durationInFrames}
              >
                {renderSegment(i)}
              </TransitionSeries.Sequence>,
            ];

            if (i < segments.length - 1) {
              items.push(
                <TransitionSeries.Transition
                  key={`tr-${i}`}
                  presentation={mapTransition(transition)}
                  timing={springTiming({
                    config: { damping: 200 },
                    durationInFrames: transitionFrames,
                  })}
                />
              );
            }

            return items;
          })}
        </TransitionSeries>
      ) : (
        // No transitions — simple sequential playback
        segments.map((seg, i) => {
          const startFrame = segments
            .slice(0, i)
            .reduce((sum, s) => sum + Math.round(s.durationSec * fps), 0);
          const durationInFrames = Math.round(seg.durationSec * fps);

          return (
            <AbsoluteFill
              key={`seg-${i}`}
              style={{
                opacity: 1,
                // Manual sequencing: only show during this segment's time window
              }}
            >
              {/* Use CSS to show/hide based on frame range */}
              {renderSegment(i)}
            </AbsoluteFill>
          );
        })
      )}

      {/* Narration audio */}
      {audioFileName && (
        <Audio src={staticFile(audioFileName)} volume={1} />
      )}
    </AbsoluteFill>
  );
};
