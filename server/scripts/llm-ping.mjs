/**
 * Minimal chat/completions probe — same env as the server (server/.env + parent .env).
 * Run from repo root: npm run llm:ping
 * Or: cd server && npm run llm:ping
 * (Uses Node only, not tsx; any [tsx] lines in the terminal come from `npm run dev` in the same panel.)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const _serverDir = path.join(_dir, "..");
const _parentEnv = path.join(_serverDir, "..", ".env");
const _serverEnv = path.join(_serverDir, ".env");
config({ path: _parentEnv });
config({ path: _serverEnv });

if (process.env.LLM_PING_QUIET !== "1") {
  console.error(
    "[llm:ping] Node only (not tsx). If you see [tsx] … Killing process, that is from `npm run dev` in this or another tab — use a clean terminal, or `LLM_PING_QUIET=1` to hide this line.\n",
  );
}

function chatCompletionsUrl(baseUrl) {
  const b = baseUrl.replace(/\/$/, "");
  const withV1 = /\/v1$/i.test(b) ? b : `${b}/v1`;
  return `${withV1}/chat/completions`;
}

const chatOverride = (process.env.LLM_CHAT_COMPLETIONS_URL ?? "").trim();
const base = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const url = chatOverride || (base ? chatCompletionsUrl(base) : "");
if (!url) {
  console.error("Set LLM_BASE_URL and/or LLM_CHAT_COMPLETIONS_URL");
  process.exit(1);
}
const key = (process.env.LLM_API_KEY ?? "").trim();
const authHeader = (process.env.LLM_AUTHORIZATION ?? "").trim();
const useBearer =
  authHeader ||
  process.env.LLM_USE_BEARER === "1" ||
  /^(bearer|authorization)$/i.test((process.env.LLM_API_KEY_HEADER ?? "").trim());
let useApiKey = !useBearer && /^(api-key|azure)$/i.test((process.env.LLM_API_KEY_HEADER ?? "").trim());
if (!authHeader && !useBearer && !useApiKey) {
  try {
    const host = new URL(chatOverride || base).hostname.toLowerCase();
    if (
      host.includes("cognitiveservices.azure.com") ||
      host.endsWith("openai.azure.com")
    ) {
      useApiKey = true;
    }
  } catch {
    /* ignore */
  }
}
if (!authHeader && !key) {
  console.error("Set LLM_API_KEY or LLM_AUTHORIZATION");
  process.exit(1);
}
const modelForPing = process.env.LLM_MODEL ?? "gpt-3.5-turbo";
const omitTemp =
  process.env.LLM_OMIT_TEMPERATURE === "1" ||
  /^gpt-5/i.test(modelForPing.trim());
const model = modelForPing;
const auth = authHeader || (useApiKey ? null : key ? `Bearer ${key}` : null);

const disableMaxTokens = process.env.LLM_DISABLE_MAX_TOKENS === "1";
const maxFromEnv = Number(process.env.LLM_MAX_TOKENS);
const maxTokensBlock =
  disableMaxTokens
    ? {}
    : Number.isFinite(maxFromEnv) && maxFromEnv > 0
      ? { max_tokens: maxFromEnv }
      : {};
const body = {
  model,
  ...(omitTemp ? {} : { temperature: 0.2 }),
  messages: [{ role: "user", content: "Reply with exactly: ok" }],
  ...maxTokensBlock,
};

const json = JSON.stringify(body);
const headers = {
  "Content-Type": "application/json",
};
if (authHeader) {
  headers.Authorization = authHeader;
} else if (useApiKey) {
  headers["api-key"] = key;
} else {
  headers.Authorization = auth;
}
console.log("POST", url);
console.log("auth:", authHeader ? "LLM_AUTHORIZATION" : useApiKey ? "api-key" : "Bearer");
console.log(
  "body chars",
  json.length,
  "temperature:",
  omitTemp ? "(omitted)" : "0.2",
  "max_tokens in body:",
  "max_tokens" in body,
);

const res = await fetch(url, {
  method: "POST",
  headers,
  body: json,
  signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 120_000)),
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 800));
process.exit(res.ok ? 0 : 1);
