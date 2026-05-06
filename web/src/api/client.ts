import type {
  IllustrationLayoutId,
  IllustrationQualityTier,
} from "../data/illustrationOutputPresets";

const BASE = "";

/** Map browser "Failed to fetch" to a fixable hint (backend down, wrong origin, or proxy reset). */
function mapNetworkError(err: unknown, action: string): Error {
  if (err instanceof TypeError) {
    const m = (err.message || "").toLowerCase();
    if (
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("load failed") ||
      m === "aborted" ||
      m.includes("aborted")
    ) {
      return new Error(
        `${action}时无法连接 API。请确认：1) 后端已启动（默认 http://127.0.0.1:3000 ，与 web/.env 的 VITE_DEV_API_PORT 一致）；2) 用 Vite 开发地址打开页面（如 http://127.0.0.1:5173 ），不要直接双击打开 dist；3) 生图走火山即梦时后端可能轮询数分钟，请耐心等待或看终端日志；4) 若仍失败可重试。Vite 代理超时已设为 15 分钟，避免慢请求被代理提前断开。`,
      );
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

export type LevelItem = {
  id: string;
  name: string;
  cefr: string;
  defaultWordCount: number;
  /** Number of lesson slots (e.g. 1..144) for this level. */
  lessonsPerLevel?: number;
};

export type Level3WordCountField = {
  actual: number;
  min: number;
  max: number;
  target: number;
  inRange: boolean;
  /** Follow-up API calls to compress/expand the book JSON for word count. */
  repairRounds: number;
};

export type GenerateResponse = {
  level: string;
  cefr: string;
  text: string;
  /** Present for phased level3 when the server returns word-budget metadata. */
  level3WordCount?: Level3WordCountField;
};

export type LessonPlan = {
  level: string;
  description?: string;
  themeCycle?: string[];
  lessons: Array<{
    lesson: number;
    theme: string;
    lessonTitle?: string;
    suggestedFictionOrNonfiction?: "fiction" | "nonfiction";
  }>;
};

type ApiError = { error?: string; message?: string };

/**
 * When !res.ok: read body once. API often returns JSON; Vite proxy may return HTML
 * or plain text on connection errors — show something actionable instead of only "Internal Server Error".
 */
export async function readApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const t = text.trim();
  let fromJson: ApiError | null = null;
  if (t.startsWith("{")) {
    try {
      fromJson = JSON.parse(t) as ApiError;
    } catch {
      // not JSON
    }
  }
  if (fromJson?.message) {
    return fromJson.message;
  }
  if (fromJson?.error && typeof fromJson.error === "string") {
    return fromJson.error;
  }
  if (/ECONNREFUSED|ECONNRESET|connect ECONNREFUSED/i.test(t)) {
    return `${t.slice(0, 200)}（通常：本机 API 未启动。请在本项目根执行 npm run dev，或另开终端：cd server && npm run dev；并确认 web/.env 的 VITE_DEV_API_PORT 与后端 PORT 一致。）`;
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return `HTTP ${res.status}（代理/网关未连上后端）。请先启动 server（默认 http://127.0.0.1:3000），与 web/.env 的 VITE_DEV_API_PORT 一致。`;
  }
  if (t && !t.startsWith("<") && t.length < 500) {
    return t;
  }
  if (t.startsWith("<") && (res.status === 500 || res.status === 502)) {
    return `HTTP ${res.status}：代理返回了 HTML 错误页，多为 API 未运行或已崩溃。请在终端启动：cd server && npm run dev（或在项目根 npm run dev 同时起前后端），再刷新页面。`;
  }
  if (res.status >= 500 && !t) {
    return `HTTP ${res.status}：服务器返回空正文。请查看运行 API 的终端日志（生图错误多为 VOLC_* / 超时 / SDK 异常）。`;
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function fetchLevels(): Promise<LevelItem[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/levels`);
  } catch (e) {
    throw mapNetworkError(e, "加载级别");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  const data = (await res.json()) as { levels: LevelItem[] };
  return data.levels;
}

/** Per-level curriculum rows (level1 / level2 / level3 / level4 JSON). Returns null if 404. */
export async function fetchLessonPlan(
  levelId: string,
): Promise<LessonPlan | null> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/api/levels/${encodeURIComponent(levelId)}/lessons`,
    );
  } catch (e) {
    throw mapNetworkError(e, "加载课纲");
  }
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as LessonPlan;
}

export async function generateText(body: {
  level: string;
  topic?: string;
  /** Specific lesson title (e.g. from outline). */
  lessonTitle?: string;
  /** Optional outline for the model (any language). */
  contentBrief?: string;
  wordCount?: number;
  /** Selects level3 band (1–48 / 49–96 / 97–144) and reference. */
  lesson?: number;
  fictionOrNonfiction?: "fiction" | "nonfiction";
  structureType?: string;
  /** Optional; English description for the model, e.g. to emphasize a tense. */
  tenseFocus?: string;
  /** Optional; e.g. a fairy tale or a fable — refines subgenre on top of fiction/nonfiction. */
  genreFocus?: string;
  /** Level3 初稿：教师说明（问题/修改方向），首刷或重刷均可。 */
  draftExtraInstructions?: string;
  /** Level3 重刷初稿：当前初稿 JSON，供模型整体重写。 */
  previousDraftText?: string;
}): Promise<GenerateResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "生成课文");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse;
}

/** Level3 stage 1 — long prompt + full reference, story first (no word-repair loop). */
export async function generateDraft(
  body: Parameters<typeof generateText>[0],
): Promise<GenerateResponse & { stage: "draft" }> {
  if (
    body.level !== "level1" &&
    body.level !== "level2" &&
    body.level !== "level3" &&
    body.level !== "level4"
  ) {
    throw new Error("generateDraft 仅支持 level1、level2、level3 或 level4");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "生成初稿");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse & { stage: "draft" };
}

/** Level 1 / 3 stage 2 — fit draft to page/word limits (from edited draft if any). */
export async function generateRefine(body: {
  level: "level1" | "level2" | "level3" | "level4";
  lesson: number;
  draftText: string;
  topic?: string;
  lessonTitle?: string;
  contentBrief?: string;
  fictionOrNonfiction?: "fiction" | "nonfiction";
  structureType?: string;
}): Promise<GenerateResponse & { stage: "refine" }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "精修");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse & { stage: "refine" };
}

/** Level 1 / 3 stage 3 — spelling/grammar pass only; same JSON shape. */
export async function generateProofread(body: {
  level: "level1" | "level2" | "level3" | "level4";
  bookText: string;
  lesson?: number;
  topic?: string;
  lessonTitle?: string;
  contentBrief?: string;
}): Promise<GenerateResponse & { stage: "proofread" }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/proofread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "语言校核");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse & { stage: "proofread" };
}

/** 定稿后：句型结构 + 文中例句 + 同难度变体（与 server/config/sentence-pattern-prompt.md 对齐）。 */
export type SentencePatternResponse = {
  level: string;
  cefr: string;
  pattern: string;
  exampleSentence: string;
  /** True when the model's sentence appears verbatim in the parsed passage. */
  exampleMatchedInText: boolean;
  whyPattern: string;
  variations: string[];
  teachingFocus: string;
};

export async function analyzeSentencePattern(body: {
  level: "level1" | "level2" | "level3" | "level4";
  text: string;
  /** 句型修改说明：对 AI 上一条结果不满意时填写，再重新分析。 */
  patternExtraInstructions?: string;
}): Promise<SentencePatternResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/learning/sentence-pattern`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "句型分析");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as SentencePatternResponse;
}

/** One row from step-1 vocabulary candidate pass (config/prompts/vocab-candidate-prompt.md). */
export type VocabCandidateItem = {
  /** Headword, or 2–4 word fixed phrase when that is the teachable unit (Level 3). */
  word: string;
  sentence: string;
};

export type VocabCandidatesResponse = {
  level: string;
  cefr: string;
  candidates: VocabCandidateItem[];
  /** Level 3 only: items removed because the headword matches L0–L2 Mastery in the wordlist. */
  excludedByPriorMastery?: VocabCandidateItem[];
  /** Human-readable note when exclusions occurred (Level 3). */
  priorMasteryFilterNote?: string;
  /** Headwords that matched another lesson’s 定表 in this level (client may recompute). */
  excludedByOtherLessons?: VocabCandidateItem[];
  otherLessonsFilterNote?: string;
};

/** 定稿后：从正文中筛 5–7 个可教词（提示词会带上本级别他课定表忌用词，服务端 + 本机再硬性去重）。 */
export async function fetchVocabCandidates(body: {
  level: "level1" | "level2" | "level3" | "level4";
  text: string;
  /** Lowercase/trimmed is fine; other lessons' 定表 headwords. */
  excludeHeadwords?: string[];
}): Promise<VocabCandidatesResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/learning/vocab-candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw mapNetworkError(e, "词汇候选");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as VocabCandidatesResponse;
}

export type ReferencePhaseBand = {
  fiction: string;
  nonfiction: string;
};

export type PromptSettingsResponse = {
  levelId: string;
  base: {
    system: string;
    userTemplate: string;
    referencePhases?: {
      early: ReferencePhaseBand;
      mid: ReferencePhaseBand;
      late: ReferencePhaseBand;
    };
  };
  effective: {
    system: string;
    userTemplate: string;
    referencePhases?: {
      early: ReferencePhaseBand;
      mid: ReferencePhaseBand;
      late: ReferencePhaseBand;
    };
  };
  hasOverride: boolean;
};

export async function fetchPromptSettings(
  levelId: string,
): Promise<PromptSettingsResponse> {
  const res = await fetch(
    `${BASE}/api/prompts/${encodeURIComponent(levelId)}`,
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as PromptSettingsResponse;
}

export async function savePromptSettings(
  levelId: string,
  body: {
    system: string;
    userTemplate: string;
    referencePhases?: {
      early: ReferencePhaseBand;
      mid: ReferencePhaseBand;
      late: ReferencePhaseBand;
    };
  },
): Promise<{ message?: string }> {
  const res = await fetch(
    `${BASE}/api/prompts/${encodeURIComponent(levelId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json().catch(() => ({}))) as { message?: string };
}

export async function clearPromptSettings(levelId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/prompts/${encodeURIComponent(levelId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
}

/** Cached: whether POST /api/speech/tts is available (server has AZURE_SPEECH_KEY). */
let ttsEnabledCache: boolean | null = null;
let ttsEnabledPromise: Promise<boolean> | null = null;

export async function getTtsEnabled(): Promise<boolean> {
  if (ttsEnabledCache !== null) {
    return ttsEnabledCache;
  }
  if (!ttsEnabledPromise) {
    ttsEnabledPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/api/speech/tts/enabled`);
        if (!res.ok) {
          return false;
        }
        const data = (await res.json()) as { enabled?: boolean };
        const ok = Boolean(data.enabled);
        ttsEnabledCache = ok;
        return ok;
      } catch {
        ttsEnabledCache = false;
        return false;
      }
    })();
  }
  return ttsEnabledPromise;
}

/** Azure TTS short utterance → MP3 blob. */
export async function fetchTtsBlob(text: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/speech/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    throw mapNetworkError(e, "语音合成");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return res.blob();
}

/** Mirrors server `ImageGenerationTimings` (milliseconds). */
export type ImageGenTimings = {
  provider: "volc" | "getimg";
  volcSubmitMs?: number;
  volcPollHttpMs?: number;
  volcPollSleepMs?: number;
  volcPollAttempts?: number;
  getimgUpstreamMs?: number;
  serverTotalMs: number;
};

export type ImageGenerateResponse = {
  imageUrl?: string;
  b64Json?: string;
  model?: string;
  timings?: ImageGenTimings;
};

/** Browser + Vite proxy must outlast Volc async poll (server default can be ~10+ min). */
const IMAGE_GENERATE_FETCH_TIMEOUT_MS = 900_000;

function enrichVagueImageApiMessage(msg: string): string {
  const t = msg.trim();
  if (!t || t.includes("多为即梦/火山侧")) {
    return msg;
  }
  const head = t.slice(0, 240);
  if (
    /\binternal error\b/i.test(head) ||
    /\binternal server error\b/i.test(head)
  ) {
    return `${t}（多为上游即梦/火山瞬时故障或内容策略；可稍后重试、缩短准备区描述、或暂时去掉主人公参考图。）`;
  }
  return msg;
}

/** POST /api/images/generate — SeeDream / provider-specific image API. */
export async function generateLessonImage(body: {
  prompt: string;
  referenceImageUrls?: string[];
  layoutPreset?: IllustrationLayoutId;
  qualityTier?: IllustrationQualityTier;
}): Promise<ImageGenerateResponse> {
  let res: Response;
  try {
    const signal =
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(IMAGE_GENERATE_FETCH_TIMEOUT_MS)
        : undefined;
    res = await fetch(`${BASE}/api/images/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "AbortError" || e.name === "TimeoutError")
    ) {
      throw new Error(
        "图像生成等待超时（前端 15 分钟）。若使用火山即梦，请在后端调 VOLC_IMAGE_POLL_* 或查看终端日志是否仍在轮询。",
      );
    }
    throw mapNetworkError(e, "图像生成");
  }
  if (!res.ok) {
    const raw = await readApiErrorMessage(res);
    throw new Error(enrichVagueImageApiMessage(raw));
  }
  return (await res.json()) as ImageGenerateResponse;
}

export type ImageGenBackendStatus = {
  enabled: boolean;
  /** Matches server: volc = Jimeng Visual async; getimg = IMAGE_API_* OpenAI-style. */
  provider: "volc" | "getimg" | null;
  /** Matches server `IMAGE_PROMPT_MAX_CHARS` (default 14000). Undefined if endpoint omitted field (older server). */
  promptMaxChars?: number;
  /** Server ignores client prompt/refs; see ILLUSTRATION_DEBUG_MINIMAL_PROMPT in server .env. */
  debugMinimalPromptActive?: boolean;
};

let imageGenStatusCache: ImageGenBackendStatus | null = null;
let imageGenStatusPromise: Promise<ImageGenBackendStatus> | null = null;

/** Call after env/server changes so /api/images/enabled is re-fetched (never cache permanent false). */
export function invalidateImageGenStatusCache(): void {
  imageGenStatusCache = null;
  imageGenStatusPromise = null;
}

export async function getImageGenStatus(): Promise<ImageGenBackendStatus> {
  if (imageGenStatusCache !== null) {
    return imageGenStatusCache;
  }
  if (!imageGenStatusPromise) {
    imageGenStatusPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/api/images/enabled`);
        if (!res.ok) {
          return { enabled: false, provider: null };
        }
        const data = (await res.json()) as {
          enabled?: boolean;
          provider?: "volc" | "getimg" | null;
          promptMaxChars?: number;
          debugMinimalPromptActive?: boolean;
        };
        const p = data.provider;
        const pm =
          typeof data.promptMaxChars === "number" &&
          Number.isFinite(data.promptMaxChars)
            ? data.promptMaxChars
            : undefined;
        const dbg =
          typeof data.debugMinimalPromptActive === "boolean"
            ? data.debugMinimalPromptActive
            : undefined;
        const s: ImageGenBackendStatus = {
          enabled: Boolean(data.enabled),
          provider: p === "volc" || p === "getimg" ? p : null,
          ...(pm !== undefined ? { promptMaxChars: pm } : {}),
          ...(dbg === true ? { debugMinimalPromptActive: true } : {}),
        };
        // Only cache positive readiness — avoids "API disabled forever" after one failed fetch before server was up.
        if (s.enabled) {
          imageGenStatusCache = s;
        }
        return s;
      } catch {
        return { enabled: false, provider: null };
      } finally {
        imageGenStatusPromise = null;
      }
    })();
  }
  return imageGenStatusPromise;
}

export async function getImageGenEnabled(): Promise<boolean> {
  const s = await getImageGenStatus();
  return s.enabled;
}
