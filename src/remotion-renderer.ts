/**
 * Remotion renderer — optional premium rendering engine.
 *
 * Replaces the FFmpeg filter chain pipeline with Remotion's React-based
 * compositing for richer visuals: spring transitions, CSS themes,
 * animated captions, and programmatic motion graphics.
 *
 * Pipeline:
 * 1. bundle() — Webpack-bundle the Remotion composition (cached)
 * 2. selectComposition() — resolve dynamic metadata (duration, fps)
 * 3. renderMedia() — render frames in headless Chrome + encode
 */
import { resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import type { SegmentResult } from "./segments.js";
import type {
  OutputConfig,
  TransitionConfig,
  OverlayConfig,
  ThemeConfig,
} from "./config.js";
import { resolveTheme } from "./theme.js";
import type { DemotapeVideoProps, ThemeInput } from "./remotion/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RemotionRenderOptions {
  segments: SegmentResult[];
  segmentDurations: number[];
  output: OutputConfig;
  viewport: { width: number; height: number };
  theme?: ThemeConfig;
  transitions?: TransitionConfig;
  overlays?: OverlayConfig;
  audioPath?: string;
}

interface RemotionRenderResult {
  files: Array<{ path: string; format: string; sizeMB: string }>;
}

let cachedBundleLocation: string | null = null;

/**
 * Render the final video using Remotion instead of FFmpeg.
 */
export async function renderWithRemotion(
  opts: RemotionRenderOptions
): Promise<RemotionRenderResult> {
  // Dynamic imports — these are heavy and only loaded for Remotion renderer
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import(
    "@remotion/renderer"
  );

  const {
    segments,
    segmentDurations,
    output,
    viewport,
    theme,
    transitions,
    audioPath,
  } = opts;

  const outputSize = output.size ?? viewport;

  // ─── 1. Prepare public directory with video + audio files ───
  // Remotion needs video files accessible via staticFile().
  // We copy them into a temp public dir.
  const publicDir = resolve(output.dir, ".remotion-public");
  // Clean stale files from previous renders
  if (existsSync(publicDir)) {
    rmSync(publicDir, { recursive: true });
  }
  mkdirSync(publicDir, { recursive: true });
  // Invalidate cached bundle since public dir changed
  cachedBundleLocation = null;

  const segmentInputs = segments.map((seg, i) => {
    const fileName = `segment-${i}${seg.videoPath.endsWith(".webm") ? ".webm" : ".mp4"}`;
    const destPath = resolve(publicDir, fileName);
    copyFileSync(seg.videoPath, destPath);
    return {
      fileName,
      trimSec: seg.trimSec,
      durationSec: segmentDurations[i],
      name: seg.name,
    };
  });

  let audioFileName: string | undefined;
  if (audioPath) {
    audioFileName = `narration${audioPath.endsWith(".mp3") ? ".mp3" : ".wav"}`;
    copyFileSync(audioPath, resolve(publicDir, audioFileName));
  }

  // ─── 2. Resolve theme to Remotion format ───
  const resolvedTheme = resolveTheme(theme);
  let themeInput: ThemeInput | undefined;
  if (resolvedTheme) {
    themeInput = {
      background: resolvedTheme.background,
      padding: resolvedTheme.padding,
      radius: resolvedTheme.radius,
      shadow: resolvedTheme.shadow,
      windowChrome: resolvedTheme.windowChrome,
    };
  }

  // ─── 3. Bundle the Remotion project (cached across renders) ───
  if (!cachedBundleLocation) {
    console.log("  -> Bundling Remotion composition...");
    const entryPoint = resolve(__dirname, "remotion", "entry.js");
    cachedBundleLocation = await bundle({
      entryPoint,
      publicDir,
    });
    console.log("  -> Bundle ready");
  }

  // ─── 4. Build input props ───
  const inputProps: DemotapeVideoProps & Record<string, unknown> = {
    segments: segmentInputs,
    theme: themeInput,
    transition: transitions
      ? { type: transitions.type, durationSec: transitions.duration }
      : undefined,
    audioFileName,
    width: outputSize.width,
    height: outputSize.height,
    fps: output.fps,
  };

  // ─── 5. Select composition (resolves dynamic duration) ───
  const composition = await selectComposition({
    serveUrl: cachedBundleLocation,
    id: "DemotapeVideo",
    inputProps,
  });

  console.log(
    `  -> Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps (${outputSize.width}x${outputSize.height})...`
  );

  // ─── 6. Render ───
  const results: RemotionRenderResult = { files: [] };

  const renderFormat = async (
    codec: "h264" | "vp8",
    ext: string,
    format: string
  ) => {
    const outputPath = resolve(output.dir, `${output.name}.${ext}`);
    await renderMedia({
      composition,
      serveUrl: cachedBundleLocation!,
      codec,
      outputLocation: outputPath,
      inputProps,
      crf: output.crf,
      onProgress: ({ progress }) => {
        process.stdout.write(
          `\r  ${format.toUpperCase()}: ${(progress * 100).toFixed(0)}%  `
        );
      },
    });
    console.log(""); // newline after progress

    const sizeMB = (readFileSync(outputPath).length / 1024 / 1024).toFixed(2);
    results.files.push({ path: outputPath, format, sizeMB });
  };

  if (output.format === "mp4" || output.format === "both") {
    await renderFormat("h264", "mp4", "mp4");
  }
  if (output.format === "webm" || output.format === "both") {
    await renderFormat("vp8", "webm", "webm");
  }

  return results;
}
