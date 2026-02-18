/**
 * DemotapeVideo — main Remotion composition.
 *
 * Renders:
 * 1. Intro card (optional) — title + subtitle with spring entrance
 * 2. TransitionSeries with OffthreadVideo for each segment
 * 3. ThemeFrame wrapper (animated wallpaper, rounded corners, window chrome)
 * 4. CameraFollow (continuous cinematic zoom tracking)
 * 5. CursorOverlay (SVG cursor with Bézier paths + click effects)
 * 6. Audio overlay for narration
 * 7. Outro card (optional) — CTA text with spring entrance
 */
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { ThemeFrame } from "./ThemeFrame.js";
import { CursorOverlay } from "./CursorOverlay.js";
import { CameraFollow } from "./CameraFollow.js";
import { IntroCard } from "./IntroCard.js";
import { OutroCard } from "./OutroCard.js";
import type {
  DemotapeVideoProps,
  TransitionInput,
  CursorEventInput,
} from "./types.js";

const INTRO_DURATION_SEC = 2.5;
const OUTRO_DURATION_SEC = 2.5;

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
  cursorData,
  cursorConfig,
  intro,
  outro,
}) => {
  const { fps, width, height } = useVideoConfig();

  const introFrames = intro ? Math.round(INTRO_DURATION_SEC * fps) : 0;
  const outroFrames = outro ? Math.round(OUTRO_DURATION_SEC * fps) : 0;

  const transitionFrames = transition
    ? Math.round(transition.durationSec * fps)
    : 0;

  // Compute total main content duration
  const mainContentFrames = segments.reduce((sum, seg) => {
    return sum + Math.round(seg.durationSec * fps);
  }, 0) - (transition ? transitionFrames * Math.max(0, segments.length - 1) : 0);

  // Segment start frames within the main content block (local to main content)
  const segmentStartFramesLocal: number[] = [];
  const segmentDurationFrames: number[] = [];
  let runningFrame = 0;
  for (let i = 0; i < segments.length; i++) {
    segmentStartFramesLocal.push(runningFrame);
    const dur = Math.round(segments[i].durationSec * fps);
    segmentDurationFrames.push(dur);
    runningFrame += dur;
    if (transition && transitionFrames > 0 && i < segments.length - 1) {
      runningFrame -= transitionFrames;
    }
  }

  function getCursorEventsForSegment(
    segIndex: number
  ): CursorEventInput[] | null {
    if (!cursorData || !cursorConfig?.enabled) return null;
    const segData = cursorData.find((d) => d.segmentIndex === segIndex);
    return segData?.events ?? null;
  }

  const renderSegment = (index: number) => {
    const seg = segments[index];
    const startFrom = Math.round(seg.trimSec * fps);
    const events = getCursorEventsForSegment(index);
    const allEvents = events ?? [];
    const clickEvents = allEvents.filter((e) => e.type === "click");
    const segViewport = cursorData?.find(
      (d) => d.segmentIndex === index
    )?.viewport ?? { width, height };

    const videoEl = (
      <OffthreadVideo
        src={staticFile(seg.fileName)}
        startFrom={startFrom}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
      />
    );

    // CameraFollow wraps video for continuous cinematic tracking
    const cameraWrapped =
      cursorConfig?.enabled && allEvents.length > 0 ? (
        <CameraFollow
          allEvents={allEvents}
          clickEvents={clickEvents}
          autoZoom={cursorConfig.autoZoom ?? 1.2}
          viewport={segViewport}
          outputSize={{ width, height }}
          segmentStartFrame={segmentStartFramesLocal[index]}
          segmentDurationFrames={segmentDurationFrames[index]}
        >
          {videoEl}
        </CameraFollow>
      ) : (
        videoEl
      );

    // Content with cursor overlay
    const contentWithCursor = (
      <AbsoluteFill>
        {cameraWrapped}
        {events && cursorConfig && (
          <CursorOverlay
            events={events}
            config={cursorConfig}
            segmentStartFrame={segmentStartFramesLocal[index]}
            segmentDurationFrames={segmentDurationFrames[index]}
            viewport={segViewport}
            outputSize={{ width, height }}
          />
        )}
      </AbsoluteFill>
    );

    if (theme) {
      return <ThemeFrame theme={theme}>{contentWithCursor}</ThemeFrame>;
    }

    return <AbsoluteFill>{contentWithCursor}</AbsoluteFill>;
  };

  // ─── Main content block (segments with transitions) ───
  const mainContent = transition && transitionFrames > 0 ? (
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
    segments.map((seg, i) => {
      const durationInFrames = Math.round(seg.durationSec * fps);
      return (
        <AbsoluteFill key={`seg-${i}`}>
          {renderSegment(i)}
        </AbsoluteFill>
      );
    })
  );

  return (
    <AbsoluteFill style={{ background: theme?.background ?? "#000" }}>
      {/* Intro card */}
      {intro && (
        <Sequence
          durationInFrames={introFrames}
          premountFor={0}
        >
          <IntroCard
            title={intro.title}
            subtitle={intro.subtitle}
            theme={theme}
          />
        </Sequence>
      )}

      {/* Main content (offset by intro duration) */}
      <Sequence
        from={introFrames}
        durationInFrames={mainContentFrames}
        premountFor={Math.round(0.5 * fps)}
      >
        {mainContent}
      </Sequence>

      {/* Outro card */}
      {outro && (
        <Sequence
          from={introFrames + mainContentFrames}
          durationInFrames={outroFrames}
          premountFor={Math.round(0.5 * fps)}
        >
          <OutroCard
            text={outro.text}
            url={outro.url}
            theme={theme}
          />
        </Sequence>
      )}

      {/* Narration audio */}
      {audioFileName && (
        <Audio src={staticFile(audioFileName)} volume={1} />
      )}
    </AbsoluteFill>
  );
};
