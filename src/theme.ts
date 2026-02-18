/**
 * Theme compositor — wraps raw video content in a premium visual frame.
 *
 * The "showcase" theme creates an Apple-keynote-style presentation:
 * - macOS window chrome (title bar with traffic light dots)
 * - Dark background with content floating in center
 * - Content scaled down with generous breathing room (10%)
 * - Rounded corners via alpha mask
 * - Soft drop shadow for depth
 *
 * All done in the FFmpeg filter chain — no new dependencies.
 */

import type { ThemeConfig } from "./config.js";

export interface ThemeOptions {
  background: string; // hex color, e.g. "#0a0a0a"
  padding: number; // fraction of output size (0.10 = 10%)
  radius: number; // corner radius in px
  shadow: boolean;
  windowChrome: boolean; // macOS-style title bar with traffic lights
  wallpaper: "aurora" | "mesh" | "gradient" | "none";
}

/**
 * Resolve theme config into concrete options.
 * - "raw" or undefined → no theme
 * - "showcase" → premium defaults (window chrome, generous padding)
 * - object → custom options
 */
export function resolveTheme(
  theme?: ThemeConfig
): ThemeOptions | undefined {
  if (!theme || theme === "raw") return undefined;

  if (theme === "showcase") {
    return {
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      padding: 0.08,
      radius: 12,
      shadow: true,
      windowChrome: true,
      wallpaper: "aurora" as const,
    };
  }

  // Object config with defaults applied by Zod
  return {
    background: theme.background ?? "#0a0a0a",
    padding: theme.padding ?? 0.10,
    radius: theme.radius ?? 16,
    shadow: theme.shadow ?? true,
    windowChrome: theme.windowChrome ?? false,
    wallpaper: (theme.wallpaper ?? "none") as "aurora" | "mesh" | "gradient" | "none",
  };
}

/**
 * Build FFmpeg filter chain for the theme compositor.
 *
 * Takes the [scaled] stream and outputs a themed [themed] stream.
 *
 * Filter chain:
 * 1. Scale content to fit inside the "window" area
 * 2. (Optional) Create macOS title bar with traffic light dots
 * 3. Stack title bar + content into a single "window" frame
 * 4. Apply rounded corners via geq alpha mask
 * 5. Create dark background
 * 6. (Optional) Soft drop shadow behind the window
 * 7. Overlay window on background
 */
/**
 * Extract a solid hex color from a background value.
 * Handles both plain hex (#0a0a0a) and CSS gradients.
 */
function extractSolidColor(bg: string): string {
  if (bg.startsWith("#")) return bg;
  const match = bg.match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : "#0a0a0a";
}

export function buildThemeFilter(
  inputLabel: string,
  outputWidth: number,
  outputHeight: number,
  theme: ThemeOptions
): { filters: string; outputLabel: string } {
  const pad = theme.padding;
  const r = theme.radius;
  const barH = theme.windowChrome ? 36 : 0;

  // Window width from horizontal padding
  let windowW = Math.round(outputWidth * (1 - 2 * pad));
  windowW = windowW % 2 === 0 ? windowW : windowW - 1;

  // Content height maintains the original aspect ratio
  let contentH = Math.round(windowW * (outputHeight / outputWidth));
  contentH = contentH % 2 === 0 ? contentH : contentH - 1;

  // Total window = title bar + content
  let windowH = contentH + barH;
  windowH = windowH % 2 === 0 ? windowH : windowH + 1;

  const offsetX = Math.round((outputWidth - windowW) / 2);
  const offsetY = Math.round((outputHeight - windowH) / 2);

  const bg = extractSolidColor(theme.background);
  let filters = "";

  // Step 1: Scale content to fit inside window content area
  filters += `;[${inputLabel}]scale=${windowW}:${contentH}[_tcontent]`;

  if (barH > 0) {
    // Step 2: macOS window chrome — title bar with traffic light dots
    // Title bar: #2d2d2d background, 36px tall
    // Traffic lights: 12px circles at standard macOS positions
    // Separator: 1px dark line at bottom of title bar
    const dotFS = 12;
    const dotX1 = 16;
    const dotX2 = 36;
    const dotX3 = 56;
    filters +=
      `;color=#2d2d2d:s=${windowW}x${barH}:r=30,` +
      `drawbox=x=0:y=${barH - 1}:w=iw:h=1:color=#1a1a1a:t=fill,` +
      `drawtext=text='●':fontcolor=#ff5f57:fontsize=${dotFS}:x=${dotX1}:y=(h-text_h)/2,` +
      `drawtext=text='●':fontcolor=#febc2e:fontsize=${dotFS}:x=${dotX2}:y=(h-text_h)/2,` +
      `drawtext=text='●':fontcolor=#28c840:fontsize=${dotFS}:x=${dotX3}:y=(h-text_h)/2` +
      `[_tbar]`;

    // Step 3: Stack title bar + content vertically
    filters += `;[_tbar][_tcontent]vstack[_twindow]`;
  } else {
    filters += `;[_tcontent]copy[_twindow]`;
  }

  // Step 4: Rounded corners via geq alpha mask
  const cornerCheck =
    `lt(X,${r})*lt(Y,${r})*gt(pow(X-${r},2)+pow(Y-${r},2),pow(${r},2))` +
    `+lt(W-X,${r}+1)*lt(Y,${r})*gt(pow(W-X-1-${r},2)+pow(Y-${r},2),pow(${r},2))` +
    `+lt(X,${r})*lt(H-Y,${r}+1)*gt(pow(X-${r},2)+pow(H-Y-1-${r},2),pow(${r},2))` +
    `+lt(W-X,${r}+1)*lt(H-Y,${r}+1)*gt(pow(W-X-1-${r},2)+pow(H-Y-1-${r},2),pow(${r},2))`;

  filters +=
    `;[_twindow]format=rgba,geq=` +
    `r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
    `a='if(${cornerCheck},0,255)'[_trounded]`;

  // Step 5: Create solid dark background
  filters += `;color=${bg}:s=${outputWidth}x${outputHeight}:r=30[_tbg]`;

  if (theme.shadow) {
    // Step 6: Soft drop shadow — blurred dark rect offset behind window
    filters +=
      `;color=black@0.45:s=${windowW}x${windowH}:r=30[_tshadow_src]` +
      `;[_tshadow_src]boxblur=18:10[_tshadow_blur]` +
      `;[_tbg][_tshadow_blur]overlay=${offsetX + 4}:${offsetY + 8}[_tshadowed]` +
      `;[_tshadowed][_trounded]overlay=${offsetX}:${offsetY}`;
  } else {
    // No shadow — just overlay content on background
    filters += `;[_tbg][_trounded]overlay=${offsetX}:${offsetY}`;
  }

  const outputLabel = "themed";
  filters += `[${outputLabel}]`;

  return { filters, outputLabel };
}
