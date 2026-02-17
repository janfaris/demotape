/**
 * Cursor animation — injects a fake cursor element into the page.
 *
 * Creates a fixed-position div that animates smoothly to element positions
 * before actions (click, hover). Includes a ripple effect on clicks.
 *
 * The cursor is a CSS-only element — no images or external deps needed.
 * It sits at z-index 999999 with pointer-events: none so it doesn't
 * interfere with actual page interactions.
 */

export interface CursorOptions {
  size: number;
  color: string;
  clickEffect: boolean;
  hoverZoom?: number; // e.g. 1.25 — zoom into the action target area
}

const CURSOR_ID = "__demotape-cursor";
const RIPPLE_ID = "__demotape-ripple";

/**
 * Resolve cursor config: `true` → defaults, `false`/undefined → undefined, object → merged.
 */
export function resolveCursorConfig(
  cursor: boolean | CursorOptions | undefined
): CursorOptions | undefined {
  if (cursor === false || cursor === undefined) return undefined;
  if (cursor === true) {
    return { size: 20, color: "rgba(0,0,0,0.8)", clickEffect: true };
  }
  return {
    size: cursor.size ?? 20,
    color: cursor.color ?? "rgba(0,0,0,0.8)",
    clickEffect: cursor.clickEffect ?? true,
    hoverZoom: cursor.hoverZoom,
  };
}

/**
 * Returns a JS string to inject the fake cursor element into the page.
 * Call via page.evaluate().
 */
export function getCursorInjectionScript(opts: CursorOptions): string {
  return `(() => {
    if (document.getElementById('${CURSOR_ID}')) return;

    const cursor = document.createElement('div');
    cursor.id = '${CURSOR_ID}';
    cursor.style.cssText = \`
      position: fixed;
      width: ${opts.size}px;
      height: ${opts.size}px;
      background: ${opts.color};
      border-radius: 50%;
      pointer-events: none;
      z-index: 999999;
      top: -50px;
      left: -50px;
      transition: top 600ms cubic-bezier(0.25, 0.1, 0.25, 1),
                  left 600ms cubic-bezier(0.25, 0.1, 0.25, 1);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    \`;
    document.body.appendChild(cursor);

    const ripple = document.createElement('div');
    ripple.id = '${RIPPLE_ID}';
    ripple.style.cssText = \`
      position: fixed;
      width: ${opts.size * 3}px;
      height: ${opts.size * 3}px;
      border: 2px solid ${opts.color};
      border-radius: 50%;
      pointer-events: none;
      z-index: 999998;
      top: -100px;
      left: -100px;
      opacity: 0;
      transform: scale(0.5);
      transition: opacity 300ms ease-out, transform 300ms ease-out;
    \`;
    document.body.appendChild(ripple);
  })()`;
}

/**
 * Returns a JS string to animate the cursor to specific coordinates.
 * The transition is CSS-driven (600ms ease).
 */
export function getCursorMoveScript(x: number, y: number): string {
  return `(() => {
    const cursor = document.getElementById('${CURSOR_ID}');
    if (!cursor) return;
    cursor.style.top = '${y}px';
    cursor.style.left = '${x}px';
  })()`;
}

/**
 * Returns a JS string to trigger the click ripple animation.
 * The ripple expands and fades over 300ms.
 */
export function getCursorClickScript(): string {
  return `(() => {
    const cursor = document.getElementById('${CURSOR_ID}');
    const ripple = document.getElementById('${RIPPLE_ID}');
    if (!cursor || !ripple) return;

    const rect = cursor.getBoundingClientRect();
    const size = ${RIPPLE_ID === "__demotape-ripple" ? "ripple.offsetWidth" : "60"};
    ripple.style.top = (rect.top + rect.height / 2 - size / 2) + 'px';
    ripple.style.left = (rect.left + rect.width / 2 - size / 2) + 'px';
    ripple.style.opacity = '0.6';
    ripple.style.transform = 'scale(1)';

    setTimeout(() => {
      ripple.style.opacity = '0';
      ripple.style.transform = 'scale(0.5)';
    }, 300);
  })()`;
}

/**
 * Returns a JS string to smoothly zoom the page centered on a viewport point.
 *
 * Uses CSS transform on <html> for a layout-free cinematic zoom.
 * Accounts for scroll position so the zoom centers on the correct spot.
 */
export function getCursorZoomInScript(
  viewportX: number,
  viewportY: number,
  zoom: number
): string {
  return `(() => {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const html = document.documentElement;
    html.style.transition = 'transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1)';
    html.style.transformOrigin = (${viewportX} + sx) + 'px ' + (${viewportY} + sy) + 'px';
    html.style.transform = 'scale(${zoom})';
  })()`;
}

/**
 * Returns a JS string to smoothly zoom back out to normal scale.
 */
export function getCursorZoomOutScript(): string {
  return `(() => {
    const html = document.documentElement;
    html.style.transition = 'transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1)';
    html.style.transform = 'scale(1)';
  })()`;
}
