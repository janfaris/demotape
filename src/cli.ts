import { Command } from "commander";
import { resolve } from "path";
import { writeFileSync, existsSync } from "fs";
import { loadConfig } from "./config.js";
import { record } from "./recorder.js";
import { enforceLicense, detectProFeatures, validateLicenseKey } from "./license.js";

const PRESETS: Record<string, object> = {
  "landing-page": {
    baseUrl: "http://localhost:3000",
    viewport: { width: 1280, height: 800 },
    output: { format: "mp4", name: "demo" },
    colorScheme: "dark",
    segments: [
      {
        name: "Home",
        path: "/",
        waitFor: "h1",
        settleMs: 1500,
        dwellMs: 3000,
      },
      {
        name: "Dashboard",
        path: "/dashboard",
        waitFor: "main",
        settleMs: 2000,
        scroll: { distance: 400, duration: 2500 },
        dwellMs: 1500,
      },
    ],
  },
  "instagram-story": {
    baseUrl: "http://localhost:3000",
    viewport: { width: 540, height: 960 },
    output: {
      size: { width: 1080, height: 1920 },
      format: "mp4",
      name: "story",
    },
    overlays: {
      top: { text: "Your App Name", height: 120 },
      bottom: { text: "Try it free", height: 100 },
    },
    segments: [
      {
        name: "Feature Page",
        path: "/features",
        waitFor: "h1",
        settleMs: 2000,
        scroll: { distance: 800, duration: 5000 },
        dwellMs: 2000,
      },
    ],
  },
  "product-hunt": {
    baseUrl: "http://localhost:3000",
    viewport: { width: 1920, height: 1080 },
    output: { format: "mp4", name: "product-hunt-demo" },
    segments: [
      {
        name: "Hero",
        path: "/",
        waitFor: "h1",
        settleMs: 2000,
        dwellMs: 4000,
      },
    ],
  },
};

export function createCLI(): Command {
  const program = new Command();

  program
    .name("demotape")
    .description("Record polished demo videos of your web app from a JSON config")
    .version("0.4.0");

  // ─── record ───
  program
    .command("record")
    .description("Record a demo video using a config file")
    .requiredOption("-c, --config <path>", "Path to the JSON config file")
    .option("--format <format>", "Output format override (mp4, webm, both)")
    .option("--output <dir>", "Output directory override")
    .option("--license <key>", "Pro license key (or set DEMOTAPE_LICENSE_KEY)")
    .option("--renderer <engine>", "Rendering engine: ffmpeg (default) or remotion (Pro)")
    .action(async (opts) => {
      try {
        const config = loadConfig(opts.config);

        // Apply CLI overrides
        if (opts.format) {
          config.output.format = opts.format;
        }
        if (opts.output) {
          config.output.dir = opts.output;
        }
        if (opts.renderer) {
          config.renderer = opts.renderer;
        }

        enforceLicense(config, opts.license);
        await record(config, { licenseKey: opts.license });
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    });

  // ─── init ───
  program
    .command("init")
    .description("Generate a starter config file")
    .option("-p, --preset <name>", "Preset to use (landing-page, instagram-story, product-hunt)", "landing-page")
    .option("-o, --output <path>", "Output file path", "demotape.json")
    .action((opts) => {
      const preset = PRESETS[opts.preset];
      if (!preset) {
        console.error(
          `Unknown preset: ${opts.preset}\nAvailable: ${Object.keys(PRESETS).join(", ")}`
        );
        process.exit(1);
      }

      const outputPath = resolve(opts.output);
      if (existsSync(outputPath)) {
        console.error(`File already exists: ${outputPath}`);
        process.exit(1);
      }

      writeFileSync(outputPath, JSON.stringify(preset, null, 2) + "\n");
      console.log(`Created ${outputPath}`);
      console.log(`\nNext steps:`);
      console.log(`  1. Edit ${opts.output} with your app's URL and pages`);
      console.log(`  2. Run: demotape record --config ${opts.output}`);
    });

  // ─── generate ───
  program
    .command("generate")
    .description("Generate a config by analyzing a live URL with AI (Pro)")
    .requiredOption("-u, --url <url>", "URL to analyze")
    .option("-d, --describe <text>", "Describe the app for better results")
    .option("-o, --output <path>", "Output file path", "demotape.json")
    .option("--license <key>", "Pro license key (or set DEMOTAPE_LICENSE_KEY)")
    .action(async (opts) => {
      try {
        // License check — generate is always Pro
        const key = opts.license || process.env.DEMOTAPE_LICENSE_KEY;
        if (!key || !validateLicenseKey(key)) {
          console.error(
            "Error: demotape generate requires a Pro license key.\n\n" +
              "  Get a key at https://demotape.dev/pro\n\n" +
              "  export DEMOTAPE_LICENSE_KEY=DMTP-PRO-xxxx-xxxx\n" +
              "  Or: demotape generate --url <url> --license DMTP-PRO-xxxx-xxxx"
          );
          process.exit(1);
        }

        const outputPath = resolve(opts.output);
        if (existsSync(outputPath)) {
          console.error(`File already exists: ${outputPath}\nUse a different --output path or remove the existing file.`);
          process.exit(1);
        }

        const { generateConfig } = await import("./ai/generate.js");
        const config = await generateConfig({
          url: opts.url,
          describe: opts.describe,
        });

        writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n");
        console.log(`\nConfig written to ${outputPath}`);
        console.log(`\nNext steps:`);
        console.log(`  1. Review and tweak ${opts.output}`);
        console.log(`  2. Run: demotape record --config ${opts.output}`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    });

  // ─── validate ───
  program
    .command("validate")
    .description("Validate a config file without recording")
    .requiredOption("-c, --config <path>", "Path to the JSON config file")
    .option("--license <key>", "Pro license key to validate")
    .action((opts) => {
      try {
        const config = loadConfig(opts.config);
        console.log("Config is valid!");
        console.log(`  Base URL: ${config.baseUrl}`);
        console.log(`  Viewport: ${config.viewport.width}x${config.viewport.height}`);
        console.log(`  Segments: ${config.segments.length}`);
        config.segments.forEach((s, i) => {
          console.log(`    ${i + 1}. ${s.name} (${s.path})`);
        });
        console.log(`  Output: ${config.output.format} -> ${config.output.dir}/${config.output.name}`);
        if (config.auth) {
          console.log(`  Auth: ${config.auth.provider}`);
        }
        if (config.overlays) {
          if (config.overlays.top) console.log(`  Top overlay: "${config.overlays.top.text}"`);
          if (config.overlays.bottom) console.log(`  Bottom overlay: "${config.overlays.bottom.text}"`);
        }
        if (config.subtitles) {
          console.log(`  Subtitles: enabled${config.subtitles.burn ? " (burn-in)" : " (SRT file)"}`);
        }
        if (config.transitions) {
          console.log(`  Transitions: ${config.transitions.type} (${config.transitions.duration}s)`);
        }
        if (config.cursor) {
          console.log(`  Cursor: animated`);
        }

        // Pro feature detection
        const proFeatures = detectProFeatures(config);
        if (proFeatures.length > 0) {
          console.log(`\n  Pro features detected:`);
          proFeatures.forEach((f) => console.log(`    - ${f}`));

          if (opts.license) {
            const valid = validateLicenseKey(opts.license);
            console.log(`\n  License key: ${valid ? "valid" : "INVALID"}`);
          } else {
            console.log(`\n  A Pro license key is required to record this config.`);
            console.log(`  Get one at https://demotape.dev/pro`);
          }
        }
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : String(err)
        );
        process.exit(1);
      }
    });

  // ─── presets ───
  program
    .command("presets")
    .description("List available config presets")
    .action(() => {
      console.log("Available presets:\n");
      console.log("  landing-page      Landscape 1280x800, MP4+WebM, dark theme");
      console.log("  instagram-story   Vertical 1080x1920 with text overlays");
      console.log("  product-hunt      16:9 landscape 1920x1080, clean");
      console.log("\nUsage: demotape init --preset <name>");
    });

  return program;
}
