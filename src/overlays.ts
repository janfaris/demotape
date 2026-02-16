import type { OverlayConfig } from "./config.js";

/**
 * Escape text for FFmpeg drawtext filter.
 * Handles special characters that break the filter syntax.
 */
export function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019") // Smart quote — avoids escaping issues
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;")
    .replace(/%/g, "%%");
}

/**
 * Build FFmpeg overlay filter chain for text bands.
 *
 * Takes the label of the previous filter stage (e.g. "scaled") and returns
 * the filter string and output label.
 *
 * Uses drawbox for semi-transparent gradient bands, drawtext for centered text.
 * Note: drawbox uses `iw`/`ih` for dimensions, drawtext uses `w`/`h`.
 */
export function buildOverlayFilters(
  overlays: OverlayConfig | undefined,
  inputLabel: string
): { filters: string; outputLabel: string } {
  if (!overlays || (!overlays.top && !overlays.bottom)) {
    return { filters: `;[${inputLabel}]null[outv]`, outputLabel: "outv" };
  }

  let filters = "";
  let currentLabel = inputLabel;

  if (overlays.top) {
    const h = overlays.top.height ?? 120;
    const fontSize = overlays.top.fontSize ?? 42;
    const halfH = Math.round(h / 2);

    // Semi-transparent black band at top
    filters += `;[${currentLabel}]drawbox=x=0:y=0:w=iw:h=${h}:color=black@0.65:t=fill[top1]`;
    // Centered text in the band
    filters +=
      `;[top1]drawtext=text='${escapeFFmpegText(overlays.top.text)}'` +
      `:fontsize=${fontSize}:fontcolor=white` +
      `:x=(w-text_w)/2:y=${halfH}-text_h/2[top2]`;
    currentLabel = "top2";
  }

  if (overlays.bottom) {
    const h = overlays.bottom.height ?? 100;
    const fontSize = overlays.bottom.fontSize ?? 32;
    const halfH = Math.round(h / 2);

    // Semi-transparent black band at bottom
    filters += `;[${currentLabel}]drawbox=x=0:y=ih-${h}:w=iw:h=${h}:color=black@0.65:t=fill[bot1]`;
    // Centered text in the band
    filters +=
      `;[bot1]drawtext=text='${escapeFFmpegText(overlays.bottom.text)}'` +
      `:fontsize=${fontSize}:fontcolor=white` +
      `:x=(w-text_w)/2:y=h-${halfH}-text_h/2[outv]`;
    return { filters, outputLabel: "outv" };
  }

  // Only top overlay — rename to outv
  filters = filters.replace(/\[top2\]$/, "[outv]");
  return { filters, outputLabel: "outv" };
}
