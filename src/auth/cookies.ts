import type { AuthConfig } from "../config.js";
import type { AuthResult } from "./index.js";

/**
 * Build auth result from raw cookie definitions in the config.
 */
export function injectCookies(auth: AuthConfig): AuthResult {
  if (!auth.cookies || auth.cookies.length === 0) {
    throw new Error("Cookie auth provider requires `cookies` array in config");
  }

  const cookies: AuthResult["cookies"] = auth.cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? "localhost",
    path: c.path ?? "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  return { cookies };
}
