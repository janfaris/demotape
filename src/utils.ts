import type { Page, BrowserContext } from "playwright";

/**
 * Wait for network to settle. Falls back gracefully on timeout
 * (apps with WebSocket/streaming connections never reach networkidle).
 */
export async function waitForIdle(
  page: Page,
  timeoutMs: number = 5000
): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  } catch {
    // Timeout is fine — some apps never reach networkidle
  }
}

/**
 * Navigate to a URL with networkidle, falling back to domcontentloaded.
 */
export async function safeGoto(
  page: Page,
  url: string,
  timeoutMs: number = 30000
): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
  } catch {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  }
}

/**
 * Remove dev overlays from the page (Next.js indicator, PostHog widget,
 * Vercel toolbar, and any fixed-position element in the bottom-left corner).
 */
export async function removeDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Remove known dev overlay elements
    document
      .querySelectorAll("nextjs-portal")
      .forEach((el) => el.remove());
    document
      .querySelectorAll('[id*="__posthog"], [id*="posthog"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('[id*="__vercel"]')
      .forEach((el) => el.remove());

    // Nuclear: remove any fixed-position element in the bottom-left corner
    document.querySelectorAll("*").forEach((el) => {
      const s = window.getComputedStyle(el);
      if (s.position === "fixed") {
        const b = parseInt(s.bottom, 10);
        const l = parseInt(s.left, 10);
        if (b >= 0 && b < 80 && l >= 0 && l < 80) {
          (el as HTMLElement).remove();
        }
      }
    });
  });
  await page.waitForTimeout(100);
}

/**
 * Inject an init script into a browser context that persistently hides dev
 * overlays via CSS and removes them via MutationObserver. Optionally also
 * suppresses CSS animations/transitions.
 */
export async function injectOverlayAndAnimationSuppressions(
  context: BrowserContext,
  options: { removeDevOverlays: boolean; suppressAnimations: boolean }
): Promise<void> {
  const { removeDevOverlays: hideOverlays, suppressAnimations } = options;

  await context.addInitScript(
    ({ hideOverlays, suppressAnimations }) => {
      const injectCSS = () => {
        if (document.getElementById("__demotape-styles")) return;
        const style = document.createElement("style");
        style.id = "__demotape-styles";

        let css = "";

        if (hideOverlays) {
          css += `
          nextjs-portal,
          [data-nextjs-dialog-overlay],
          [data-nextjs-toast],
          nextjs-portal * {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }
        `;
        }

        if (suppressAnimations) {
          css += `
          *, *::before, *::after {
            transition-duration: 0s !important;
            animation-duration: 0s !important;
            animation-delay: 0s !important;
          }
        `;
        }

        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      };

      const removeDOMOverlays = () => {
        injectCSS();
        if (!hideOverlays) return;
        document
          .querySelectorAll("nextjs-portal")
          .forEach((el) => el.remove());
        document
          .querySelectorAll('[id*="__posthog"], [id*="posthog"]')
          .forEach((el) => el.remove());
        document
          .querySelectorAll('[id*="__vercel"]')
          .forEach((el) => el.remove());
      };

      removeDOMOverlays();
      document.addEventListener("DOMContentLoaded", removeDOMOverlays);
      if (document.documentElement) {
        new MutationObserver(removeDOMOverlays).observe(
          document.documentElement,
          { childList: true, subtree: true }
        );
      }
    },
    { hideOverlays, suppressAnimations }
  );
}
