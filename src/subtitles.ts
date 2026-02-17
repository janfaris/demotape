/**
 * Subtitle generation — creates SRT files from segment narration scripts.
 *
 * Generates timed SRT entries based on segment durations. Optionally builds
 * an FFmpeg subtitles filter for burning captions into the video.
 */

import { execSync } from "child_process";
import type { SegmentResult } from "./segments.js";
import type { SubtitlesConfig } from "./config.js";

export interface SrtEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Format seconds into SRT timestamp: "HH:MM:SS,mmm"
 */
export function formatSrtTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

/**
 * Render SRT entries into a valid SRT string.
 */
export function generateSrt(entries: SrtEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.index}\n${formatSrtTimestamp(e.startSec)} --> ${formatSrtTimestamp(e.endSec)}\n${e.text}`
    )
    .join("\n\n") + "\n";
}

/**
 * Get the duration of a video file in seconds using ffprobe.
 */
export function getSegmentDuration(
  videoPath: string,
  trimSec: number
): number {
  const output = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { encoding: "utf8" }
  ).trim();
  const total = parseFloat(output) || 0;
  return Math.max(0, total - trimSec);
}

/**
 * Split text into short chunks suitable for subtitles (~8-10 words each).
 * Splits on sentence boundaries first, then further splits long sentences.
 */
export function splitIntoChunks(text: string, maxWords = 10): string[] {
  // Split into sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    if (words.length <= maxWords) {
      chunks.push(words.join(" "));
    } else {
      // Split long sentence into chunks of maxWords
      for (let i = 0; i < words.length; i += maxWords) {
        const chunk = words.slice(i, i + maxWords).join(" ");
        if (chunk) chunks.push(chunk);
      }
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Build timed SRT entries from segments with narration scripts.
 *
 * Splits long narration text into short subtitle chunks (~8-10 words)
 * evenly distributed across the segment duration.
 */
export function buildSubtitleEntries(
  segments: SegmentResult[],
  segmentDurations: number[]
): SrtEntry[] {
  const entries: SrtEntry[] = [];
  let cumulativeSec = 0;
  let index = 1;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = segmentDurations[i];

    if (seg.narrationScript) {
      const chunks = splitIntoChunks(seg.narrationScript);
      const chunkDuration = duration / chunks.length;

      for (let j = 0; j < chunks.length; j++) {
        entries.push({
          index,
          startSec: cumulativeSec + j * chunkDuration,
          endSec: cumulativeSec + (j + 1) * chunkDuration,
          text: chunks[j],
        });
        index++;
      }
    }

    cumulativeSec += duration;
  }

  return entries;
}

/**
 * Build an FFmpeg subtitles filter for burning SRT into the video.
 *
 * Uses the `subtitles` filter which requires the SRT file on disk.
 * Style options map to ASS override tags via the `force_style` parameter.
 */
export function buildSubtitleFilter(
  srtPath: string,
  inputLabel: string,
  style?: SubtitlesConfig["style"]
): { filters: string; outputLabel: string } {
  const fontSize = style?.fontSize ?? 18;
  const fontColor = style?.fontColor ?? "&H00FFFFFF"; // ASS: AABBGGRR — white
  const bgColor = style?.bgColor ?? "&H80000000"; // semi-transparent black
  const position = style?.position ?? "bottom";

  // ASS alignment: 2 = bottom center, 6 = top center
  const alignment = position === "top" ? 6 : 2;
  const marginV = position === "top" ? 30 : 40;

  // Escape path for FFmpeg filter (colons and backslashes)
  const escapedPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  // Clean, modern subtitle style:
  // - Sans-serif font, small size, slight outline for legibility
  // - Semi-transparent background box (BorderStyle=4)
  // - No ugly default borders
  const forceStyle =
    `FontName=Arial,` +
    `FontSize=${fontSize},` +
    `PrimaryColour=${fontColor},` +
    `BackColour=${bgColor},` +
    `BorderStyle=4,` +
    `Outline=0,` +
    `Shadow=0,` +
    `Alignment=${alignment},` +
    `MarginV=${marginV},` +
    `MarginL=60,` +
    `MarginR=60`;

  const outputLabel = "subtitled";
  const filters = `;[${inputLabel}]subtitles='${escapedPath}':force_style='${forceStyle}'[${outputLabel}]`;

  return { filters, outputLabel };
}
