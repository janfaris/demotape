/**
 * Shared OpenAI API client using native fetch().
 *
 * No npm dependencies — follows the same pattern as src/auth/supabase.ts.
 * Uses the latest OpenAI models: gpt-5-nano for chat, gpt-4o-mini-tts for TTS.
 */

const OPENAI_API_BASE = "https://api.openai.com/v1";

export function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for AI features.\n" +
        "  export OPENAI_API_KEY=sk-..."
    );
  }
  return key;
}

/* ─── Chat Completion ─── */

export interface ChatCompletionOptions {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>;
  model?: string;
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
  maxTokens?: number;
}

export async function chatCompletion(
  opts: ChatCompletionOptions
): Promise<unknown> {
  const apiKey = getApiKey();
  const model = opts.model ?? "gpt-5-nano";

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
  };

  if (opts.maxTokens) {
    body.max_completion_tokens = opts.maxTokens;
  }

  if (opts.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI chat completion failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    const finish = (choice as Record<string, unknown>)?.finish_reason;
    throw new Error(
      `OpenAI returned empty response (finish_reason: ${finish ?? "unknown"}). ` +
        `The input may be too large — try fewer/smaller images or a shorter prompt.`
    );
  }

  return JSON.parse(content);
}

/* ─── Text-to-Speech ─── */

/** All voices supported by gpt-4o-mini-tts */
export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type TTSVoice = (typeof TTS_VOICES)[number];

export interface TextToSpeechOptions {
  input: string;
  voice?: TTSVoice;
  speed?: number;
  model?: string;
  instructions?: string;
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav";
}

export async function textToSpeech(
  opts: TextToSpeechOptions
): Promise<Buffer> {
  const apiKey = getApiKey();
  const model = opts.model ?? "gpt-4o-mini-tts";
  const voice = opts.voice ?? "coral";

  const body: Record<string, unknown> = {
    model,
    input: opts.input,
    voice,
    response_format: opts.responseFormat ?? "mp3",
  };

  if (opts.speed !== undefined) {
    body.speed = opts.speed;
  }

  if (opts.instructions) {
    body.instructions = opts.instructions;
  }

  const res = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI TTS failed (${res.status}): ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
