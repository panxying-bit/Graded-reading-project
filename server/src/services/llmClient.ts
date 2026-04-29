import {
  assertLlmEnv,
  env,
  llmShouldOmitTemperature,
  llmUsesAzureApiKeyHeader,
  resolveLlmBaseUrlForDisplay,
} from "../config/env.js";
import type { ChatMessage } from "./promptResolver.js";

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; type?: string };
};

/**
 * Resolves OpenAI-style POST /v1/chat/completions URL.
 * If LLM_BASE_URL is only the site origin (e.g. https://example.com), append /v1
 * so we do not hit the provider's web app HTML.
 */
function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/$/, "");
  const withV1 = /\/v1$/i.test(b) ? b : `${b}/v1`;
  return `${withV1}/chat/completions`;
}

/**
 * OpenAI-compatible chat.completions call.
 */
export async function callChatCompletions(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    responseFormat?: { type: "json_object" };
  },
): Promise<string> {
  try {
    assertLlmEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new LlmError(503, "CONFIG", msg);
  }
  const url =
    env.llmChatCompletionsUrl || chatCompletionsUrl(env.llmBaseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.llmAuthorization) {
    headers.Authorization = env.llmAuthorization;
  } else if (llmUsesAzureApiKeyHeader()) {
    headers["api-key"] = env.llmApiKey.trim();
  } else {
    headers.Authorization = `Bearer ${env.llmApiKey.trim()}`;
  }
  const body: {
    model: string;
    temperature?: number;
    messages: ChatMessage[];
    max_tokens?: number;
    response_format?: { type: "json_object" };
  } = {
    model: env.llmModel,
    messages,
  };
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }
  if (!llmShouldOmitTemperature()) {
    body.temperature = options?.temperature ?? 0.7;
  }
  if (!env.llmDisableMaxTokens && env.llmMaxTokens != null) {
    body.max_tokens = env.llmMaxTokens;
  }

  const payloadJson = JSON.stringify(body);
  const payloadChars = payloadJson.length;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.llmTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: payloadJson,
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new LlmError(502, "UPSTREAM", `LLM request failed: ${msg}`);
  } finally {
    clearTimeout(t);
  }

  const rawText = await res.text();
  let json: OpenAIChatResponse;
  try {
    json = JSON.parse(rawText) as OpenAIChatResponse;
  } catch {
    const looksLikeHtml = /^\s*<!/i.test(rawText) || /doctype html/i.test(rawText);
    const hint = looksLikeHtml
      ? " (got HTML, not the API: verify LLM_BASE_URL or gateway path, e.g. https://host/v1)"
      : "";
    throw new LlmError(
      502,
      "UPSTREAM",
      `LLM response was not valid JSON${hint}: ${rawText.slice(0, 400)}`,
    );
  }
  if (!res.ok) {
    const errMsg = json.error?.message ?? res.statusText;
    const code = (json.error as { code?: string } | undefined)?.code;
    const parts = [
      `HTTP ${res.status}${code ? ` (${code})` : ""}`,
      errMsg,
    ];
    if (res.status === 503) {
      parts.push(
        `本次 chat/completions 请求 JSON 约 ${payloadChars} 字符（可粗对照 token/网关体长）。`,
      );
      parts.push(
        "可能原因：① 上游/代理**临时**不可用、维护、限流；② 本应用 request 体过大（设 LLM_LEVEL3_OMIT_REFERENCE=1、**LLM_LEVEL3_COMPACT_PROMPT=1** 可明显缩短 Level3 体长；或试 LLM_DISABLE_MAX_TOKENS=1）。`cd server && npm run llm:ping` 若**最小一句**也 503，多为线路/代理商问题。",
      );
    } else if (res.status === 429) {
      const quota =
        code === "insufficient_quota" || /insufficient_quota|exceeded your current quota/i.test(errMsg);
      if (quota) {
        let host = "";
        try {
          host = new URL(resolveLlmBaseUrlForDisplay() || env.llmBaseUrl).host.toLowerCase();
        } catch {
          /* ignore */
        }
        const isOpenAIDirect =
          host === "api.openai.com" || host.endsWith(".openai.com");
        parts.push(
          isOpenAIDirect
            ? "这是 **insufficient_quota**：通常与 Key「拼写对错」无关，表示**本 OpenAI 账户**没有可扣额度（未绑支付方式、试用/免费额度用尽、或 Organization·Project 预算为 0）。请到 https://platform.openai.com 查看 Billing / Usage / Limits，先充值或开通计费后再试。"
            : `接口返回 OpenAI 格式的 **insufficient_quota**。你的 \`LLM_BASE_URL\` 指向 **${host || "（无法解析 host）"}**（非直连官方）。请先到**该代理商 / 镜像站控制台**查余额、套餐是否到期；若对方说明是「上游 OpenAI 欠费」，再让对方或你去 https://platform.openai.com 处理 Billing。`,
        );
      } else {
        parts.push(
          "可能为**速率限制**（request/min 等）。请减少并发、稍后再试，或在本账号配额范围内提升限速档位。",
        );
      }
    } else if (res.status === 401) {
      parts.push(
        "请核对 .env 中的 LLM_API_KEY 或 LLM_AUTHORIZATION 是否与代理商要求一致（未过期、是否需要 Bearer 前缀等）。",
      );
    } else if (
      res.status === 500 ||
      /temporarily unavailable|overloaded|capacity/i.test(errMsg)
    ) {
      parts.push(
        "上游返回繁忙/不可用。请稍后重试；并确认 LLM_BASE_URL 指向可访问的 OpenAI 兼容接口（如 …/v1，而非网页首页）。",
      );
    }
    throw new LlmError(
      res.status === 503 || res.status === 429 ? res.status : 502,
      "UPSTREAM",
      `LLM error: ${parts.join(" ")}`,
    );
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new LlmError(502, "EMPTY", "No text returned from the model");
  }
  return text;
}

export class LlmError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
