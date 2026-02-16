# demotape

**Automated demo videos from your live web app. JSON config in, polished MP4 out.**

Stop manually re-recording your demo video every time you change a button. Define page segments, scroll choreography, and text overlays in a JSON config — get pixel-perfect, skeleton-free videos for landing pages, Product Hunt, Instagram Stories, and docs.

```bash
npx demotape init
# edit demotape.json with your app's URL and pages
npx demotape record --config demotape.json
```

---

## Why demotape?

| Problem | demotape solution |
|---------|-------------------|
| Re-record manually after every UI change | Run one command, get an updated video |
| Loading skeletons ruin the recording | Trims loading frames per-segment automatically |
| App is behind login | Auth-aware — Supabase, cookies, localStorage |
| Need different formats (landing page, IG Stories) | Multi-format from one config |
| Can't automate in CI/CD | Runs headlessly, updates videos on deploy |

## Install

```bash
npm install -g demotape

# Playwright browsers (one-time)
npx playwright install chromium

# FFmpeg (required for encoding)
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Ubuntu/Debian
```

> **Requires:** Node.js >= 18, FFmpeg, Playwright

## Quick Start

### 1. Generate a starter config

```bash
demotape init
```

This creates `demotape.json` with a landing page preset:

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

### 2. Edit the config

Point `baseUrl` to your running app. Add segments for each page you want to show.

### 3. Record

```bash
demotape record --config demotape.json
```

Output lands in `./videos/demo.mp4` (and `demo.webm` if format is `"both"`).

## How It Works

demotape uses **segment-based recording** to produce clean, skeleton-free videos:

1. **Authenticate** — Logs into your app if auth is configured
2. **Setup** — Sets localStorage keys to dismiss banners, onboarding, etc.
3. **Warmup** — Visits every page once to prime the browser HTTP cache (images, fonts)
4. **Record** — Opens each segment as a new page, waits for content to render, then records the scroll/dwell actions. Measures the loading time per segment.
5. **Encode** — FFmpeg trims the loading frames from each segment, concatenates them, scales to output size, applies text overlays, and encodes to MP4/WebM

The result: every frame in the final video shows fully rendered content. No spinners, no skeleton screens, no progressive image loading.

## Config Reference

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | `string` | *required* | Base URL of your app (e.g. `http://localhost:3000`) |
| `auth` | `object` | — | Authentication config (see [Auth Providers](#auth-providers)) |
| `viewport` | `{width, height}` | `1280x800` | Browser viewport size (CSS pixels) |
| `output` | `object` | — | Output config (see below) |
| `colorScheme` | `"dark" \| "light"` | `"dark"` | Browser color scheme |
| `removeDevOverlays` | `boolean` | `true` | Remove Next.js, PostHog, Vercel overlays |
| `suppressAnimations` | `boolean` | `true` | Disable CSS transitions/animations |
| `setup` | `object` | — | Pre-recording setup (see below) |
| `overlays` | `object` | — | Text overlays burned into the video |
| `segments` | `array` | *required* | Pages to record |

### `output`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `size` | `{width, height}` | same as viewport | Final video dimensions (FFmpeg scales up) |
| `format` | `"mp4" \| "webm" \| "both"` | `"mp4"` | Output format(s) |
| `fps` | `number` | `30` | Frames per second |
| `crf` | `number` | `28` | Quality (0-51, lower = better, bigger file) |
| `name` | `string` | `"demo"` | Output filename (without extension) |
| `dir` | `string` | `"./videos"` | Output directory |

### `setup`

| Field | Type | Description |
|-------|------|-------------|
| `localStorage` | `Record<string, string>` | Key-value pairs to set before recording (dismiss banners, set theme, etc.) |
| `waitAfterSetup` | `number` | Milliseconds to wait after setup |

### `overlays`

Text bands burned into the video via FFmpeg (useful for Instagram Stories, branded videos):

| Field | Type | Description |
|-------|------|-------------|
| `top` | `{text, height?, fontSize?}` | Top overlay band (default height: 120, fontSize: 42) |
| `bottom` | `{text, height?, fontSize?}` | Bottom overlay band (default height: 100, fontSize: 32) |

### `segments[]`

Each segment records one page of your app:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | *required* | Display name for logging |
| `path` | `string` | *required* | URL path (e.g. `/dashboard`) |
| `waitFor` | `string` | — | CSS selector to wait for before recording |
| `settleMs` | `number` | `1000` | Ms to wait after content loads |
| `scroll` | `{distance, duration?}` | — | Scroll down by `distance` px over `duration` ms |
| `dwellMs` | `number` | `2000` | Ms to hold after all actions |
| `actions` | `array` | — | Click/hover actions before scroll |

#### `segments[].actions[]`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"click" \| "hover"` | Action type |
| `selector` | `string` | CSS selector for the target element |
| `delay` | `number` | Ms to wait before executing |

## Auth Providers

demotape can record apps behind login. Configure auth in your JSON config.

### Supabase (magic link)

Generates a magic link via Supabase admin API and injects session cookies. No `@supabase/supabase-js` dependency needed — uses raw `fetch()`.

```json
{
  "auth": {
    "provider": "supabase",
    "supabaseUrl": "https://abc.supabase.co",
    "supabaseServiceRoleKey": "your-service-role-key",
    "supabaseAnonKey": "your-anon-key",
    "email": "demo@yourapp.com"
  }
}
```

Or use environment variables (recommended for secrets):

```bash
export DEMOTAPE_SUPABASE_URL=https://abc.supabase.co
export DEMOTAPE_SUPABASE_ANON_KEY=your-anon-key
export DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
export DEMOTAPE_EMAIL=demo@yourapp.com
```

```json
{
  "auth": {
    "provider": "supabase"
  }
}
```

### Cookies

Inject raw cookies (works with any cookie-based auth):

```json
{
  "auth": {
    "provider": "cookies",
    "cookies": [
      { "name": "session", "value": "abc123", "domain": "localhost" },
      { "name": "token", "value": "xyz789", "domain": "localhost" }
    ]
  }
}
```

### localStorage

Inject localStorage key-value pairs (works with JWT-based auth that stores tokens in localStorage):

```json
{
  "auth": {
    "provider": "localStorage",
    "localStorage": {
      "auth_token": "eyJhbGciOiJIUzI1NiIs...",
      "user_id": "123"
    }
  }
}
```

## Presets

Generate starter configs for common use cases:

```bash
# Landscape for landing pages (1280x800, MP4+WebM)
demotape init --preset landing-page

# Vertical for Instagram Stories (1080x1920 with text overlays)
demotape init --preset instagram-story

# 16:9 for Product Hunt (1920x1080)
demotape init --preset product-hunt
```

List all presets:

```bash
demotape presets
```

## CI/CD

### GitHub Actions

Automatically re-record your demo video on every deploy:

```yaml
name: Record Demo Video
on:
  push:
    branches: [main]

jobs:
  record:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: |
          npm ci
          npx playwright install chromium --with-deps
          sudo apt-get install -y ffmpeg

      - name: Start app
        run: npm run dev &
        env:
          PORT: 3000

      - name: Wait for app
        run: npx wait-on http://localhost:3000

      - name: Record demo
        run: npx demotape record --config demotape.json
        env:
          HEADLESS: true
          DEMOTAPE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          DEMOTAPE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DEMOTAPE_EMAIL: ${{ secrets.DEMO_EMAIL }}

      - name: Upload video
        uses: actions/upload-artifact@v4
        with:
          name: demo-video
          path: videos/
```

## CLI Reference

```bash
# Record using a config file
demotape record --config demotape.json

# Record with overrides
demotape record --config demotape.json --format webm --output ./dist

# Generate a starter config
demotape init
demotape init --preset instagram-story
demotape init --preset product-hunt

# Validate a config without recording
demotape validate --config demotape.json

# Show available presets
demotape presets

# Show help
demotape --help
```

## Programmatic API

Use demotape as a library in your own scripts:

```typescript
import { record, loadConfig } from "demotape";

const config = loadConfig("./demotape.json");
await record(config);
```

Or build a config object directly:

```typescript
import { record, type DemotapeConfig } from "demotape";

const config: DemotapeConfig = {
  baseUrl: "http://localhost:3000",
  viewport: { width: 1280, height: 800 },
  output: { format: "mp4", fps: 30, crf: 28, name: "demo", dir: "./videos" },
  colorScheme: "dark",
  removeDevOverlays: true,
  suppressAnimations: true,
  segments: [
    { name: "Home", path: "/", waitFor: "h1", settleMs: 1500, dwellMs: 3000 },
  ],
};

await record(config);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEMOTAPE_SUPABASE_URL` | Supabase project URL |
| `DEMOTAPE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `DEMOTAPE_EMAIL` | Demo account email for Supabase auth |
| `HEADLESS` | Set to `"false"` to see the browser during recording |

## FAQ

### Do I need FFmpeg?

Yes. demotape uses FFmpeg to trim loading frames, concatenate segments, apply overlays, and encode the final video. Install it with `brew install ffmpeg` (macOS) or `sudo apt install ffmpeg` (Linux).

### Why are there gray bars in my video?

This happens when `recordVideo.size` doesn't match the viewport. demotape handles this automatically — it sets both to the same value and uses FFmpeg to scale up to the output size. If you see gray bars, make sure `output.size` is a multiple of your `viewport` dimensions.

### Can I record apps that need authentication?

Yes. demotape supports three auth providers: Supabase (magic link), raw cookies, and localStorage injection. See [Auth Providers](#auth-providers).

### How do I dismiss banners/modals before recording?

Use the `setup.localStorage` field to set keys that your app checks. For example, if your app hides an onboarding modal when `onboarding-done` is in localStorage:

```json
{
  "setup": {
    "localStorage": {
      "onboarding-done": "1",
      "cookie-consent": "accepted"
    }
  }
}
```

### Can I run this in CI/CD?

Yes. Set `HEADLESS=true` (the default) and make sure Playwright browsers and FFmpeg are installed. See [CI/CD](#cicd) for a GitHub Actions example.

### How do I reduce file size?

Increase the `crf` value in your output config. The default is 28. Try 32-35 for smaller files with slightly lower quality.

### Why is the first frame of a segment blurry?

The warmup phase should prevent this by priming the browser cache. If you still see blurry first frames, increase `settleMs` for that segment to give images more time to load.

## License

MIT
