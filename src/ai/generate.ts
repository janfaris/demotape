/**
 * AI-powered config generation.
 *
 * Visits a live URL with headless Playwright, extracts page structure
 * (nav links, headings), takes screenshots, and sends them to GPT-4o-mini
 * to generate a demotape config.
 */

import { DemotapeConfigSchema, type DemotapeConfig } from "../config.js";
import { chatCompletion } from "./openai.js";

export interface GenerateOptions {
  /** URL to analyze */
  url: string;
  /** Optional description of the app for better config generation */
  describe?: string;
  /** Viewport size (default: 1280x800) */
  viewport?: { width: number; height: number };
}

interface PageInfo {
  url: string;
  path: string;
  title: string;
  headings: string[];
  screenshot: string; // base64
}

const CONFIG_SCHEMA_DESCRIPTION = `Generate a demotape JSON config for recording a demo video. The config should follow this schema:
{
  "baseUrl": "<origin URL, e.g. https://example.com>",
  "viewport": { "width": 1280, "height": 800 },
  "output": { "format": "mp4", "name": "demo" },
  "colorScheme": "dark" or "light" (pick based on the site),
  "segments": [
    {
      "name": "<human-readable name for this page>",
      "path": "<URL path, e.g. / or /features>",
      "waitFor": "<CSS selector for main content, e.g. h1, main, .hero>",
      "settleMs": 1500,
      "scroll": { "distance": <pixels to scroll>, "duration": 2500 },
      "dwellMs": 2000
    }
  ]
}

Rules:
- Include 2-5 segments showing the most interesting/demo-worthy pages
- Set waitFor to a selector that indicates the page has loaded
- Add scroll for pages with below-the-fold content
- Set reasonable settleMs (1000-2000) and dwellMs (1500-3000)
- Use the actual paths from the site navigation
- Pick colorScheme based on the site's default appearance
- Output ONLY the JSON config object, nothing else`;

/**
 * Generate a demotape config by analyzing a live URL with AI.
 */
export async function generateConfig(
  options: GenerateOptions
): Promise<DemotapeConfig> {
  const { url, describe, viewport = { width: 1280, height: 800 } } = options;

  // Dynamic import to avoid loading Playwright for other commands
  const { chromium } = await import("playwright");

  console.log(`-> Analyzing ${url}...\n`);

  const browser = await chromium.launch({ headless: true });
  // Use a smaller viewport for screenshots sent to AI (reduces token usage)
  const analysisViewport = { width: 640, height: 400 };
  const context = await browser.newContext({
    viewport: analysisViewport,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // Visit the main URL
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(
    () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
  );
  await page.waitForTimeout(2000);

  // Extract navigation links and page structure
  const pageData = await page.evaluate((baseOrigin: string) => {
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((href) => {
        try {
          const u = new URL(href);
          return u.origin === baseOrigin && u.pathname !== "/";
        } catch {
          return false;
        }
      })
      .map((href) => new URL(href).pathname);

    const uniqueLinks = [...new Set(links)].slice(0, 10);

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 10)
      .map((el) => el.textContent?.trim() || "");

    return { links: uniqueLinks, headings };
  }, new URL(url).origin);

  // Take screenshot of main page (JPEG for smaller payload)
  const mainScreenshot = await page.screenshot({ type: "jpeg", quality: 60 });
  const mainB64 = mainScreenshot.toString("base64");

  const pages: PageInfo[] = [
    {
      url,
      path: new URL(url).pathname || "/",
      title: await page.title(),
      headings: pageData.headings,
      screenshot: mainB64,
    },
  ];

  // Visit up to 3 internal pages (keep payload small for API limits)
  const linksToVisit = pageData.links.slice(0, 3);
  for (const linkPath of linksToVisit) {
    try {
      const fullUrl = `${new URL(url).origin}${linkPath}`;
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 15000 }).catch(
        () => page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
      );
      await page.waitForTimeout(1500);

      const headings = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1, h2, h3"))
          .slice(0, 5)
          .map((el) => el.textContent?.trim() || "")
      );

      const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });

      pages.push({
        url: fullUrl,
        path: linkPath,
        title: await page.title(),
        headings,
        screenshot: screenshot.toString("base64"),
      });
    } catch {
      // Skip pages that fail to load
    }
  }

  await browser.close();

  console.log(`  Analyzed ${pages.length} page(s)\n`);

  // Build messages for AI
  const userContent: Array<{ type: string; [key: string]: unknown }> = [];

  let textPrompt = `Analyze these ${pages.length} pages and generate a demotape config:\n\n`;

  for (const p of pages) {
    textPrompt += `Page: ${p.path}\n  Title: ${p.title}\n  Headings: ${p.headings.join(", ")}\n\n`;
  }

  if (describe) {
    textPrompt += `\nApp description: ${describe}\n`;
  }

  textPrompt += `\nAvailable internal paths: ${["/", ...pageData.links].join(", ")}`;

  userContent.push({ type: "text", text: textPrompt });

  // Add screenshots as images
  for (const p of pages) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${p.screenshot}` },
    });
  }

  console.log("-> Generating config with AI...\n");

  const result = await chatCompletion({
    messages: [
      { role: "system", content: CONFIG_SCHEMA_DESCRIPTION },
      { role: "user", content: userContent },
    ],
    model: "gpt-5-nano",
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "demotape_config",
        schema: {
          type: "object",
          properties: {
            baseUrl: { type: "string" },
            viewport: {
              type: "object",
              properties: {
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["width", "height"],
              additionalProperties: false,
            },
            output: {
              type: "object",
              properties: {
                format: { type: "string", enum: ["mp4", "webm", "both"] },
                name: { type: "string" },
              },
              required: ["format", "name"],
              additionalProperties: false,
            },
            colorScheme: { type: "string", enum: ["dark", "light"] },
            segments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  path: { type: "string" },
                  waitFor: { type: ["string", "null"] },
                  settleMs: { type: ["number", "null"] },
                  scroll: {
                    anyOf: [
                      {
                        type: "object",
                        properties: {
                          distance: { type: "number" },
                          duration: { type: "number" },
                        },
                        required: ["distance", "duration"],
                        additionalProperties: false,
                      },
                      { type: "null" },
                    ],
                  },
                  dwellMs: { type: ["number", "null"] },
                },
                required: [
                  "name",
                  "path",
                  "waitFor",
                  "settleMs",
                  "scroll",
                  "dwellMs",
                ],
                additionalProperties: false,
              },
            },
          },
          required: [
            "baseUrl",
            "viewport",
            "output",
            "colorScheme",
            "segments",
          ],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    maxTokens: 4096,
  });

  // Strip null values from AI response (strict schema uses null for optional fields)
  const cleaned = JSON.parse(
    JSON.stringify(result, (_, v) => (v === null ? undefined : v))
  );

  // Validate through Zod
  const parsed = DemotapeConfigSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`AI generated an invalid config:\n${issues}`);
  }

  return parsed.data;
}
