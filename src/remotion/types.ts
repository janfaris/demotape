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
  wallpaper?: "aurora" | "mesh" | "gradient" | "none";
}

export interface IntroInput {
  title: string;
  subtitle?: string;
}

export interface OutroInput {
  text: string;
  url?: string;
}

export interface TransitionInput {
  type: string; // "fade" | "slide" | "wipe" etc.
  durationSec: number;
}

/* ─── Cursor overlay types ─── */

export interface CursorEventInput {
  type: "move" | "click" | "scroll" | "idle";
  /** Frame number (relative to segment start in the composition) */
  frame: number;
  /** Viewport x coordinate */
  x: number;
  /** Viewport y coordinate */
  y: number;
  /** Bounding box of the action target (for adaptive zoom) */
  targetBox?: { width: number; height: number };
}

export interface SegmentCursorInput {
  segmentIndex: number;
  viewport: { width: number; height: number };
  events: CursorEventInput[];
}

export interface CursorConfigInput {
  enabled: boolean;
  style: "arrow" | "circle";
  highlight: boolean;
  clickEffect: boolean;
  autoZoom?: number; // e.g. 1.3
}

/* ─── Main composition props ─── */

export interface DemotapeVideoProps {
  segments: SegmentInput[];
  theme?: ThemeInput;
  transition?: TransitionInput;
  audioFileName?: string;
  width: number;
  height: number;
  fps: number;
  cursorData?: SegmentCursorInput[];
  cursorConfig?: CursorConfigInput;
  intro?: IntroInput;
  outro?: OutroInput;
}
