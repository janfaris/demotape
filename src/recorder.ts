import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { DemotapeConfig } from "./config.js";
import { authenticate, applyAuth } from "./auth/index.js";
import { recordSegment, type SegmentResult } from "./segments.js";
import { encode } from "./ffmpeg.js";
import {
  waitForIdle,
  safeGoto,
  injectOverlayAndAnimationSuppressions,
} from "./utils.js";
import { enforceLicense } from "./license.js";
import { resolveCursorConfig } from "./cursor.js";
import {
  getSegmentDuration,
  buildSubtitleEntries,
  generateSrt,
} from "./subtitles.js";

export interface RecordOptions {
  licenseKey?: string;
}

/**
 * Main recording orchestrator.
 *
 * Phases:
 * 1. Authenticate (if configured)
 * 2. Setup (dismiss banners, set localStorage)
 * 3. Warmup (prime browser HTTP cache)
 * 4. Record (each segment as a separate video)
 * 5. Encode (FFmpeg trim + concat + overlays)
 */
export async function record(
  config: DemotapeConfig,
  options?: RecordOptions
): Promise<void> {
  enforceLicense(config, options?.licenseKey);
  const recordingDir = resolve(config.output.dir, ".recordings");
  const outputDir = resolve(config.output.dir);

  console.log("demotape recorder\n");

  // Clean and create dirs
  rmSync(recordingDir, { recursive: true, force: true });
  mkdirSync(recordingDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  // ─── 1. Authenticate ───
  let storageState: Awaited<
    ReturnType<import("playwright").BrowserContext["storageState"]>
  > | undefined;

  if (config.auth) {
    console.log(`-> Authenticating (${config.auth.provider})...`);
    const authResult = await authenticate(config.auth, config.baseUrl);

    const headless = process.env.HEADLESS !== "false";
    const browser = await chromium.launch({ headless });

    const setupContext = await browser.newContext({
      viewport: config.viewport,
      colorScheme: config.colorScheme,
    });

    // Apply auth cookies
    await applyAuth(setupContext, authResult, config.baseUrl);

    // ─── 2. Setup ───
    console.log("-> Setup phase...");
    const setupPage = await setupContext.newPage();
    await setupPage.goto(config.baseUrl, { waitUntil: "domcontentloaded" });

    // Set user-defined localStorage keys
    if (config.setup?.localStorage) {
      await setupPage.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, value);
        }
      }, config.setup.localStorage);
    }

    if (config.setup?.waitAfterSetup) {
      await setupPage.waitForTimeout(config.setup.waitAfterSetup);
    }

    // Verify auth by navigating to first segment path
    const firstPath = config.segments[0].path;
    await safeGoto(setupPage, `${config.baseUrl}${firstPath}`);
    console.log("  Auth verified");

    storageState = await setupContext.storageState();
    await setupContext.close();
    await browser.close();
  } else {
    // No auth — still run setup if configured
    if (config.setup?.localStorage) {
      const headless = process.env.HEADLESS !== "false";
      const browser = await chromium.launch({ headless });
      const setupContext = await browser.newContext({
        viewport: config.viewport,
        colorScheme: config.colorScheme,
      });
      const setupPage = await setupContext.newPage();
      await setupPage.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
      await setupPage.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, value);
        }
      }, config.setup.localStorage);

      if (config.setup.waitAfterSetup) {
        await setupPage.waitForTimeout(config.setup.waitAfterSetup);
      }

      storageState = await setupContext.storageState();
      await setupContext.close();
      await browser.close();
    }
  }

  // ─── 3. Recording context ───
  console.log("-> Creating recording context...");
  const headless = process.env.HEADLESS !== "false";
  const browser = await chromium.launch({ headless });

  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    viewport: config.viewport,
    colorScheme: config.colorScheme,
    recordVideo: { dir: recordingDir, size: config.viewport },
    reducedMotion: "reduce",
  };

  if (storageState) {
    contextOptions.storageState = storageState;
  }

  const context = await browser.newContext(contextOptions);

  // Inject overlay hiding + animation suppression
  await injectOverlayAndAnimationSuppressions(context, {
    removeDevOverlays: config.removeDevOverlays,
    suppressAnimations: config.suppressAnimations,
  });

  // ─── 4. Warmup: prime browser HTTP cache ───
  console.log("-> Warming caches...");
  const warmupPage = await context.newPage();

  for (const segment of config.segments) {
    const url = `${config.baseUrl}${segment.path}`;
    await safeGoto(warmupPage, url);
    if (segment.waitFor) {
      await warmupPage
        .waitForSelector(segment.waitFor, { timeout: 10000 })
        .catch(() => {});
    }
    await waitForIdle(warmupPage, 3000);
    await warmupPage.waitForTimeout(2000);
  }

  await warmupPage.close();
  console.log("  Caches warmed\n");

  // ─── 5. Record segments ───
  console.log("-> Recording segments...\n");
  const segments: SegmentResult[] = [];

  // Resolve visual readiness options
  const visualReadiness = config.visualReadiness === true
    ? {}
    : config.visualReadiness === false
      ? undefined
      : config.visualReadiness;

  // Resolve cursor config
  const cursorConfig = resolveCursorConfig(config.cursor);

  // When using Remotion with cursor, capture metadata instead of DOM injection
  const useMetadataCapture =
    config.renderer === "remotion" &&
    cursorConfig !== undefined &&
    cursorConfig.style === "arrow";

  for (let i = 0; i < config.segments.length; i++) {
    const segment = config.segments[i];
    const result = await recordSegment(context, segment, config.baseUrl, {
      removeOverlays: config.removeDevOverlays,
      fps: config.output.fps,
      visualReadiness,
      cursor: cursorConfig,
      captureMetadata: useMetadataCapture,
      segmentIndex: i,
    });
    segments.push(result);
  }

  await context.close();
  await browser.close();

  if (segments.length === 0) {
    throw new Error("No segments were recorded");
  }

  // ─── 5.5. Auto-narration (generate scripts from video frames) ───
  const needsAutoNarration =
    config.narration?.auto ||
    config.segments.some((s) => s.narration?.auto);

  if (needsAutoNarration) {
    console.log("\n-> Auto-generating narration scripts...\n");
    const { autoNarrateSegments } = await import("./ai/auto-narrate.js");
    // Extract app name from baseUrl for context
    let appName: string | undefined;
    try {
      appName = new URL(config.baseUrl).hostname.replace(/^www\./, "");
    } catch {}
    await autoNarrateSegments(
      { segments, autoAll: !!config.narration?.auto, appName },
      config.segments
    );
  }

  // ─── 6. Narration TTS (if any segment has a script) ───
  let audioPath: string | undefined;
  const hasNarration =
    config.narration || segments.some((s) => s.narrationScript);

  if (hasNarration) {
    console.log("\n-> Generating narration...\n");
    const { generateNarration } = await import("./ai/narration.js");
    const narrationResult = await generateNarration({
      segments,
      narrationConfig: config.narration,
      outputDir: recordingDir,
    });
    audioPath = narrationResult.concatenatedPath;
  }

  // ─── 6.5. Compute segment durations (needed for subtitles + transitions) ───
  const segmentDurations = segments.map((s) =>
    getSegmentDuration(s.videoPath, s.trimSec)
  );

  // ─── 6.6. Subtitles ───
  let subtitlesSrtPath: string | undefined;

  if (config.subtitles) {
    const entries = buildSubtitleEntries(segments, segmentDurations);
    if (entries.length > 0) {
      const srtContent = generateSrt(entries);
      subtitlesSrtPath = resolve(outputDir, `${config.output.name}.srt`);
      writeFileSync(subtitlesSrtPath, srtContent);
      console.log(`\n-> Subtitles: ${entries.length} entries -> ${subtitlesSrtPath}`);
    }
  }

  // ─── 7. Encode: FFmpeg (default) or Remotion (premium) ───
  let results: { files: Array<{ path: string; format: string; sizeMB: string }> };

  if (config.renderer === "remotion") {
    console.log("\n-> Rendering with Remotion...\n");
    const { renderWithRemotion } = await import("./remotion-renderer.js");
    results = await renderWithRemotion({
      segments,
      segmentDurations,
      output: config.output,
      viewport: config.viewport,
      theme: config.theme,
      transitions: config.transitions,
      overlays: config.overlays,
      audioPath,
      cursorConfig: useMetadataCapture ? cursorConfig : undefined,
      intro: config.intro,
      outro: config.outro,
    });
  } else {
    console.log("\n-> Encoding with FFmpeg...\n");

    // Collect per-segment transition configs
    const perSegmentTransitions = config.segments.map((s) => s.transition);
    const hasTransitions =
      config.transitions || perSegmentTransitions.some((t) => t !== undefined);

    results = encode({
      segments,
      output: config.output,
      viewport: config.viewport,
      overlays: config.overlays,
      audioPath,
      transitions: config.transitions,
      perSegmentTransitions: hasTransitions ? perSegmentTransitions : undefined,
      segmentDurations,
      subtitlesSrtPath,
      subtitlesConfig: config.subtitles,
      theme: config.theme,
    });
  }

  // ─── 8. Report ───
  console.log("\nDone!");
  for (const file of results.files) {
    console.log(`   ${file.format.toUpperCase()}: ${file.path} (${file.sizeMB} MB)`);
  }
  console.log(`   Segments: ${segments.length}`);

  const largeFile = results.files.find((f) => parseFloat(f.sizeMB) > 4);
  if (largeFile) {
    console.log(
      "\n   File > 4MB — consider increasing CRF by 2-3 in your config"
    );
  }
}
