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
});

const SetupSchema = z.object({
  localStorage: z.record(z.string()).optional(),
  waitAfterSetup: z.number().optional(),
});

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
  segments: z.array(SegmentSchema).min(1, "At least one segment is required"),
});

/* ─── Types ─── */

export type DemotapeConfig = z.infer<typeof DemotapeConfigSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type AuthConfig = z.infer<typeof AuthSchema>;
export type OutputConfig = z.infer<typeof OutputSchema>;
export type OverlayConfig = z.infer<typeof OverlaysSchema>;

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
