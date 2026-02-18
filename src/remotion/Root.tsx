/**
 * Remotion root — defines the DemotapeVideo composition.
 *
 * Uses calculateMetadata to dynamically compute duration from segment data
 * passed as inputProps at render time. Accounts for intro/outro cards.
 */
import React from "react";
import { Composition } from "remotion";
import { DemotapeVideo } from "./DemotapeVideo.js";
import type { DemotapeVideoProps, SegmentInput } from "./types.js";

const INTRO_DURATION_SEC = 2.5;
const OUTRO_DURATION_SEC = 2.5;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DemotapeVideo"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component={DemotapeVideo as any}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        segments: [] as SegmentInput[],
        width: 1280,
        height: 720,
        fps: 30,
      } as Record<string, unknown>}
      calculateMetadata={async ({ props }) => {
        const p = props as unknown as DemotapeVideoProps;
        const fps = p.fps || 30;
        const segs = p.segments || [];
        const totalSegSec = segs.reduce(
          (sum: number, s: SegmentInput) => sum + s.durationSec,
          0
        );
        const transitionOverlap = p.transition
          ? p.transition.durationSec * Math.max(0, segs.length - 1)
          : 0;

        const introDuration = p.intro ? INTRO_DURATION_SEC : 0;
        const outroDuration = p.outro ? OUTRO_DURATION_SEC : 0;

        const totalSec =
          introDuration + (totalSegSec - transitionOverlap) + outroDuration;

        const durationInFrames = Math.max(1, Math.ceil(totalSec * fps));

        return {
          durationInFrames,
          fps,
          width: p.width || 1280,
          height: p.height || 720,
        };
      }}
    />
  );
};
