/**
 * Shared types for Remotion composition props.
 */

export interface SegmentInput {
  fileName: string; // filename in publicDir (e.g. "abc123.webm")
  trimSec: number; // seconds to trim from start
  durationSec: number; // usable duration after trim
  name: string;
}

export interface ThemeInput {
  background: string;
  padding: number;
  radius: number;
  shadow: boolean;
  windowChrome: boolean;
}

export interface TransitionInput {
  type: string; // "fade" | "slide" | "wipe" etc.
  durationSec: number;
}

export interface DemotapeVideoProps {
  segments: SegmentInput[];
  theme?: ThemeInput;
  transition?: TransitionInput;
  audioFileName?: string;
  width: number;
  height: number;
  fps: number;
}
