// Public API
export { record, type RecordOptions } from "./recorder.js";
export {
  loadConfig,
  validateConfig,
  DemotapeConfigSchema,
  type DemotapeConfig,
  type Segment,
  type AuthConfig,
  type OutputConfig,
  type OverlayConfig,
  type SubtitlesConfig,
  type TransitionConfig,
  type CursorConfig,
  type ThemeConfig,
} from "./config.js";
export { createCLI } from "./cli.js";
export {
  enforceLicense,
  validateLicenseKey,
  detectProFeatures,
  LicenseError,
} from "./license.js";

// AI features
export { generateConfig, type GenerateOptions } from "./ai/generate.js";
export { generateNarration, type NarrationResult } from "./ai/narration.js";
export {
  autoNarrateSegments,
  extractFrameAsBase64,
  generateNarrationScript,
} from "./ai/auto-narrate.js";
export {
  compareScreenshots,
  waitForVisualReadiness,
  type VisualReadinessOptions,
} from "./ai/visual-readiness.js";

// Subtitles
export {
  formatSrtTimestamp,
  generateSrt,
  getSegmentDuration,
  splitIntoChunks,
  buildSubtitleEntries,
  buildSubtitleFilter,
  type SrtEntry,
} from "./subtitles.js";

// Transitions
export {
  buildTransitionFilter,
  computeTotalDurationWithTransitions,
} from "./transitions.js";

// Cursor
export {
  resolveCursorConfig,
  getCursorInjectionScript,
  getCursorMoveScript,
  getCursorClickScript,
  getCursorZoomInScript,
  getCursorZoomOutScript,
  type CursorOptions,
} from "./cursor.js";

// Theme
export {
  resolveTheme,
  buildThemeFilter,
  type ThemeOptions,
} from "./theme.js";
