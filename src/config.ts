import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

/* ─── Schema ─── */

const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
});

const AuthSchema = z.object({
  provider: z.enum(["supabase", "cookies", "localStorage"]),

  // Supabase
  supabaseUrl: z.string().optional(),
  supabaseServiceRoleKey: z.string().optional(),
  supabaseAnonKey: z.string().optional(),
  email: z.string().optional(),

  // Cookies
  cookies: z.array(CookieSchema).optional(),

  // localStorage
  localStorage: z.record(z.string()).optional(),
});

const SizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const OutputSchema = z.object({
  size: SizeSchema.optional(),
  format: z.enum(["mp4", "webm", "both"]).default("mp4"),
  fps: z.number().int().positive().default(30),
  crf: z.number().int().min(0).max(51).default(28),
  name: z.string().default("demo"),
  dir: z.string().default("./videos"),
});

const OverlayBandSchema = z.object({
  text: z.string(),
  height: z.number().int().positive().optional(),
  fontSize: z.number().int().positive().optional(),
});

const OverlaysSchema = z.object({
  top: OverlayBandSchema.optional(),
  bottom: OverlayBandSchema.optional(),
});

const ActionSchema = z.object({
  type: z.enum(["click", "hover"]),
  selector: z.string(),
  delay: z.number().optional(),
});

const SegmentNarrationSchema = z.object({
  script: z.string().optional(),
  auto: z.boolean().optional(),
});

const XFADE_TYPES = [
  "fade", "wipeleft", "wiperight", "wipeup", "wipedown",
  "slideleft", "slideright", "slideup", "slidedown",
  "circlecrop", "rectcrop", "distance", "fadeblack", "fadewhite",
  "radial", "smoothleft", "smoothright", "smoothup", "smoothdown",
  "circleopen", "circleclose", "vertopen", "vertclose",
] as const;

const TransitionConfigSchema = z.object({
  type: z.enum(XFADE_TYPES).default("fade"),
  duration: z.number().min(0.1).max(5).default(0.5),
});

const SegmentSchema = z.object({
  name: z.string(),
  path: z.string(),
  waitFor: z.string().optional(),
  settleMs: z.number().default(1000),
  scroll: z
    .object({
      distance: z.number(),
      duration: z.number().default(2000),
    })
    .optional(),
  dwellMs: z.number().default(2000),
  actions: z.array(ActionSchema).optional(),
  narration: SegmentNarrationSchema.optional(),
  transition: TransitionConfigSchema.optional(),
});

const SetupSchema = z.object({
  localStorage: z.record(z.string()).optional(),
  waitAfterSetup: z.number().optional(),
});

const VisualReadinessConfigSchema = z.object({
  intervalMs: z.number().positive().default(200),
  threshold: z.number().min(0).max(1).default(0.001),
  maxWaitMs: z.number().positive().default(10000),
  consecutiveStable: z.number().int().positive().default(2),
});

const VisualReadinessSchema = z.union([
  z.boolean(),
  VisualReadinessConfigSchema,
]);

const NarrationVoiceSchema = z.enum([
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar",
]);

const NarrationSchema = z.object({
  voice: NarrationVoiceSchema.default("coral"),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  model: z.enum(["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]).default("gpt-4o-mini-tts"),
  instructions: z.string().optional(),
  auto: z.boolean().optional(),
});

const SubtitleStyleSchema = z.object({
  fontSize: z.number().int().positive().optional(),
  fontColor: z.string().optional(),
  bgColor: z.string().optional(),
  position: z.enum(["bottom", "top"]).default("bottom"),
});

const SubtitlesSchema = z.object({
  enabled: z.boolean().default(true),
  burn: z.boolean().default(false),
  style: SubtitleStyleSchema.optional(),
});

const CursorOptionsSchema = z.object({
  size: z.number().int().positive().default(20),
  color: z.string().default("rgba(0,0,0,0.8)"),
  clickEffect: z.boolean().default(true),
});

const CursorSchema = z.union([z.boolean(), CursorOptionsSchema]);

export const DemotapeConfigSchema = z.object({
  baseUrl: z.string().url(),
  auth: AuthSchema.optional(),
  viewport: SizeSchema.default({ width: 1280, height: 800 }),
  output: OutputSchema.default({}),
  colorScheme: z.enum(["dark", "light"]).default("dark"),
  removeDevOverlays: z.boolean().default(true),
  suppressAnimations: z.boolean().default(true),
  setup: SetupSchema.optional(),
  overlays: OverlaysSchema.optional(),
  visualReadiness: VisualReadinessSchema.optional(),
  narration: NarrationSchema.optional(),
  subtitles: SubtitlesSchema.optional(),
  transitions: TransitionConfigSchema.optional(),
  cursor: CursorSchema.optional(),
  segments: z.array(SegmentSchema).min(1, "At least one segment is required"),
});

/* ─── Types ─── */

export type DemotapeConfig = z.infer<typeof DemotapeConfigSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type AuthConfig = z.infer<typeof AuthSchema>;
export type OutputConfig = z.infer<typeof OutputSchema>;
export type OverlayConfig = z.infer<typeof OverlaysSchema>;
export type SubtitlesConfig = z.infer<typeof SubtitlesSchema>;
export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;
export type CursorConfig = z.infer<typeof CursorSchema>;

/* ─── Loader ─── */

export function loadConfig(configPath: string): DemotapeConfig {
  const absolutePath = resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${absolutePath}`);
  }

  const result = DemotapeConfigSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${issues}`);
  }

  return result.data;
}

export function validateConfig(config: unknown): DemotapeConfig {
  return DemotapeConfigSchema.parse(config);
}
