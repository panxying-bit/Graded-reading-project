import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Load .env from fixed locations relative to this package — NOT from process.cwd().
// (Cursor/IDE or `npm` may start the process with cwd = repo root, subfolder, or
// `server/`, which used to make the same project read different .env files and
// a "working" API in another app look "broken" here.)
const _configDir = path.dirname(fileURLToPath(import.meta.url));
const _serverDir = path.join(_configDir, "..", "..");
const _parentEnv = path.join(_serverDir, "..", ".env");
const _serverEnv = path.join(_serverDir, ".env");
config({ path: _parentEnv });
config({ path: _serverEnv });

function optPositiveInt(v: string | undefined): number | undefined {
  if (v == null || v === "") {
    return undefined;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function isTruthyEnv(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  llmBaseUrl: (process.env.LLM_BASE_URL ?? "").replace(/\/$/, ""),
  /**
   * Full POST URL for OpenAI-style chat.completions (optional).
   * Use for Azure OpenAI / AI Foundry: .../openai/deployments/NAME/chat/completions?api-version=...
   * When set, the client does not append /v1/chat/completions to LLM_BASE_URL.
   */
  llmChatCompletionsUrl: (process.env.LLM_CHAT_COMPLETIONS_URL ?? "").trim(),
  llmApiKey: process.env.LLM_API_KEY ?? "",
  /**
   * Full `Authorization` header value. Some OpenAI proxies expect `sk-...` only (no "Bearer ").
   * If unset, the client sends `Bearer ${LLM_API_KEY}`.
   */
  llmAuthorization: (process.env.LLM_AUTHORIZATION ?? "").trim() || null,
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  /**
   * Some Azure / reasoning models only allow the default temperature; set to 1 to omit the field from JSON.
   * See also `llmShouldOmitTemperature()` (also auto-omits for gpt-5-* by model name).
   */
  llmOmitTemperature: isTruthyEnv(process.env.LLM_OMIT_TEMPERATURE),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 120_000),
  /** If set, sent as `max_tokens` (long Level3 JSON output may need 2000–8000+). */
  llmMaxTokens: optPositiveInt(process.env.LLM_MAX_TOKENS),
  /**
   * If true, never send `max_tokens` (some gateways return 503 when this field is present).
   */
  llmDisableMaxTokens: isTruthyEnv(process.env.LLM_DISABLE_MAX_TOKENS),
  /**
   * If true, Level3 omits the long REFERENCE passage block in the system prompt
   * (saves a lot of tokens; use when your gateway returns 503 on large requests).
   */
  llmLevel3OmitReference: isTruthyEnv(process.env.LLM_LEVEL3_OMIT_REFERENCE),
  /**
   * If true, Level3 uses a short system+user (large reduction in request JSON size).
   * Use with LLM_LEVEL3_OMIT_REFERENCE=1 if the gateway still 503s (~4k+ char bodies).
   */
  llmLevel3CompactPrompt: isTruthyEnv(process.env.LLM_LEVEL3_COMPACT_PROMPT),

  /** Base URL for image API, e.g. https://api.getimg.ai/v2 (no trailing slash). */
  imageApiBaseUrl: (process.env.IMAGE_API_BASE_URL ?? "").replace(/\/$/, ""),
  imageApiKey: process.env.IMAGE_API_KEY ?? "",
  imageModel: process.env.IMAGE_MODEL ?? "seedream-5-0-lite",
  imageAspectRatio: process.env.IMAGE_ASPECT_RATIO ?? "4:3",
  imageResolution: process.env.IMAGE_RESOLUTION ?? "2K",
  imageOutputFormat: process.env.IMAGE_OUTPUT_FORMAT ?? "jpeg",
};

/**
 * Azure OpenAI / AI Foundry chat uses `api-key` header; OpenAI-compatible proxies use `Authorization: Bearer`.
 * Auto-detect from hostname unless LLM_API_KEY_HEADER or LLM_USE_BEARER overrides.
 */
/**
 * Omit `temperature` in chat.completions body when the provider only accepts the model default
 * (e.g. gpt-5-mini on Azure). Auto-detects gpt-5* so a missed env or stale build still works.
 */
export function llmShouldOmitTemperature(): boolean {
  if (env.llmOmitTemperature) {
    return true;
  }
  const m = env.llmModel.trim().toLowerCase();
  return /^gpt-5/i.test(m);
}

export function llmUsesAzureApiKeyHeader(): boolean {
  if (env.llmAuthorization) {
    return false;
  }
  if (isTruthyEnv(process.env.LLM_USE_BEARER)) {
    return false;
  }
  const explicit = (process.env.LLM_API_KEY_HEADER ?? "").trim().toLowerCase();
  if (explicit === "api-key" || explicit === "azure") {
    return true;
  }
  if (explicit === "bearer" || explicit === "authorization") {
    return false;
  }
  const u = env.llmChatCompletionsUrl || env.llmBaseUrl;
  if (!u) {
    return false;
  }
  try {
    const host = new URL(u).hostname.toLowerCase();
    return (
      host.includes("cognitiveservices.azure.com") ||
      host.endsWith("openai.azure.com")
    );
  } catch {
    return false;
  }
}

/** URL used for logging / host display when only LLM_CHAT_COMPLETIONS_URL is set. */
export function resolveLlmBaseUrlForDisplay(): string {
  if (env.llmBaseUrl) {
    return env.llmBaseUrl;
  }
  if (env.llmChatCompletionsUrl) {
    try {
      return new URL(env.llmChatCompletionsUrl).origin;
    } catch {
      return "";
    }
  }
  return "";
}

export function assertLlmEnv(): void {
  if (!env.llmBaseUrl && !env.llmChatCompletionsUrl) {
    throw new Error(
      "Set LLM_BASE_URL and/or LLM_CHAT_COMPLETIONS_URL in .env (project root or server/); see .env.example.",
    );
  }
  if (!env.llmAuthorization && !env.llmApiKey.trim()) {
    throw new Error(
      "Set LLM_API_KEY or LLM_AUTHORIZATION in .env (project root or server/); see .env.example.",
    );
  }
}

export function assertImageEnv(): void {
  if (!env.imageApiBaseUrl) {
    throw new Error(
      "IMAGE_API_BASE_URL is not set. Set your provider's API root (e.g. https://api.getimg.ai/v2) in .env; see .env.example.",
    );
  }
  if (!env.imageApiKey) {
    throw new Error(
      "IMAGE_API_KEY is not set. Add it to .env (project root or server/); see .env.example.",
    );
  }
}
