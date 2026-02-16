# Demotape

**Automated demo videos from your live web app. JSON config in, polished MP4 out.**

A CLI tool that records production-quality demo videos of web applications using Playwright + FFmpeg. Define page segments, scroll choreography, and text overlays in a JSON config — get pixel-perfect, skeleton-free MP4/WebM videos for landing pages, Product Hunt, Instagram Stories, and docs.

## Origin

Extracted from [Vantage](https://github.com/janfaris/pr-property-bot) (`/Users/janfaris/pr-property-bot`), a Puerto Rico real estate platform. The recording infrastructure was built to automate marketing videos for the landing page and social media. The source files:

- `scripts/record-demo.mjs` — Landscape recorder (landing page hero videos)
- `scripts/record-story.mjs` — Vertical/overlay recorder (Instagram Stories)
- `story-configs/*.json` — Segment config files

## Competitive Landscape

| Product | Price | How | Gap vs Demotape |
|---------|-------|-----|-----------------|
| Supademo | $27/mo | Screenshot stitching | Not real video |
| Arcade | $32/mo | Chrome extension | Not CI/CD native |
| Screen Studio | $89 one-time | Manual macOS recorder | Not automated |
| Puppydog.io | OSS | Playwright basic | No auth, no overlays, no multi-format |
| demo-recorder | OSS (npm) | Puppeteer basic | No FFmpeg, no segment trimming |

**Demotape's unique angles:**
1. Config-driven (JSON → MP4, no human in the loop)
2. Auth-aware (Supabase, cookies, localStorage — records behind login)
3. Skeleton-free (trims loading states per-segment, only shows rendered content)
4. Multi-format (landscape for landing pages, vertical for Instagram, any resolution)
5. FFmpeg post-processing (text overlays, format conversion, upscaling)
6. CI/CD native (runs headlessly, can auto-update videos on deploy)

## Product Vision

### Target Users
- Indie hackers / solo founders who need polished demo videos
- Dev-founded startups who change their UI frequently
- DevRel teams who need up-to-date product screenshots/videos
- Anyone who hates manually re-recording after every UI change

### Pricing Strategy
| Tier | Price | Features |
|------|-------|----------|
| **Open Source** | Free | CLI, local recording, MP4 output, basic auth (cookies) |
| **Pro** | $29/mo or $149 lifetime | Multi-format, text overlays, auth providers (Supabase/NextAuth/Clerk), CI/CD GitHub Action, priority support |
| **Team** | $79/mo (future) | Shared configs, cloud rendering, team dashboard |

**Launch strategy**: $49 lifetime deal for first 100 buyers on X, then raise to $149.

---

## Implementation Plan

### Phase 1: Extract & Generalize (Days 1-3)

#### 1.1 Initialize npm package

```
demotape/
├── CLAUDE.md              ← this file
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE                ← MIT
├── bin/
│   └── demotape.mjs       ← CLI entry point
├── src/
│   ├── index.ts            ← main export
│   ├── cli.ts              ← CLI argument parsing (commander)
│   ├── recorder.ts         ← core recording engine
│   ├── auth/
│   │   ├── index.ts        ← auth provider interface
│   │   ├── supabase.ts     ← Supabase magic link auth
│   │   ├── cookies.ts      ← raw cookie injection
│   │   └── local-storage.ts ← localStorage injection
│   ├── segments.ts         ← segment recording logic
│   ├── ffmpeg.ts           ← FFmpeg trim + concat + overlays
│   ├── config.ts           ← config schema + validation (Zod)
│   ├── overlays.ts         ← text overlay filter generation
│   ├── scroll.ts           ← smooth scroll helper
│   └── utils.ts            ← helpers (waitForIdle, dev overlay removal)
├── configs/
│   └── examples/
│       ├── landing-page.json
│       ├── instagram-story.json
│       └── product-hunt.json
└── test/
    └── config.test.ts
```

#### 1.2 Config Schema (public API)

This is the JSON config users write. Validate with Zod.

```typescript
interface DemotapeConfig {
  // Base URL of the app to record
  baseUrl: string;                          // e.g. "http://localhost:3000"

  // Authentication (optional — for apps behind login)
  auth?: {
    provider: "supabase" | "cookies" | "localStorage";

    // Supabase provider
    supabaseUrl?: string;                   // or reads from env
    supabaseServiceRoleKey?: string;        // or reads from env
    supabaseAnonKey?: string;               // or reads from env
    email?: string;                         // demo account email

    // Cookie provider — raw cookies to inject
    cookies?: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
    }>;

    // localStorage provider — key/value pairs to set
    localStorage?: Record<string, string>;
  };

  // Viewport (CSS layout size for Playwright)
  viewport?: { width: number; height: number };   // default: 1280x800

  // Output configuration
  output?: {
    size?: { width: number; height: number };      // default: same as viewport
    format?: "mp4" | "webm" | "both";              // default: "mp4"
    fps?: number;                                   // default: 30
    crf?: number;                                   // default: 28 (lower = better quality)
    name?: string;                                  // output filename (without extension)
    dir?: string;                                   // output directory (default: ./videos)
  };

  // Color scheme
  colorScheme?: "dark" | "light";                  // default: "dark"

  // Dev overlay removal (enabled by default)
  removeDevOverlays?: boolean;                     // default: true

  // CSS to suppress animations during recording (enabled by default)
  suppressAnimations?: boolean;                    // default: true

  // localStorage keys to set before recording (dismiss banners, etc.)
  setup?: {
    localStorage?: Record<string, string>;         // key-value pairs
    waitAfterSetup?: number;                       // ms to wait after setup
  };

  // Text overlays burned into the video via FFmpeg
  overlays?: {
    top?: { text: string; height?: number; fontSize?: number };
    bottom?: { text: string; height?: number; fontSize?: number };
  };

  // Page segments to record (the core config)
  segments: Array<{
    name: string;                                  // display name for logging
    path: string;                                  // URL path (e.g. "/dashboard")
    waitFor?: string;                              // CSS selector to wait for before recording
    settleMs?: number;                             // ms to wait after content loads (default: 1000)
    scroll?: {
      distance: number;                            // px to scroll down
      duration?: number;                           // ms for scroll animation (default: 2000)
    };
    dwellMs?: number;                              // ms to hold after actions (default: 2000)
    actions?: Array<{                              // future: click, type, hover actions
      type: "click" | "hover";
      selector: string;
      delay?: number;
    }>;
  }>;
}
```

#### 1.3 Source Code Extraction

Extract from the Vantage source files, generalizing away all Vantage-specific code:

**From `record-demo.mjs` (498 lines):**
- `smoothScroll()` → `src/scroll.ts`
- `waitForIdle()` → `src/utils.ts`
- `chunkString()` → `src/auth/supabase.ts`
- Supabase auth flow (lines 167-248) → `src/auth/supabase.ts`
- `recordSegment()` (lines 101-154) → `src/segments.ts`
- Dev overlay removal (lines 119-135 and 309-353) → `src/utils.ts`
- FFmpeg concat + encode (lines 449-478) → `src/ffmpeg.ts`
- Setup phase (lines 250-296) → `src/recorder.ts`
- Warmup phase (lines 355-392) → `src/recorder.ts`

**From `record-story.mjs` (533 lines):**
- FFmpeg overlay filter chain (lines 460-499) → `src/overlays.ts`
- `escapeFFmpegText()` → `src/overlays.ts`
- `AUTO_FIRST_LISTING` resolution (lines 378-412) → generalize to `autoResolve` config option
- Config loading + validation → `src/config.ts`

**Key generalizations needed:**
1. Remove all `vantage-*` localStorage keys → make configurable via `setup.localStorage`
2. Remove hardcoded `DEMO_EMAIL` → read from config or env
3. Remove `clasificadosonline` image selectors → user defines `waitFor` in config
4. Remove Vantage-specific announcement dismissals → user defines in `setup.localStorage`
5. Replace `a[href*="/dashboard/listings/"]` → make `autoResolve` a config option with custom selector
6. Support env vars from `.env`, `.env.local`, or explicit config (not hardcoded `.env.local`)

#### 1.4 CLI Design

```bash
# Record using a config file
npx demotape record --config demo.json

# Record with inline overrides
npx demotape record --config demo.json --format webm --output ./dist

# Generate a starter config
npx demotape init
npx demotape init --preset landing-page
npx demotape init --preset instagram-story

# Validate a config without recording
npx demotape validate --config demo.json

# Show available presets
npx demotape presets
```

Use `commander` for CLI parsing (widely used, good DX).

#### 1.5 Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "zod": "^3.22.0"
  },
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0",
    "playwright": "^1.40.0"
  }
}
```

**Important decisions:**
- `playwright` as peerDependency (users install their own version + browsers)
- FFmpeg is a system dependency (document in README, don't bundle)
- No `@supabase/supabase-js` dependency — use raw `fetch()` for Supabase auth (keeps the package light, auth is optional)
- Ship as ESM (`.mjs`) — Playwright and modern Node.js are ESM-first

---

### Phase 2: Polish & Package (Days 4-5)

#### 2.1 README

The README is the product's landing page on npm/GitHub. It must include:

1. **Hero**: One-line description + GIF/video of the tool in action
2. **Install**: `npm install -g demotape`
3. **Quick start**: 3 commands to go from zero to video
4. **Config reference**: Full schema with examples
5. **Auth providers**: How to record apps behind login
6. **Presets**: Landing page, Instagram Story, Product Hunt
7. **CI/CD**: GitHub Action example
8. **FAQ**: Common questions

Structure the README to be scannable — developers decide in 30 seconds.

#### 2.2 Example Configs

Create 3 example configs that ship with the package:

**`landing-page.json`** — Landscape 1280x800:
```json
{
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 1280, "height": 800 },
  "output": { "format": "both", "name": "demo" },
  "colorScheme": "dark",
  "segments": [
    {
      "name": "Home",
      "path": "/",
      "waitFor": "h1",
      "settleMs": 1500,
      "dwellMs": 3000
    },
    {
      "name": "Dashboard",
      "path": "/dashboard",
      "waitFor": "main",
      "settleMs": 2000,
      "scroll": { "distance": 400, "duration": 2500 },
      "dwellMs": 1500
    }
  ]
}
```

**`instagram-story.json`** — Vertical 1080x1920 with overlays:
```json
{
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 540, "height": 960 },
  "output": {
    "size": { "width": 1080, "height": 1920 },
    "format": "mp4",
    "name": "story"
  },
  "overlays": {
    "top": { "text": "Your App Name", "height": 120 },
    "bottom": { "text": "Try it free ↓", "height": 100 }
  },
  "segments": [
    {
      "name": "Feature Page",
      "path": "/features",
      "waitFor": "h1",
      "settleMs": 2000,
      "scroll": { "distance": 800, "duration": 5000 },
      "dwellMs": 2000
    }
  ]
}
```

**`product-hunt.json`** — 16:9 landscape, clean:
```json
{
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 1920, "height": 1080 },
  "output": { "format": "mp4", "name": "product-hunt-demo" },
  "segments": [
    {
      "name": "Hero",
      "path": "/",
      "waitFor": "h1",
      "settleMs": 2000,
      "dwellMs": 4000
    }
  ]
}
```

#### 2.3 npm Packaging

```json
{
  "name": "demotape",
  "version": "0.1.0",
  "description": "Record polished demo videos of your web app from a JSON config",
  "bin": { "demotape": "./bin/demotape.mjs" },
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "bin", "configs"],
  "keywords": ["demo", "video", "recording", "playwright", "marketing", "screenshot", "cli"],
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/janfaris/demotape" },
  "engines": { "node": ">=18" }
}
```

---

### Phase 3: Landing Page (Day 6)

#### 3.1 Domain

Check availability: `demotape.dev`, `demotape.sh`, `getdemotape.com`

#### 3.2 Landing Page Stack

Simple static site — could be:
- Single `index.html` with Tailwind CDN (fastest to ship)
- Next.js on Vercel (if we want blog/docs later)

**Sections:**
1. Hero: headline + terminal GIF showing `npx demotape record`
2. Before/After: manual recording vs demotape
3. Config preview: show JSON → resulting video
4. Features: auth-aware, skeleton-free, multi-format, CI/CD
5. Pricing: Free (OSS) / Pro ($29/mo)
6. Install: `npm install -g demotape`

#### 3.3 The Meta Demo

**Record demotape's own landing page using demotape.** This is the best possible marketing asset — the tool demonstrating itself. Create a `dogfood.json` config for this.

---

### Phase 4: GitHub + npm Publish (Day 7)

1. Create GitHub repo: `github.com/janfaris/demotape`
2. Add MIT LICENSE
3. Push code
4. `npm publish`
5. Verify `npx demotape --help` works
6. Create GitHub Release v0.1.0

---

### Phase 5: X (Twitter) Launch (Days 8-14)

#### Content Calendar

| Day | Content | Format |
|-----|---------|--------|
| 8 | Origin story thread: "I kept re-recording my demo video..." | Thread (5 tweets) |
| 9 | 30-second video: the tool recording a SaaS app | Video tweet |
| 10 | **Launch day**: Problem → Solution → Demo → Link | Thread + pinned |
| 11 | Post to Hacker News (Show HN) + r/SideProject | Cross-post |
| 12 | Record 5 popular indie hacker apps, tag founders | Video tweets |
| 13 | "CI/CD angle" tweet: videos auto-update on deploy | Single tweet |
| 14 | Week 1 metrics recap (build in public) | Thread |

#### Launch Tweet Template

```
I got tired of re-recording my app's demo video every time I changed a button.

So I built demotape — a CLI that turns a JSON config into a polished demo video.

→ Define segments (pages, scrolls, dwells)
→ Auth-aware (records behind login)
→ Skeleton-free (trims loading states)
→ Multi-format (landing page + IG Stories)
→ Runs in CI/CD (videos update on deploy)

[30-second video]

npm install -g demotape

Open source: github.com/janfaris/demotape
```

#### Accounts to Engage

- `@levelsio` — indie hacker, loves CLI tools
- `@marc_louvion` — SaaS builder, shares tools
- `@dannypostmaa` — appreciates automation
- `@taborein` — dev tools enthusiast
- `@swikidev` — showcases indie tools

#### Ongoing Cadence (post-launch)

3-5 tweets/week:
- Monday: build-in-public update
- Wednesday: demo of someone else's app (tag them)
- Friday: tip or comparison (before/after)

---

## Technical Notes

### Key Learnings from Vantage Implementation

These are hard-won lessons — don't re-learn them:

1. **Playwright viewport and recordVideo.size MUST match** — if recordVideo.size > viewport, Playwright pads with gray instead of upscaling. Use small viewport matching recording size, then FFmpeg scales up.

2. **deviceScaleFactor: do NOT use with separate recordVideo.size** — causes letterboxing.

3. **`reducedMotion: "reduce"`** — kills ScrollReveal and similar fade-in animations. Essential for clean recordings.

4. **CSS animation suppression** — inject this to prevent any transition jank:
```css
*, *::before, *::after {
  transition-duration: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
```

5. **Scroll smoothness** — FPS-matched steps, not fixed 60:
```js
const fps = 30;
const steps = Math.max(60, Math.round((durationMs / 1000) * fps));
```

6. **FFmpeg drawtext** — use `w`/`h` for input dimensions (NOT `iw`/`ih` — those are drawbox-only).

7. **`networkidle` can hang** — apps with WebSocket/streaming connections never reach networkidle. Always add a timeout fallback:
```js
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
  page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
);
```

8. **Dev overlay removal** — Next.js, PostHog, Vercel toolbar all inject fixed-position elements. Use both CSS hiding AND DOM removal via MutationObserver.

9. **Warmup phase is critical** — navigate to all pages BEFORE recording to prime the browser HTTP cache. Otherwise, first-load images appear as progressive JPEGs or loading placeholders.

10. **Supabase SSR auth cookies** — long tokens need chunking (`sb-{ref}-auth-token.0`, `.1`, etc.). Chunk at 2000 chars per cookie.

### FFmpeg Patterns

**Trim + Concat (core pattern):**
```bash
ffmpeg -y -ss TRIM1 -i seg1.webm -ss TRIM2 -i seg2.webm \
  -filter_complex "[0:v][1:v]concat=n=2:v=1[mid];[mid]fps=30,scale=1280:800,format=yuv420p[outv]" \
  -map "[outv]" -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an output.mp4
```

**Text overlays (gradient band + centered text):**
```bash
# Top band
[scaled]drawbox=x=0:y=0:w=iw:h=120:color=black@0.65:t=fill[top1];
[top1]drawtext=text='Your Text':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=60-text_h/2[top2]

# Bottom band
[top2]drawbox=x=0:y=ih-100:w=iw:h=100:color=black@0.65:t=fill[bot1];
[bot1]drawtext=text='CTA Text':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-50-text_h/2[outv]
```

**WebM (VP9) for Chrome/Firefox:**
```bash
-c:v libvpx-vp9 -crf 33 -b:v 1200k -an
```

**MP4 (H.264) for Safari/universal:**
```bash
-c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an
```

---

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally
node bin/demotape.mjs record --config configs/examples/landing-page.json

# Run tests
npm test

# Link globally for testing
npm link
demotape record --config demo.json

# Publish to npm
npm publish
```

## Environment Variables

Demotape reads env vars for auth providers. Users can set these in their shell, `.env`, or pass them in the config.

```env
# Supabase auth (optional)
DEMOTAPE_SUPABASE_URL=
DEMOTAPE_SUPABASE_ANON_KEY=
DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY=
DEMOTAPE_EMAIL=          # demo account email

# General
HEADLESS=true            # set to "false" to see the browser during recording
```

## Repository

- GitHub: `github.com/janfaris/demotape` (to be created)
- npm: `npmjs.com/package/demotape` (to be published)
- Landing page: TBD (demotape.dev or similar)
