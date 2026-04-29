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
        `${action}时无法连接 API。请确认：1) 后端已启动（默认 http://127.0.0.1:3000 ，与 web/.env 的 VITE_DEV_API_PORT 一致）；2) 用 Vite 开发地址打开页面（如 http://127.0.0.1:5173 ），不要直接双击打开 dist；3) 若长时间无响应可重试。已把 Vite 代理超时拉长，减少因慢请求被断开。`,
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

/** Per-level 1..N theme map (e.g. level3.json). Returns null if 404. */
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
  if (body.level !== "level3") {
    throw new Error("generateDraft 仅支持 level3");
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

/** Level3 stage 2 — fit draft to page/word limits (from edited draft if any). */
export async function generateRefine(body: {
  lesson: number;
  draftText: string;
  topic?: string;
  lessonTitle?: string;
  fictionOrNonfiction?: "fiction" | "nonfiction";
}): Promise<GenerateResponse & { stage: "refine" }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "level3" as const, ...body }),
    });
  } catch (e) {
    throw mapNetworkError(e, "精修");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse & { stage: "refine" };
}

/** Level3 stage 3 — spelling/grammar pass only; same JSON shape. */
export async function generateProofread(body: {
  bookText: string;
  lesson?: number;
  topic?: string;
  lessonTitle?: string;
}): Promise<GenerateResponse & { stage: "proofread" }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/proofread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "level3" as const, ...body }),
    });
  } catch (e) {
    throw mapNetworkError(e, "语言校核");
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res));
  }
  return (await res.json()) as GenerateResponse & { stage: "proofread" };
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
