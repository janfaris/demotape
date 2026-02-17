import { execSync } from "child_process";
import { readFileSync } from "fs";
import type { OutputConfig, OverlayConfig, TransitionConfig } from "./config.js";
import type { SegmentResult } from "./segments.js";
import { buildOverlayFilters } from "./overlays.js";
import { buildTransitionFilter } from "./transitions.js";
import { buildSubtitleFilter, type SrtEntry } from "./subtitles.js";
import type { SubtitlesConfig } from "./config.js";

interface EncodeOptions {
  segments: SegmentResult[];
  output: OutputConfig;
  viewport: { width: number; height: number };
  overlays?: OverlayConfig;
  audioPath?: string;
  transitions?: TransitionConfig;
  perSegmentTransitions?: Array<TransitionConfig | undefined>;
  segmentDurations?: number[];
  subtitlesSrtPath?: string;
  subtitlesConfig?: SubtitlesConfig;
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
  const {
    segments,
    output,
    viewport,
    overlays,
    audioPath,
    transitions,
    perSegmentTransitions,
    segmentDurations,
    subtitlesSrtPath,
    subtitlesConfig,
  } = opts;
  const outputSize = output.size ?? viewport;
  const fps = output.fps;
  const crf = output.crf;
  const dir = output.dir;
  const name = output.name;

  // Build FFmpeg input args with trim offsets
  const inputArgs = segments
    .map((s) => `-ss ${s.trimSec.toFixed(1)} -i "${s.videoPath}"`)
    .join(" ");

  // Audio input (added after video inputs)
  const audioInputArg = audioPath ? ` -i "${audioPath}"` : "";
  const audioInputIndex = audioPath ? segments.length : -1;

  // Build the video filter chain: transitions/concat → scale → subtitles → overlays

  // Step 1: Concat or transitions → [mid]
  let concatOrTransition: string;

  const transitionFilter =
    segmentDurations && (transitions || perSegmentTransitions)
      ? buildTransitionFilter({
          segmentCount: segments.length,
          segmentDurations,
          globalTransition: transitions,
          perSegmentTransitions,
        })
      : undefined;

  if (transitionFilter) {
    concatOrTransition = transitionFilter;
  } else {
    const filterStreams = segments.map((_, i) => `[${i}:v]`).join("");
    concatOrTransition = `${filterStreams}concat=n=${segments.length}:v=1[mid]`;
  }

  // Step 2: Scale → [scaled]
  const scaleFilter = `;[mid]fps=${fps},scale=${outputSize.width}:${outputSize.height},format=yuv420p[scaled]`;

  // Step 3: Subtitles → [subtitled] (optional)
  let subtitleFilter = "";
  let postScaleLabel = "scaled";

  if (subtitlesSrtPath && subtitlesConfig?.burn) {
    const sub = buildSubtitleFilter(
      subtitlesSrtPath,
      postScaleLabel,
      subtitlesConfig.style
    );
    subtitleFilter = sub.filters;
    postScaleLabel = sub.outputLabel;
  }

  // Step 4: Overlays → [outv]
  const { filters: overlayFilters } = buildOverlayFilters(
    overlays,
    postScaleLabel
  );

  const filterComplex =
    concatOrTransition + scaleFilter + subtitleFilter + overlayFilters;

  const results: EncodeResult = { files: [] };

  // Audio mapping flags
  const mp4AudioFlags = audioPath
    ? `-map ${audioInputIndex}:a -c:a aac -b:a 128k -shortest`
    : "-an";
  const webmAudioFlags = audioPath
    ? `-map ${audioInputIndex}:a -c:a libopus -b:a 96k -shortest`
    : "-an";

  // MP4 (H.264) — Safari, universal
  if (output.format === "mp4" || output.format === "both") {
    const mp4Out = `${dir}/${name}.mp4`;
    console.log("  -> H.264 MP4...");
    execSync(
      `ffmpeg -y ${inputArgs}${audioInputArg} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[outv]" ${mp4AudioFlags} -c:v libx264 -preset slow -crf ${crf} -profile:v high -movflags +faststart "${mp4Out}"`,
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
      `ffmpeg -y ${inputArgs}${audioInputArg} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[outv]" ${webmAudioFlags} -c:v libvpx-vp9 -crf ${Math.round(crf * 1.18)} -b:v 1200k "${webmOut}"`,
      { stdio: "inherit" }
    );
    const sizeMB = (readFileSync(webmOut).length / 1024 / 1024).toFixed(2);
    results.files.push({ path: webmOut, format: "webm", sizeMB });
  }

  return results;
}
