import type { AuthConfig } from "../config.js";
import type { AuthResult } from "./index.js";

/**
 * Build auth result from localStorage key-value pairs.
 * These get injected into the browser via page.evaluate().
 */
export function injectLocalStorage(auth: AuthConfig): AuthResult {
  if (!auth.localStorage || Object.keys(auth.localStorage).length === 0) {
    throw new Error(
      "localStorage auth provider requires `localStorage` object in config"
    );
  }

  return {
    cookies: [],
    localStorage: auth.localStorage,
  };
}
