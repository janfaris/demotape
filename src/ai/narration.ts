/**
 * AI narration — generates TTS audio for each segment and concatenates them.
 *
 * Uses OpenAI gpt-4o-mini-tts for speech synthesis.
 * Segments without scripts get silence matching their video duration.
 * All audio is concatenated via FFmpeg concat demuxer.
 */

import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import { textToSpeech, type TTSVoice } from "./openai.js";
import type { SegmentResult } from "../segments.js";

export interface NarrationConfig {
  voice?: TTSVoice;
  speed?: number;
  model?: string;
  instructions?: string;
}

export interface NarrationOptions {
  segments: SegmentResult[];
  narrationConfig?: NarrationConfig;
  outputDir: string;
}

export interface NarrationResult {
  audioPaths: string[];
  concatenatedPath: string;
}

/**
 * Get video duration in seconds using ffprobe.
 */
function getVideoDuration(videoPath: string): number {
  const output = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { encoding: "utf8" }
  ).trim();
  return parseFloat(output) || 0;
}

/**
 * Generate a silent audio file of a given duration.
 */
function generateSilence(outputPath: string, durationSec: number): void {
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${durationSec.toFixed(2)} -c:a libmp3lame -q:a 9 "${outputPath}"`,
    { stdio: "pipe" }
  );
}

/**
 * Split text into chunks that fit within the TTS input limit.
 * gpt-4o-mini-tts has a 2000 token limit — we conservatively chunk at ~1500 chars.
 */
function splitScript(text: string, maxChars: number = 1500): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Generate narration audio for all segments.
 *
 * Segments with scripts get TTS audio. Segments without scripts get silence
 * matching their video duration. All are concatenated into a single audio file.
 */
export async function generateNarration(
  options: NarrationOptions
): Promise<NarrationResult> {
  const { segments, narrationConfig, outputDir } = options;
  const audioPaths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const audioPath = resolve(outputDir, `narration-${i}.mp3`);

    if (segment.narrationScript) {
      console.log(`  [${segment.name}] Generating TTS...`);

      const chunks = splitScript(segment.narrationScript);
      const audioBuffers: Buffer[] = [];

      for (const chunk of chunks) {
        const buffer = await textToSpeech({
          input: chunk,
          voice: narrationConfig?.voice ?? "coral",
          speed: narrationConfig?.speed ?? 1.0,
          model: narrationConfig?.model ?? "gpt-4o-mini-tts",
          instructions: narrationConfig?.instructions,
          responseFormat: "mp3",
        });
        audioBuffers.push(buffer);
      }

      if (audioBuffers.length === 1) {
        writeFileSync(audioPath, audioBuffers[0]);
      } else {
        // Concatenate chunks via FFmpeg
        const chunkPaths: string[] = [];
        for (let j = 0; j < audioBuffers.length; j++) {
          const chunkPath = resolve(outputDir, `narration-${i}-chunk-${j}.mp3`);
          writeFileSync(chunkPath, audioBuffers[j]);
          chunkPaths.push(chunkPath);
        }

        const concatList = resolve(outputDir, `narration-${i}-chunks.txt`);
        writeFileSync(
          concatList,
          chunkPaths.map((p) => `file '${p}'`).join("\n")
        );
        execSync(
          `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${audioPath}"`,
          { stdio: "pipe" }
        );

        // Clean up chunk files
        for (const p of chunkPaths) unlinkSync(p);
        unlinkSync(concatList);
      }
    } else {
      // Generate silence matching video duration
      const trimmedDuration =
        getVideoDuration(segment.videoPath) - segment.trimSec;
      const duration = Math.max(0.5, trimmedDuration);
      console.log(
        `  [${segment.name}] No script — generating ${duration.toFixed(1)}s silence`
      );
      generateSilence(audioPath, duration);
    }

    audioPaths.push(audioPath);
  }

  // Concatenate all segment audio into one file
  const concatenatedPath = resolve(outputDir, "narration-full.mp3");
  const concatList = resolve(outputDir, "narration-concat.txt");
  writeFileSync(
    concatList,
    audioPaths.map((p) => `file '${p}'`).join("\n")
  );
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${concatenatedPath}"`,
    { stdio: "pipe" }
  );
  unlinkSync(concatList);

  console.log(`  Narration: ${audioPaths.length} segments concatenated\n`);

  return { audioPaths, concatenatedPath };
}
