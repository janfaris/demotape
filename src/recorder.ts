import { chromium } from "playwright";
import { mkdirSync, rmSync } from "fs";
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
export async function record(config: DemotapeConfig): Promise<void> {
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

  for (const segment of config.segments) {
    const result = await recordSegment(context, segment, config.baseUrl, {
      removeOverlays: config.removeDevOverlays,
      fps: config.output.fps,
    });
    segments.push(result);
  }

  await context.close();
  await browser.close();

  if (segments.length === 0) {
    throw new Error("No segments were recorded");
  }

  // ─── 6. FFmpeg: trim + concat + encode ───
  console.log("\n-> Encoding with FFmpeg...\n");

  const results = encode({
    segments,
    output: config.output,
    viewport: config.viewport,
    overlays: config.overlays,
  });

  // ─── 7. Report ───
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
