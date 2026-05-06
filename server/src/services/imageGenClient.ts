import { Service } from "@volcengine/openapi";
import sharp from "sharp";
import { assertImageEnv, env } from "../config/env.js";
import {
  layoutToAspectRatio,
  qualityToImageResolution,
  resolveIllustrationDimensions,
  type IllustrationLayoutId,
  type IllustrationQualityTier,
} from "../illustrationOutputDims.js";

export class ImageGenError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

/** `instanceof` can fail across some loaders; duck-type for route handlers. */
export function isImageGenError(e: unknown): e is ImageGenError {
  if (e instanceof ImageGenError) {
    return true;
  }
  if (typeof e !== "object" || e === null) {
    return false;
  }
  const x = e as Record<string, unknown>;
  return (
    x.name === "ImageGenError" &&
    typeof x.statusCode === "number" &&
    typeof x.code === "string" &&
    typeof x.message === "string"
  );
}

export type ImageGenerateInput = {
  prompt: string;
  /**
   * Up to 10 reference images: public https URLs, or data:image/*;base64,...
   * (chained UI). Volc cannot GET data URLs; server maps them to binary_data_base64.
   */
  referenceImageUrls?: string[];
  /** Output aspect bucket; default landscape 4:3. */
  layoutPreset?: IllustrationLayoutId;
  /** standard (default) vs high pixel counts. */
  qualityTier?: IllustrationQualityTier;
};

/** Millisecond breakdown returned from POST /api/images/generate (server-measured). */
export type ImageGenerationTimings = {
  provider: "volc" | "getimg";
  /** CVSync2AsyncSubmitTask round-trip only. */
  volcSubmitMs?: number;
  /** Sum of CVSync2AsyncGetResult HTTP round-trips. */
  volcPollHttpMs?: number;
  /** Time spent sleeping between poll attempts. */
  volcPollSleepMs?: number;
  volcPollAttempts?: number;
  /** getimg (or compatible) single upstream POST including body read. */
  getimgUpstreamMs?: number;
  /** Entire server-side image generation function. */
  serverTotalMs: number;
};

export type ImageGenerationResult = {
  imageUrl?: string;
  b64Json?: string;
  timings: ImageGenerationTimings;
};

function logImageGenServer(tag: string, timings: ImageGenerationTimings): void {
  console.info(
    `[imageGen] ${tag}`,
    JSON.stringify({ ...timings, serverTotalSec: timings.serverTotalMs / 1000 }),
  );
}

type ProviderResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

/** True when Volcengine Visual AK/SK are set (Jimeng async path). */
export function isVolcImageGenerationConfigured(): boolean {
  return Boolean(env.volcAccessKey && env.volcSecretKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Volc/Jimeng often returns a generic English line — append actionable hints (Chinese). */
function enrichVolcUserFacingMessage(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return raw;
  }
  if (t.includes("多为即梦/火山侧")) {
    return raw;
  }
  const head = t.slice(0, 240);
  if (
    /\binternal error\b/i.test(head) ||
    /\binternal server error\b/i.test(head)
  ) {
    return `${t}（多为即梦/火山侧瞬时故障、限流或内容安全策略；可 1–2 分钟后重试，或略缩短画风与全书描述、暂时去掉主人公参考图再试。若已很简单仍失败，请核对 .env 里 VOLC_VISUAL_REQ_KEY、VOLC_REGION 与控制台一致，账号/套餐有余额；下方若有 RequestId 可提供给火山工单。完整 JSON 见运行 server 的终端 [imageGen] 日志。）`;
  }
  return raw;
}

/**
 * Only retry transport/submit flakiness. Do NOT retry VOLC_TASK / VOLC_API:
 * Jimeng already decided the task failed — resubmitting multiplies SubmitTask calls,
 * triggers burst limits, and surfaces the same Internal Error three times.
 */
function isRetryableVolcTransientFailure(e: unknown): boolean {
  if (!isImageGenError(e)) {
    return false;
  }
  const retryCodes = new Set(["VOLC_SDK", "VOLC_SUBMIT"]);
  if (!retryCodes.has(e.code)) {
    return false;
  }
  const m = e.message;
  return (
    /\binternal error\b/i.test(m) ||
    /\binternal server error\b/i.test(m) ||
    /\brate limit\b/i.test(m) ||
    /\b429\b/.test(m) ||
    /too many requests/i.test(m) ||
    /\b503\b/.test(m) ||
    /service unavailable/i.test(m) ||
    /temporarily unavailable/i.test(m) ||
    /\beconnreset\b/i.test(m) ||
    /\betimedout\b/i.test(m)
  );
}

/** Jimeng often returns generic Internal Error when prompt is huge; Zod allows 20k — keep tail (page line, instructions). */
function truncateImagePromptForProvider(
  prompt: string,
  maxChars: number,
): { text: string; wasTruncated: boolean; originalLen: number } {
  const originalLen = prompt.length;
  if (originalLen <= maxChars) {
    return { text: prompt, wasTruncated: false, originalLen };
  }
  const notice =
    "[Server: prompt shortened — trim 画风 / 全书剧情 in 配图准备 if results drift.]\n\n";
  const budget = maxChars - notice.length;
  if (budget < 400) {
    return {
      text: prompt.slice(-maxChars),
      wasTruncated: true,
      originalLen,
    };
  }
  return {
    text: notice + prompt.slice(-budget),
    wasTruncated: true,
    originalLen,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function throwIfVolcResponseMetadataError(body: unknown): void {
  const root = asRecord(body);
  const meta = root ? asRecord(root.ResponseMetadata) : null;
  const err = meta ? asRecord(meta.Error) : null;
  if (!err) {
    return;
  }
  const msg =
    typeof err.Message === "string"
      ? err.Message
      : typeof err.Code === "string"
        ? err.Code
        : "Volcengine Visual API error";
  throw new ImageGenError(502, "VOLC_API", enrichVolcUserFacingMessage(msg));
}

/** Flat JSON from Visual: { code, data, message, status, ... } (code/status 10000 = success). */
/** Some Visual responses nest payload in `data` as a JSON string (GetResult). */
function unwrapVolcRootData(
  root: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!root) {
    return null;
  }
  const d = root.data;
  if (typeof d !== "string") {
    return root;
  }
  try {
    const parsed = JSON.parse(d) as unknown;
    const dr = asRecord(parsed);
    const out: Record<string, unknown> = { ...root, data: parsed };
    if (dr) {
      Object.assign(out, dr);
    }
    return out;
  } catch {
    return root;
  }
}

function throwIfVolcFlatEnvelopeError(body: unknown): void {
  const root = asRecord(body);
  if (!root) {
    return;
  }
  const c = root.code ?? root.Code;
  if (typeof c === "number" && c !== 10000 && c !== 0) {
    const msg =
      typeof root.message === "string" ? root.message : `Volc API code ${c}`;
    throw new ImageGenError(502, "VOLC_API", enrichVolcUserFacingMessage(msg));
  }
  const s = root.status ?? root.Status;
  if (
    typeof s === "number" &&
    s !== 10000 &&
    s !== 0 &&
    (c === undefined || c === null)
  ) {
    const msg =
      typeof root.message === "string" ? root.message : `Volc API status ${s}`;
    throw new ImageGenError(502, "VOLC_API", enrichVolcUserFacingMessage(msg));
  }
}

/**
 * CVSync2AsyncGetResult often returns code/status 50500 + data:null + "Internal Error"
 * while the async task is not yet queryable (same class of issue as polling too soon after submit).
 * Retry GetResult with the same task_id instead of failing the whole request.
 */
function volcGetResultEnvelopeNumericCode(raw: unknown): number | undefined {
  const root = asRecord(raw);
  if (!root) {
    return undefined;
  }
  const c = root.code ?? root.Code ?? root.status ?? root.Status;
  if (typeof c === "number" && Number.isFinite(c)) {
    return c;
  }
  if (typeof c === "string" && c.trim() !== "") {
    const n = Number(c);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function shouldRetryVolcGetResultEnvelope(raw: unknown): boolean {
  return volcGetResultEnvelopeNumericCode(raw) === 50500;
}

function volcExtractRequestIdFromRaw(raw: unknown): string | undefined {
  const root = asRecord(raw);
  if (!root) {
    return undefined;
  }
  const id = root.request_id ?? root.RequestId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function pickTaskIdFromSubmit(body: unknown): string | undefined {
  throwIfVolcResponseMetadataError(body);
  throwIfVolcFlatEnvelopeError(body);
  const root = unwrapVolcRootData(asRecord(body));
  if (!root) {
    return undefined;
  }
  // Jimeng / Visual often returns: { "code":10000,"data":{"task_id":"..."}, ... }
  const flatData = asRecord(root.data);
  if (flatData) {
    const tid = flatData.task_id ?? flatData.TaskId;
    if (typeof tid === "string" && tid.trim()) {
      return tid.trim();
    }
  }
  const result = asRecord(root.Result);
  if (!result) {
    return undefined;
  }
  const direct = result.TaskId ?? result.task_id;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  let nested = result.RespJson ?? result.resp_json ?? result.data;
  if (typeof nested === "string") {
    try {
      nested = JSON.parse(nested) as unknown;
    } catch {
      nested = undefined;
    }
  }
  const nr = asRecord(nested);
  const data = nr ? asRecord(nr.data) : null;
  const id = data?.task_id ?? nr?.task_id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function collectHttpUrls(obj: Record<string, unknown>): string[] {
  const out: string[] = [];
  const keys = [
    "image_urls",
    "ImageURLs",
    "urls",
    "output_images",
    "images",
    "result_urls",
  ];
  for (const k of keys) {
    const v = obj[k];
    if (!Array.isArray(v)) {
      continue;
    }
    for (const item of v) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) {
        out.push(item);
      } else {
        const ir = asRecord(item);
        const u = ir?.url ?? ir?.Url;
        if (typeof u === "string" && /^https?:\/\//i.test(u)) {
          out.push(u);
        }
      }
    }
  }
  const single =
    obj.result_url ??
    obj.ResultUrl ??
    obj.image_url ??
    obj.ImageUrl ??
    obj.image ??
    obj.Image ??
    obj.url ??
    obj.Url;
  if (typeof single === "string" && /^https?:\/\//i.test(single)) {
    out.push(single);
  }
  return out;
}

/** Walk full JSON — Visual/Jimeng often nests URLs under data.result / output / etc. */
function scrapeVolcMedia(root: unknown): { urls: string[]; b64?: string } {
  const urls = new Set<string>();
  let b64: string | undefined;
  const walk = (v: unknown, depth: number) => {
    if (depth > 14 || v == null) {
      return;
    }
    if (typeof v === "string") {
      if (/^https?:\/\//i.test(v)) {
        urls.add(v);
      }
      return;
    }
    if (typeof v !== "object") {
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        walk(x, depth + 1);
      }
      return;
    }
    const o = v as Record<string, unknown>;
    for (const u of collectHttpUrls(o)) {
      urls.add(u);
    }
    const pb = pickBase64(o);
    if (pb) {
      b64 = pb;
    }
    for (const k of Object.keys(o)) {
      walk(o[k], depth + 1);
    }
  };
  walk(root, 0);
  return { urls: [...urls], b64 };
}

function mergeNestedResultFields(rr: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...rr };
  let nested = rr.data ?? rr.resp_json ?? rr.RespJson ?? rr.Result;
  if (typeof nested === "string") {
    try {
      nested = JSON.parse(nested) as unknown;
    } catch {
      nested = undefined;
    }
  }
  const nr = asRecord(nested);
  if (nr) {
    Object.assign(merged, nr);
  }
  const respData = merged.resp_data ?? merged.RespData;
  if (typeof respData === "string") {
    try {
      const pr = asRecord(JSON.parse(respData) as unknown);
      if (pr) {
        Object.assign(merged, pr);
      }
    } catch {
      // ignore
    }
  }
  return merged;
}

function pickBase64(obj: Record<string, unknown>): string | undefined {
  const keys = [
    "binary_data_base64",
    "BinaryDataBase64",
    "image_base64",
    "ImageBase64",
    "base64",
  ];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 80) {
      return v;
    }
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string" && v[0].length > 80) {
      return v[0];
    }
  }
  return undefined;
}

function normStatus(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

/** Attach RequestId / nested codes so generic "Internal Error" is diagnosable. */
function buildVolcTaskFailureDetail(
  primary: string | undefined,
  rr: Record<string, unknown>,
  rawBody: unknown,
): string {
  const base = (primary ?? "Task failed").trim() || "Task failed";
  const parts: string[] = [base];
  const root = asRecord(rawBody);
  const reqId =
    (root && typeof root.RequestId === "string" && root.RequestId.trim()) ||
    (root && typeof root.request_id === "string" && root.request_id.trim()) ||
    undefined;
  if (reqId) {
    parts.push(`RequestId=${reqId}`);
  }
  const meta = root ? asRecord(root.ResponseMetadata) : null;
  const rid2 =
    meta && typeof meta.RequestId === "string" ? meta.RequestId.trim() : "";
  if (rid2 && rid2 !== reqId) {
    parts.push(`ResponseMetadata.RequestId=${rid2}`);
  }
  const code = rr.code ?? rr.Code;
  if (typeof code === "number" && code !== 10000 && code !== 0) {
    parts.push(`resultCode=${code}`);
  }
  for (const k of [
    "status_description",
    "StatusDescription",
    "failed_reason",
    "FailedReason",
    "reason",
    "Reason",
    "audit_detail",
    "AuditDetail",
    "filter_detail",
    "FilterMsg",
  ] as const) {
    const v = rr[k];
    if (typeof v === "string" && v.trim()) {
      parts.push(`${k}=${v.trim().slice(0, 280)}`);
    }
  }
  if (parts.length <= 2) {
    parts.push(`mergedKeys=${Object.keys(rr).slice(0, 40).join(",")}`);
  }
  const joined = parts.join(" | ");
  return joined.length > 2400 ? `${joined.slice(0, 2400)}…` : joined;
}

function parseVolcGetResult(body: unknown): {
  phase: "running" | "success" | "failed";
  imageUrl?: string;
  b64Json?: string;
  message?: string;
} {
  throwIfVolcResponseMetadataError(body);
  throwIfVolcFlatEnvelopeError(body);
  const root0 = asRecord(body);
  if (!root0) {
    return { phase: "running" };
  }
  const root = unwrapVolcRootData(root0) ?? root0;

  // Prefer OpenAPI Result; else flat { data: { ... } } same as submit response
  let rr = asRecord(root.Result) ?? root;
  rr = mergeNestedResultFields(rr);

  // Volc image async: lifecycle lives in data.status (merged into rr.status as string), e.g.
  // in_queue | generating | done | not_found (see 图像生成大模型 sync2async docs).
  const taskStatus =
    rr.TaskStatus ??
    rr.task_status ??
    rr.TaskState ??
    rr.task_state ??
    rr.taskStatus ??
    rr.generate_status ??
    rr.process_status ??
    (typeof rr.status === "string" ? rr.status : undefined);
  const ns = normStatus(taskStatus);
  const statusStr =
    typeof rr.status === "string"
      ? normStatus(rr.status)
      : typeof rr.Status === "string"
        ? normStatus(rr.Status)
        : "";
  const msg =
    (typeof rr.message === "string" && rr.message) ||
    (typeof rr.StatusMessage === "string" && rr.StatusMessage) ||
    (typeof rr.error_msg === "string" && rr.error_msg) ||
    (typeof rr.err_msg === "string" && rr.err_msg) ||
    undefined;

  const scrapedBody = scrapeVolcMedia(body);
  const scrapedRoot = scrapeVolcMedia(root);
  const urlSet = new Set<string>([
    ...collectHttpUrls(rr),
    ...scrapedBody.urls,
    ...scrapedRoot.urls,
  ]);
  const urls = [...urlSet];
  const b64Json = pickBase64(rr) ?? scrapedBody.b64 ?? scrapedRoot.b64;

  const abr = asRecord(rr.algorithm_base_resp ?? rr.AlgorithmBaseResp);
  if (
    abr &&
    typeof abr.status_code === "number" &&
    abr.status_code !== 0
  ) {
    const sm = abr.status_message ?? abr.StatusMessage;
    return {
      phase: "failed",
      message: enrichVolcUserFacingMessage(
        buildVolcTaskFailureDetail(
          typeof sm === "string"
            ? sm
            : `algorithm_base_resp status_code=${abr.status_code}`,
          rr,
          root0,
        ),
      ),
    };
  }

  if (
    ns === "failed" ||
    ns === "fail" ||
    ns === "error" ||
    ns === "cancelled" ||
    ns === "canceled" ||
    ns === "not_found" ||
    statusStr === "failed" ||
    statusStr === "error" ||
    statusStr === "not_found"
  ) {
    return {
      phase: "failed",
      message: enrichVolcUserFacingMessage(
        buildVolcTaskFailureDetail(msg, rr, root0),
      ),
    };
  }

  const imageUrl = urls[0];
  if (imageUrl || b64Json) {
    return { phase: "success", imageUrl, b64Json };
  }

  // Numeric task_state (e.g. some Visual APIs): treat known failure codes as failed
  const tsNum = Number(taskStatus);
  if (Number.isFinite(tsNum) && tsNum < 0) {
    return {
      phase: "failed",
      message: enrichVolcUserFacingMessage(
        buildVolcTaskFailureDetail(
          msg ?? "Task failed (numeric state)",
          rr,
          root0,
        ),
      ),
    };
  }

  // Terminal success state but still no media — do not spin until global timeout
  if (
    ns === "done" ||
    ns === "success" ||
    ns === "succeed" ||
    ns === "finished" ||
    ns === "complete" ||
    statusStr === "success" ||
    statusStr === "done"
  ) {
    return {
      phase: "failed",
      message: enrichVolcUserFacingMessage(
        buildVolcTaskFailureDetail(
          msg ??
            "Task reported done/success but no image URL or base64 (check data.image_urls / resp_data in raw response).",
          rr,
          root0,
        ),
      ),
    };
  }

  return { phase: "running" };
}

function createVolcVisualService(): Service {
  const svc = new Service({
    host: "visual.volcengineapi.com",
    serviceName: "cv",
    region: env.volcRegion,
    protocol: "https:",
    defaultVersion: "2022-08-31",
    accessKeyId: env.volcAccessKey,
    secretKey: env.volcSecretKey,
  });
  return svc;
}

/** Volc reference pipeline: keep decoded JPEG under this to avoid "invalid binary data file size". */
const VOLC_REF_MAX_EDGE = 1536;
const VOLC_REF_MAX_JPEG_BYTES = 2_400_000;

/**
 * Re-decode and emit baseline JPEG so Volc gets a supported type/size (UI may label any b64 as jpeg).
 */
async function normalizeReferenceBase64ForVolc(b64: string): Promise<string> {
  const stripped = b64.replace(/\s/g, "");
  if (!stripped) {
    throw new ImageGenError(
      400,
      "INVALID_REF_IMAGE",
      "Reference data URL has empty base64 payload.",
    );
  }
  let input: Buffer;
  try {
    input = Buffer.from(stripped, "base64");
  } catch {
    throw new ImageGenError(
      400,
      "INVALID_REF_IMAGE",
      "Invalid base64 in reference image.",
    );
  }
  if (input.length < 24) {
    throw new ImageGenError(
      400,
      "INVALID_REF_IMAGE",
      "Reference image buffer is too small.",
    );
  }
  const edges = [VOLC_REF_MAX_EDGE, 1280, 1024, 896, 768, 640];
  const qualities = [88, 82, 76, 70, 64, 58, 52];
  let lastErr: unknown;
  for (const maxEdge of edges) {
    for (const quality of qualities) {
      try {
        const buf = await sharp(input)
          .rotate()
          .resize(maxEdge, maxEdge, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        if (buf.length <= VOLC_REF_MAX_JPEG_BYTES) {
          return buf.toString("base64");
        }
      } catch (e) {
        lastErr = e;
      }
    }
  }
  const hint =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "");
  throw new ImageGenError(
    400,
    "INVALID_REF_IMAGE",
    hint
      ? `Could not normalize reference image for Volc: ${hint}`
      : "Could not normalize reference image small enough for the image API; try regenerating the previous page.",
  );
}

/**
 * Volc Visual downloads each `image_urls` entry via HTTP. data: URIs are not fetchable;
 * pack them into `binary_data_base64` and use uri://binary_data?index=N placeholders.
 * Data URLs are re-encoded to JPEG (correct magic bytes + size cap) before submit.
 */
async function prepareVolcReferencePayload(refs: string[]): Promise<{
  image_urls: string[];
  binary_data_base64?: string[];
}> {
  const binary_data_base64: string[] = [];
  const image_urls: string[] = [];
  for (const raw of refs) {
    const u = raw.trim();
    if (!u) {
      continue;
    }
    const dataMatch = u.match(/^data:image\/[\w.+-]+;base64,(.+)$/i);
    if (dataMatch) {
      const normalized = await normalizeReferenceBase64ForVolc(dataMatch[1]!);
      const idx = binary_data_base64.length;
      binary_data_base64.push(normalized);
      image_urls.push(`uri://binary_data?index=${idx}`);
      continue;
    }
    if (/^https?:\/\//i.test(u)) {
      image_urls.push(u);
      continue;
    }
    throw new ImageGenError(
      400,
      "INVALID_REF_IMAGE",
      "Reference image must be https/http URL or data:image/*;base64,... (blob: and file paths are not supported).",
    );
  }
  if (binary_data_base64.length > 0) {
    return { image_urls, binary_data_base64 };
  }
  return { image_urls };
}

async function callVolcJimengImageGenerationOnce(
  input: ImageGenerateInput,
): Promise<ImageGenerationResult> {
  const serverStart = Date.now();
  if (!env.volcAccessKey || !env.volcSecretKey) {
    throw new ImageGenError(
      503,
      "VOLC_DISABLED",
      "Set VOLC_ACCESS_KEY and VOLC_SECRET_KEY for Jimeng / Volcengine Visual.",
    );
  }
  if (input.referenceImageUrls && input.referenceImageUrls.length > 10) {
    throw new ImageGenError(400, "INVALID_INPUT", "At most 10 reference images");
  }

  try {
  const visual = createVolcVisualService();
  const submitTask = visual.createJSONAPI("CVSync2AsyncSubmitTask", {
    Version: "2022-08-31",
  });
  const getResult = visual.createJSONAPI("CVSync2AsyncGetResult", {
    Version: "2022-08-31",
  });

  const { width, height } = resolveIllustrationDimensions(
    input.layoutPreset,
    input.qualityTier,
  );
  const promptApplied = truncateImagePromptForProvider(
    input.prompt,
    env.imagePromptMaxChars,
  );
  if (promptApplied.wasTruncated) {
    console.warn(
      `[imageGen] prompt truncated originalLen=${promptApplied.originalLen} sentLen=${promptApplied.text.length} max=${env.imagePromptMaxChars}`,
    );
  }
  const payload: Record<string, unknown> = {
    req_key: env.volcVisualReqKey,
    prompt: promptApplied.text,
    width,
    height,
  };
  const refs = input.referenceImageUrls
    ?.map((u) => u.trim())
    .filter(Boolean);
  if (refs && refs.length > 0) {
    const packed = await prepareVolcReferencePayload(refs);
    payload.image_urls = packed.image_urls;
    if (packed.binary_data_base64) {
      payload.binary_data_base64 = packed.binary_data_base64;
    }
  }

  const refMeta = (input.referenceImageUrls ?? []).map((s) => s.length);
  console.info(
    `[imageGen] volc submit prep promptLen=${promptApplied.text.length}${promptApplied.wasTruncated ? ` (was ${promptApplied.originalLen})` : ""} refUrls=${refMeta.length} refCharCounts=${JSON.stringify(refMeta)} req_key=${env.volcVisualReqKey}`,
  );

  const submitStarted = Date.now();
  const submitRaw = await submitTask(payload, {
    Action: "CVSync2AsyncSubmitTask",
    timeout: 120_000,
  });
  const volcSubmitMs = Date.now() - submitStarted;
  const taskId = pickTaskIdFromSubmit(submitRaw);
  if (!taskId) {
    const preview =
      typeof submitRaw === "object"
        ? JSON.stringify(submitRaw).slice(0, 800)
        : String(submitRaw).slice(0, 800);
    throw new ImageGenError(
      502,
      "VOLC_SUBMIT",
      `Volcengine submit did not return a task id: ${preview}`,
    );
  }

  if (env.volcImageSubmitGraceMs > 0) {
    console.info(
      `[imageGen] volc submit ok task_id=${String(taskId).slice(0, 12)}… sleeping ${env.volcImageSubmitGraceMs}ms before first GetResult`,
    );
    await sleep(env.volcImageSubmitGraceMs);
  }

  const interval = env.volcImagePollIntervalMs;
  const max = env.volcImagePollMaxAttempts;
  const earlyFloor = env.volcImageEarlyPollFloorMs;
  const earlyBoost = env.volcImageEarlyPollBoostCount;
  let volcPollHttpMs = 0;
  let volcPollSleepMs = 0;
  let volcPollAttempts = 0;
  let consecutive50500 = 0;

  for (let attempt = 0; attempt < max; attempt++) {
    if (attempt > 0) {
      const s0 = Date.now();
      const gap =
        earlyBoost > 0 && attempt <= earlyBoost
          ? Math.max(interval, earlyFloor)
          : interval;
      await sleep(gap);
      volcPollSleepMs += Date.now() - s0;
    }
    const queryPayload: Record<string, unknown> = {
      req_key: env.volcVisualReqKey,
      task_id: taskId,
      TaskId: taskId,
    };
    const g0 = Date.now();
    let raw: unknown;
    try {
      raw = await getResult(queryPayload, {
        Action: "CVSync2AsyncGetResult",
        timeout: 120_000,
      });
    } catch (getErr) {
      const tid = String(taskId);
      const errMsg =
        getErr instanceof Error ? getErr.message : String(getErr ?? "");
      console.info(
        `[imageGen] GetResult SDK/HTTP error at poll ${attempt + 1}/${max} task_id=${tid.slice(0, 16)}… ${errMsg.slice(0, 500)}`,
      );
      console.info("[imageGen] GetResult SDK/HTTP error (full):", getErr);
      throw getErr;
    }
    volcPollHttpMs += Date.now() - g0;
    volcPollAttempts += 1;
    let parsed: ReturnType<typeof parseVolcGetResult>;
    try {
      parsed = parseVolcGetResult(raw);
      consecutive50500 = 0;
    } catch (e) {
      if (isImageGenError(e) && e.code === "VOLC_API") {
        if (shouldRetryVolcGetResultEnvelope(raw)) {
          consecutive50500 += 1;
          const cap = env.volcGetResult50500MaxConsecutive;
          if (consecutive50500 >= cap) {
            const rid = volcExtractRequestIdFromRaw(raw);
            throw new ImageGenError(
              502,
              "VOLC_API",
              enrichVolcUserFacingMessage(
                `GetResult 已连续 ${consecutive50500} 次返回 50500（ECInternal / 服务器内部错误，data 为空）。火山 AI 中台公用错误码表对该码的建议为「提工单」，勿依赖无限轮询。请附带 task_id=${String(taskId)}${rid ? `、request_id=${rid}` : ""}。可选自检：VOLC_REGION、VOLC_VISUAL_REQ_KEY 与控制台一致，账号套餐与余额。如需临时放宽连续轮询上限可设 VOLC_GETRESULT_50500_MAX_CONSECUTIVE（当前 ${cap}）。`,
              ),
            );
          }
          const log50500 =
            consecutive50500 <= 3 ||
            consecutive50500 % 8 === 0 ||
            consecutive50500 >= cap - 3;
          if (log50500) {
            console.info(
              `[imageGen] GetResult 50500 consecutive ${consecutive50500}/${cap}; retry poll ${attempt + 2}/${max} task_id=${String(taskId).slice(0, 16)}…`,
            );
          }
          continue;
        }
        const tidShort = String(taskId).slice(0, 24);
        const msgOneLine = e.message.replace(/\s+/g, " ").trim().slice(0, 900);
        console.info(
          `[imageGen] VOLC_API envelope (GetResult) task_id=${tidShort}… poll=${attempt + 1}/${max} | ${msgOneLine}`,
        );
        console.info(
          "[imageGen] VOLC_API GetResult raw (truncated):",
          typeof raw === "object"
            ? JSON.stringify(raw).slice(0, 14_000)
            : String(raw).slice(0, 2000),
        );
      }
      throw e;
    }
    if (
      parsed.phase === "running" &&
      (attempt === 0 || (attempt + 1) % 10 === 0)
    ) {
      const rk =
        raw && typeof raw === "object"
          ? Object.keys(raw as object).join(",")
          : "?";
      const rawRec = asRecord(raw);
      const d = rawRec ? asRecord(rawRec.data) : null;
      const dkeys = d ? Object.keys(d).join(",") : "(no data object)";
      const st =
        d && typeof d.status === "string"
          ? d.status
          : typeof rawRec?.status === "string"
            ? rawRec.status
            : JSON.stringify(rawRec?.status ?? null);
      console.info(
        `[imageGen] poll ${attempt + 1}/${max} still running topKeys=${rk} data.keys=${dkeys} statusProbe=${st}`,
      );
    }
    if (parsed.phase === "failed") {
      const tidShort = String(taskId).slice(0, 24);
      const msgOneLine = (parsed.message ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
      console.info(
        `[imageGen] VOLC_TASK summary task_id=${tidShort}… poll=${attempt + 1}/${max} | ${msgOneLine || "(no message)"}`,
      );
      console.info(
        "[imageGen] VOLC_TASK GetResult raw (truncated):",
        typeof raw === "object"
          ? JSON.stringify(raw).slice(0, 14_000)
          : String(raw).slice(0, 2000),
      );
      throw new ImageGenError(
        502,
        "VOLC_TASK",
        enrichVolcUserFacingMessage(parsed.message ?? "Image task failed"),
      );
    }
    if (parsed.phase === "success") {
      const serverTotalMs = Date.now() - serverStart;
      const timings: ImageGenerationTimings = {
        provider: "volc",
        volcSubmitMs,
        volcPollHttpMs,
        volcPollSleepMs,
        volcPollAttempts,
        serverTotalMs,
      };
      logImageGenServer("volc ok", timings);
      return {
        imageUrl: parsed.imageUrl,
        b64Json: parsed.b64Json,
        timings,
      };
    }
  }

  throw new ImageGenError(
    504,
    "VOLC_TIMEOUT",
    `Image task timed out after ${max} polls (${interval}ms interval).`,
  );
  } catch (e) {
    if (isImageGenError(e)) {
      throw e;
    }
    let detail = e instanceof Error ? e.message : String(e);
    if (e && typeof e === "object" && "response" in e) {
      const ax = e as { response?: { data?: unknown; status?: number } };
      const data = ax.response?.data;
      const extra =
        typeof data === "string"
          ? data.slice(0, 1200)
          : data !== undefined
            ? JSON.stringify(data).slice(0, 1200)
            : "";
      if (extra) {
        detail = `${detail} | upstream: ${extra}`;
      }
    }
    throw new ImageGenError(
      502,
      "VOLC_SDK",
      enrichVolcUserFacingMessage(detail.slice(0, 4000)),
    );
  }
}

const VOLC_TRANSIENT_MAX_ROUNDS = 2;

async function callVolcJimengImageGeneration(
  input: ImageGenerateInput,
): Promise<ImageGenerationResult> {
  let last: unknown;
  for (let round = 0; round < VOLC_TRANSIENT_MAX_ROUNDS; round++) {
    try {
      if (round > 0) {
        const pauseMs = 2500 + (round - 1) * 2500;
        console.info(
          `[imageGen] volc transient retry round ${round + 1}/${VOLC_TRANSIENT_MAX_ROUNDS} (pause ${pauseMs}ms)`,
        );
        await sleep(pauseMs);
      }
      return await callVolcJimengImageGenerationOnce(input);
    } catch (e) {
      last = e;
      const canRetry = isRetryableVolcTransientFailure(e);
      const exhausted = round === VOLC_TRANSIENT_MAX_ROUNDS - 1;
      if (!canRetry || exhausted) {
        if (canRetry && exhausted && isImageGenError(e)) {
          throw new ImageGenError(
            e.statusCode,
            e.code,
            `${e.message}（服务端已对该类瞬时错误自动重试 ${VOLC_TRANSIENT_MAX_ROUNDS} 次仍失败。）`,
          );
        }
        throw e;
      }
    }
  }
  throw last;
}

/**
 * Image generation: Volcengine Visual (Jimeng async) when AK/SK are set;
 * otherwise SeeDream / getimg-style POST .../images/generations.
 */
export async function callImageGeneration(
  input: ImageGenerateInput,
): Promise<ImageGenerationResult> {
  if (isVolcImageGenerationConfigured()) {
    return callVolcJimengImageGeneration(input);
  }

  try {
    assertImageEnv();
    const serverStart = Date.now();
    const endpoint = `${env.imageApiBaseUrl}/images/generations`;
    const pt = truncateImagePromptForProvider(
      input.prompt,
      env.imagePromptMaxChars,
    );
    if (pt.wasTruncated) {
      console.warn(
        `[imageGen] getimg prompt truncated ${pt.originalLen} -> ${pt.text.length}`,
      );
    }
    const body: Record<string, unknown> = {
      model: env.imageModel,
      prompt: pt.text,
      aspect_ratio: layoutToAspectRatio(input.layoutPreset),
      resolution: qualityToImageResolution(input.qualityTier),
      output_format: env.imageOutputFormat,
    };
    if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
      if (input.referenceImageUrls.length > 10) {
        throw new ImageGenError(400, "INVALID_INPUT", "At most 10 reference images");
      }
      body.images = input.referenceImageUrls.map((url) => ({ url: url.trim() }));
    }

    const upstreamStart = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.imageApiKey}`,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    const getimgUpstreamMs = Date.now() - upstreamStart;
    let json: ProviderResponse;
    try {
      json = JSON.parse(raw) as ProviderResponse;
    } catch {
      throw new ImageGenError(
        502,
        "UPSTREAM",
        `Image API did not return JSON: ${raw.slice(0, 500)}`,
      );
    }
    if (!res.ok) {
      const msg =
        json.error?.message ?? json.message ?? res.statusText ?? "Image API error";
      throw new ImageGenError(res.status, "IMAGE_API", msg);
    }
    const first = json.data?.[0];
    if (!first) {
      throw new ImageGenError(502, "EMPTY", "Image API returned no data[] entry");
    }
    const serverTotalMs = Date.now() - serverStart;
    const timings: ImageGenerationTimings = {
      provider: "getimg",
      getimgUpstreamMs,
      serverTotalMs,
    };
    logImageGenServer("getimg ok", timings);
    return { imageUrl: first.url, b64Json: first.b64_json, timings };
  } catch (e) {
    if (isImageGenError(e)) {
      throw e;
    }
    throw new ImageGenError(
      502,
      "IMAGE_UPSTREAM",
      e instanceof Error ? e.message : String(e),
    );
  }
}
