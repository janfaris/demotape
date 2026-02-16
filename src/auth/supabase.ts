import type { AuthConfig } from "../config.js";
import type { AuthResult } from "./index.js";

/**
 * Chunk a string into pieces for Supabase SSR cookie storage.
 * Supabase auth tokens can exceed browser cookie size limits,
 * so they're split across multiple cookies (.0, .1, etc.).
 */
function chunkString(str: string, maxLen: number = 2000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += maxLen) {
    chunks.push(str.substring(i, i + maxLen));
  }
  return chunks;
}

/**
 * Authenticate with Supabase using magic link (admin API).
 * Uses raw fetch() instead of @supabase/supabase-js to keep the package light.
 */
export async function authenticateSupabase(
  auth: AuthConfig,
  baseUrl: string
): Promise<AuthResult> {
  const supabaseUrl =
    auth.supabaseUrl || process.env.DEMOTAPE_SUPABASE_URL;
  const serviceRoleKey =
    auth.supabaseServiceRoleKey || process.env.DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    auth.supabaseAnonKey || process.env.DEMOTAPE_SUPABASE_ANON_KEY;
  const email = auth.email || process.env.DEMOTAPE_EMAIL;

  if (!supabaseUrl) throw new Error("Supabase URL is required (config or DEMOTAPE_SUPABASE_URL env)");
  if (!serviceRoleKey) throw new Error("Supabase service role key is required (config or DEMOTAPE_SUPABASE_SERVICE_ROLE_KEY env)");
  if (!anonKey) throw new Error("Supabase anon key is required (config or DEMOTAPE_SUPABASE_ANON_KEY env)");
  if (!email) throw new Error("Email is required for Supabase auth (config or DEMOTAPE_EMAIL env)");

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  // 1. Generate magic link via admin API
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
    }),
  });

  if (!linkRes.ok) {
    const errText = await linkRes.text();
    throw new Error(`Failed to generate magic link (${linkRes.status}): ${errText}`);
  }

  const linkData = await linkRes.json();
  // Raw API returns hashed_token at top level; JS SDK wraps it under properties
  const hashedToken = linkData?.hashed_token ?? linkData?.properties?.hashed_token;
  if (!hashedToken) {
    throw new Error("Magic link response missing hashed_token");
  }

  // 2. Verify the token to get a session
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({
      type: "magiclink",
      token_hash: hashedToken,
    }),
  });

  if (!verifyRes.ok) {
    const errText = await verifyRes.text();
    throw new Error(`Failed to verify token (${verifyRes.status}): ${errText}`);
  }

  const session = await verifyRes.json();
  if (!session.access_token || !session.refresh_token) {
    throw new Error("Verify response missing tokens");
  }

  // 3. Build auth cookies (with chunking for long tokens)
  const sessionPayload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });

  const encoded = "base64-" + Buffer.from(sessionPayload).toString("base64url");
  const cookieName = `sb-${projectRef}-auth-token`;
  const domain = new URL(baseUrl).hostname;
  const uriEncoded = encodeURIComponent(encoded);

  const cookies: AuthResult["cookies"] = [];

  if (uriEncoded.length <= 3180) {
    cookies.push({
      name: cookieName,
      value: encoded,
      domain,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    });
  } else {
    const chunks = chunkString(encoded, 2000);
    for (let i = 0; i < chunks.length; i++) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: chunks[i],
        domain,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      });
    }
  }

  return { cookies };
}
