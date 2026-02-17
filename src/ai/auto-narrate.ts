/**
 * Auto-narration — uses AI vision to generate narration scripts from video frames.
 *
 * Extracts a frame from each segment's recording, sends it to GPT with the
 * segment name, and gets back a concise narration script. This runs BEFORE
 * the TTS phase so that auto-generated scripts are then synthesized normally.
 */

import { execSync } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { chatCompletion } from "./openai.js";
import type { SegmentResult } from "../segments.js";

/**
 * Extract a single JPEG frame from a video at the given timestamp.
 * Returns the frame as a base64-encoded string.
 */
export function extractFrameAsBase64(
  videoPath: string,
  timestampSec: number
): string {
  const tmpPath = resolve(
    videoPath + `.frame-${timestampSec.toFixed(1)}.jpg`
  );
  // Scale down to max 720px wide and use moderate JPEG quality to keep payload small
  execSync(
    `ffmpeg -y -ss ${timestampSec.toFixed(1)} -i "${videoPath}" -frames:v 1 -vf "scale='min(720,iw)':-1" -q:v 4 "${tmpPath}"`,
    { stdio: "pipe" }
  );
  const buf = readFileSync(tmpPath);
  unlinkSync(tmpPath);
  return buf.toString("base64");
}

/**
 * Generate a narration script for a single segment using AI vision.
 * Can receive optional context about surrounding segments for narrative flow.
 */
export async function generateNarrationScript(opts: {
  screenshot: string; // base64 JPEG
  segmentName: string;
  appName?: string;
  segmentIndex?: number;
  totalSegments?: number;
  prevSegmentName?: string;
  nextSegmentName?: string;
}): Promise<string> {
  const {
    segmentName,
    appName,
    segmentIndex = 0,
    totalSegments = 1,
    prevSegmentName,
    nextSegmentName,
  } = opts;

  const isFirst = segmentIndex === 0;
  const isLast = segmentIndex === totalSegments - 1;

  let positionHint = "";
  if (isFirst && totalSegments > 1) {
    positionHint = `This is the opening segment. The next segment will show "${nextSegmentName}".`;
  } else if (isLast && totalSegments > 1) {
    positionHint = `This is the final segment. The previous segment showed "${prevSegmentName}".`;
  } else if (totalSegments > 1) {
    positionHint = `Previous segment: "${prevSegmentName}". Next: "${nextSegmentName}".`;
  }

  const appContext = appName ? ` for ${appName}` : "";

  const result = (await chatCompletion({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You write voiceover scripts for product demo videos. ` +
          `Your tone is calm, confident, and conversational — like a founder casually walking someone through their product over coffee. ` +
          `Never say "welcome to" or "here you can see". Never list UI elements. ` +
          `Instead, focus on what the product DOES for the user and why it matters. ` +
          `Write exactly 1-2 short sentences. Be specific to what's on screen but frame it as a benefit, not a description. ` +
          `Use natural spoken language — contractions, simple words. No markdown. No emoji.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Write a voiceover script for the "${segmentName}" segment of a product demo${appContext}. ` +
              `${positionHint} ` +
              `Look at this screenshot and write 1-2 natural sentences about what matters most here.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${opts.screenshot}`,
            },
          },
        ],
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "narration_script",
        schema: {
          type: "object",
          properties: {
            script: { type: "string" },
          },
          required: ["script"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    maxTokens: 1024,
  })) as { script: string };

  return result.script;
}

export interface AutoNarrateOptions {
  segments: SegmentResult[];
  autoAll: boolean; // true if narration.auto is set at top level
  appName?: string; // extracted from baseUrl or config
}

/**
 * Auto-generate narration scripts for segments that need them.
 *
 * A segment needs auto-narration if:
 * - It has `narration.auto: true` in its config, OR
 * - The top-level `narration.auto: true` is set and the segment has no manual script
 *
 * Passes context about neighboring segments so the AI creates a coherent narrative.
 * Modifies segments in-place by setting `narrationScript`.
 */
export async function autoNarrateSegments(
  opts: AutoNarrateOptions,
  segmentConfigs: Array<{
    narration?: { auto?: boolean; script?: string };
  }>
): Promise<void> {
  const { segments, autoAll, appName } = opts;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const conf = segmentConfigs[i];

    // Already has a manual script — skip
    if (seg.narrationScript) continue;

    // Check if auto-narration is requested for this segment
    const needsAuto = conf?.narration?.auto || (autoAll && !conf?.narration?.script);
    if (!needsAuto) continue;

    console.log(`  [${seg.name}] Auto-generating narration script...`);

    // Extract a frame 2 seconds into the clean content
    const frameTimestamp = seg.trimSec + 2;
    const screenshot = extractFrameAsBase64(seg.videoPath, frameTimestamp);
    const script = await generateNarrationScript({
      screenshot,
      segmentName: seg.name,
      appName,
      segmentIndex: i,
      totalSegments: segments.length,
      prevSegmentName: i > 0 ? segments[i - 1].name : undefined,
      nextSegmentName: i < segments.length - 1 ? segments[i + 1].name : undefined,
    });

    seg.narrationScript = script;
    console.log(`    Script: "${script.slice(0, 80)}${script.length > 80 ? "..." : ""}"`);
  }
}
