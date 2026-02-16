import { execSync } from "child_process";
import { readFileSync } from "fs";
import type { OutputConfig, OverlayConfig } from "./config.js";
import type { SegmentResult } from "./segments.js";
import { buildOverlayFilters } from "./overlays.js";

interface EncodeOptions {
  segments: SegmentResult[];
  output: OutputConfig;
  viewport: { width: number; height: number };
  overlays?: OverlayConfig;
}

interface EncodeResult {
  files: Array<{ path: string; format: string; sizeMB: string }>;
}

/**
 * Trim, concatenate, and encode all segments into the final video(s).
 *
 * Pipeline:
 * 1. Trim loading frames from each segment via -ss
 * 2. Concatenate all segments
 * 3. Scale to output size, set FPS, convert pixel format
 * 4. Apply text overlays if configured
 * 5. Encode to MP4 and/or WebM
 */
export function encode(opts: EncodeOptions): EncodeResult {
  const { segments, output, viewport, overlays } = opts;
  const outputSize = output.size ?? viewport;
  const fps = output.fps;
  const crf = output.crf;
  const dir = output.dir;
  const name = output.name;

  // Build FFmpeg input args with trim offsets
  const inputArgs = segments
    .map((s) => `-ss ${s.trimSec.toFixed(1)} -i "${s.videoPath}"`)
    .join(" ");

  // Build concat filter
  const filterStreams = segments.map((_, i) => `[${i}:v]`).join("");
  const concatAndScale =
    `${filterStreams}concat=n=${segments.length}:v=1[mid]` +
    `;[mid]fps=${fps},scale=${outputSize.width}:${outputSize.height},format=yuv420p[scaled]`;

  // Build overlay filters
  const { filters: overlayFilters } = buildOverlayFilters(overlays, "scaled");
  const filterComplex = concatAndScale + overlayFilters;

  const results: EncodeResult = { files: [] };

  // MP4 (H.264) — Safari, universal
  if (output.format === "mp4" || output.format === "both") {
    const mp4Out = `${dir}/${name}.mp4`;
    console.log("  -> H.264 MP4...");
    execSync(
      `ffmpeg -y ${inputArgs} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[outv]" -c:v libx264 -preset slow -crf ${crf} -profile:v high -movflags +faststart -an "${mp4Out}"`,
      { stdio: "inherit" }
    );
    const sizeMB = (readFileSync(mp4Out).length / 1024 / 1024).toFixed(2);
    results.files.push({ path: mp4Out, format: "mp4", sizeMB });
  }

  // WebM (VP9) — Chrome/Firefox
  if (output.format === "webm" || output.format === "both") {
    const webmOut = `${dir}/${name}.webm`;
    console.log("  -> VP9 WebM...");
    execSync(
      `ffmpeg -y ${inputArgs} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[outv]" -c:v libvpx-vp9 -crf ${Math.round(crf * 1.18)} -b:v 1200k -an "${webmOut}"`,
      { stdio: "inherit" }
    );
    const sizeMB = (readFileSync(webmOut).length / 1024 / 1024).toFixed(2);
    results.files.push({ path: webmOut, format: "webm", sizeMB });
  }

  return results;
}
