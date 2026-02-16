import type { BrowserContext } from "playwright";
import type { AuthConfig } from "../config.js";
import { authenticateSupabase } from "./supabase.js";
import { injectCookies } from "./cookies.js";
import { injectLocalStorage } from "./local-storage.js";

export interface AuthResult {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, string>;
}

/**
 * Authenticate using the configured provider and return cookies/localStorage
 * to inject into the browser context.
 */
export async function authenticate(
  auth: AuthConfig,
  baseUrl: string
): Promise<AuthResult> {
  switch (auth.provider) {
    case "supabase":
      return authenticateSupabase(auth, baseUrl);
    case "cookies":
      return injectCookies(auth);
    case "localStorage":
      return injectLocalStorage(auth);
    default:
      throw new Error(`Unknown auth provider: ${auth.provider}`);
  }
}

/**
 * Apply auth result to a browser context — sets cookies and optionally
 * injects localStorage values.
 */
export async function applyAuth(
  context: BrowserContext,
  authResult: AuthResult,
  baseUrl: string
): Promise<void> {
  if (authResult.cookies.length > 0) {
    await context.addCookies(authResult.cookies);
  }

  if (authResult.localStorage && Object.keys(authResult.localStorage).length > 0) {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate((items) => {
      for (const [key, value] of Object.entries(items)) {
        localStorage.setItem(key, value);
      }
    }, authResult.localStorage);
    await page.close();
  }
}
