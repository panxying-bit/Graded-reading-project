/**
 * Per-level lesson slots (1..N): persisted in localStorage for offline-first use.
 * Storage shape is versioned for future migrations.
 */

import { countWordsInModelOutput } from "./parseBookOutput";
import {
  getDefaultIllustrationPageDirection,
  type IllustrationPageDirection,
  type IllustrationPageDirectionsMap,
  type IllustrationProtagonistsState,
} from "./bookIllustration";
import type { StyleBiblePresetId } from "./data/styleBiblePresets";
import type {
  IllustrationLayoutId,
  IllustrationQualityTier,
} from "./data/illustrationOutputPresets";
const STORAGE_KEY = "graded-reading.lessonLibrary.v1";

/** One row in the user-curated final vocabulary table (cap 6 for L1/L2, 4 for L3/L4). */
export type VocabFinalRow = { word: string; sentence: string };

/** Step 3: 本课定表词（人工勾选/添加/编辑；Level 1/2 最多 6 条，Level 3/4 最多 4 条） */
export type VocabFinalTable = {
  items: VocabFinalRow[];
};

/** Persisted 句型分析 result (same as API, for download + reload). */
export type SentencePatternSnapshot = {
  level: string;
  cefr: string;
  pattern: string;
  exampleSentence: string;
  exampleMatchedInText: boolean;
  whyPattern: string;
  variations: string[];
  teachingFocus: string;
};

export type LessonRecord = {
  text: string;
  wordCount: number;
  updatedAt: string;
  /** Last successful 句型与例句分析 (定稿为基准). Cleared when 定稿/课文内容重新保存. */
  sentencePatternSnapshot?: SentencePatternSnapshot;
  /** Level3 stage-1 draft JSON (before word/page refine). Optional for older saves. */
  level3DraftText?: string;
  /** Level3 stage-2 精修 JSON (page/word bands). */
  level3RefinedText?: string;
  /** Level 1 — same three-stage JSON book flow (6 pages). */
  level1DraftText?: string;
  level1RefinedText?: string;
  /** Level 2 — short A1 JSON book (same staged flow as Level 3). */
  level2DraftText?: string;
  level2RefinedText?: string;
  /** Level4 — same three-stage flow as Level 3. */
  level4DraftText?: string;
  level4RefinedText?: string;
  /** Snapshot of the topic used when saving (for reference). */
  topic?: string;
  /** Lesson title snapshot (e.g. outline line). */
  lessonTitle?: string;
  /** Optional teacher outline of what the text should cover (any language). */
  contentBrief?: string;
  /** Form snapshot at last save (omitted in older local data). */
  fictionOrNonfiction?: "fiction" | "nonfiction";
  structureType?: string;
  /** Raw value, same as API. */
  tenseFocus?: string;
  genreFocus?: string;
  /** User final 4-word table (optional). */
  vocabFinalTable?: VocabFinalTable;
  /**
   * Long-form style bible — stored for authoring; compressed digest or styleShortTag is sent to Jimeng.
   */
  illustrationStyleBible?: string;
  /** Single line for Volc `style:` when set; overrides bible digest. */
  illustrationStyleShortTag?: string;
  /** When text matches a built-in preset exactly; optional UX hint, recomputed on save. */
  illustrationStylePresetId?: StyleBiblePresetId;
  /** Stored preset; server maps to pixel width/height — not duplicated inside prompt text. */
  illustrationLayoutId?: IllustrationLayoutId;
  /** Stored tier; maps to resolution buckets for the image API. */
  illustrationQualityTier?: IllustrationQualityTier;
  /** Stored cast; text digest + ref images may be sent per generate request. */
  illustrationProtagonists?: IllustrationProtagonistsState;
  /** Whole-book arc — stored for planning only; not included in compressed Jimeng prompt. */
  illustrationGlobalStoryScene?: string;
  /**
   * Per-page storyboard (page scene, camera, emotion) — stored per page; merged into compressed
   * prompt as scene / camera / emotion when generating that page.
   */
  illustrationPageDirections?: IllustrationPageDirectionsMap;
  /**
   * Picture-book illustrations: page number (string key) → image URL or data URL.
   * Separate from `text` JSON so课文再生 won’t wipe images unless cleared explicitly.
   */
  bookIllustrations?: Record<string, string>;
};

function hasNonEmptyText(s: string | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/** Load stage-1 / stage-2 JSON for Level 3 or 4 from a lesson row. */
export function readPagedBookStages(
  levelId: string,
  rec: LessonRecord | null,
): { draft: string; refined: string } {
  if (!rec) {
    return { draft: "", refined: "" };
  }
  if (levelId === "level1") {
    const draft = rec.level1DraftText ?? "";
    const refined =
      rec.level1RefinedText != null && rec.level1RefinedText !== ""
        ? rec.level1RefinedText
        : rec.text ?? "";
    return { draft, refined: refined ?? "" };
  }
  if (levelId === "level2") {
    const draft = rec.level2DraftText ?? "";
    const refined =
      rec.level2RefinedText != null && rec.level2RefinedText !== ""
        ? rec.level2RefinedText
        : rec.text ?? "";
    return { draft, refined: refined ?? "" };
  }
  if (levelId === "level4") {
    const draft = rec.level4DraftText ?? "";
    const refined =
      rec.level4RefinedText != null && rec.level4RefinedText !== ""
        ? rec.level4RefinedText
        : rec.text ?? "";
    return { draft, refined: refined ?? "" };
  }
  if (levelId === "level3") {
    const draft = rec.level3DraftText ?? "";
    const refined =
      rec.level3RefinedText != null && rec.level3RefinedText !== ""
        ? rec.level3RefinedText
        : rec.text ?? "";
    return { draft, refined: refined ?? "" };
  }
  return { draft: "", refined: "" };
}

/** Partial fields for `saveLesson` when updating L3/L4 staged JSON. */
export type PagedBookDraftRefinePatch = {
  level1DraftText?: string;
  level1RefinedText?: string;
  level2DraftText?: string;
  level2RefinedText?: string;
  level3DraftText?: string;
  level3RefinedText?: string;
  level4DraftText?: string;
  level4RefinedText?: string;
};

export function pagedBookDraftRefinedPatch(
  levelId: string,
  draft: string,
  refined: string,
): PagedBookDraftRefinePatch {
  if (levelId === "level4") {
    return { level4DraftText: draft, level4RefinedText: refined };
  }
  if (levelId === "level3") {
    return { level3DraftText: draft, level3RefinedText: refined };
  }
  if (levelId === "level2") {
    return { level2DraftText: draft, level2RefinedText: refined };
  }
  if (levelId === "level1") {
    return { level1DraftText: draft, level1RefinedText: refined };
  }
  return {};
}

export function pagedBookDraftOnlyPatch(
  levelId: string,
  draft: string,
): PagedBookDraftRefinePatch {
  if (levelId === "level4") {
    return { level4DraftText: draft };
  }
  if (levelId === "level3") {
    return { level3DraftText: draft };
  }
  if (levelId === "level2") {
    return { level2DraftText: draft };
  }
  if (levelId === "level1") {
    return { level1DraftText: draft };
  }
  return {};
}

export function pagedBookRefinedSnapshotPatch(
  levelId: string,
  refinedBeforeProofread: string,
): PagedBookDraftRefinePatch {
  if (levelId === "level4") {
    return { level4RefinedText: refinedBeforeProofread };
  }
  if (levelId === "level3") {
    return { level3RefinedText: refinedBeforeProofread };
  }
  if (levelId === "level2") {
    return { level2RefinedText: refinedBeforeProofread };
  }
  if (levelId === "level1") {
    return { level1RefinedText: refinedBeforeProofread };
  }
  return {};
}

export function pagedBookRefinedOnlyPatch(
  levelId: string,
  refined: string,
): PagedBookDraftRefinePatch {
  if (levelId === "level4") {
    return { level4RefinedText: refined };
  }
  if (levelId === "level3") {
    return { level3RefinedText: refined };
  }
  if (levelId === "level2") {
    return { level2RefinedText: refined };
  }
  if (levelId === "level1") {
    return { level1RefinedText: refined };
  }
  return {};
}

/**
 * Export/统计用正文选择：
 * - level1 / level2 / level3 / level4: 终稿(text) > 精修 > 初稿
 * - 其他级别: text
 */
export function resolveLessonTextForExport(
  levelId: string,
  rec: LessonRecord | null | undefined,
): string | null {
  if (!rec) {
    return null;
  }
  if (levelId === "level1") {
    if (hasNonEmptyText(rec.text)) {
      return rec.text;
    }
    if (hasNonEmptyText(rec.level1RefinedText)) {
      return rec.level1RefinedText;
    }
    if (hasNonEmptyText(rec.level1DraftText)) {
      return rec.level1DraftText;
    }
    return null;
  }
  if (levelId === "level2") {
    if (hasNonEmptyText(rec.text)) {
      return rec.text;
    }
    if (hasNonEmptyText(rec.level2RefinedText)) {
      return rec.level2RefinedText;
    }
    if (hasNonEmptyText(rec.level2DraftText)) {
      return rec.level2DraftText;
    }
    return null;
  }
  if (levelId === "level3") {
    if (hasNonEmptyText(rec.text)) {
      return rec.text;
    }
    if (hasNonEmptyText(rec.level3RefinedText)) {
      return rec.level3RefinedText;
    }
    if (hasNonEmptyText(rec.level3DraftText)) {
      return rec.level3DraftText;
    }
    return null;
  }
  if (levelId === "level4") {
    if (hasNonEmptyText(rec.text)) {
      return rec.text;
    }
    if (hasNonEmptyText(rec.level4RefinedText)) {
      return rec.level4RefinedText;
    }
    if (hasNonEmptyText(rec.level4DraftText)) {
      return rec.level4DraftText;
    }
    return null;
  }
  return hasNonEmptyText(rec.text) ? rec.text : null;
}

type StoreV1 = {
  v: 1;
  /** levelId -> lesson key "1".."N" -> record */
  byLevel: Record<string, Record<string, LessonRecord>>;
};

function emptyStore(): StoreV1 {
  return { v: 1, byLevel: {} };
}

function readStore(): StoreV1 {
  if (typeof localStorage === "undefined") {
    return emptyStore();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }
    const p = JSON.parse(raw) as StoreV1;
    if (p?.v === 1 && p.byLevel && typeof p.byLevel === "object") {
      return p;
    }
  } catch {
    // ignore
  }
  return emptyStore();
}

function writeStore(s: StoreV1): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    // quota or private mode
    return false;
  }
}

function lessonKey(n: number): string {
  return String(n);
}

/** True if a snapshot can rehydrate the 句型 UI (tolerant of field quirks). */
export function isUsableSentencePatternSnapshot(
  s: unknown,
): s is SentencePatternSnapshot {
  if (!s || typeof s !== "object") {
    return false;
  }
  const o = s as Record<string, unknown>;
  if (String(o.pattern ?? "").trim().length > 0) {
    return true;
  }
  if (String(o.exampleSentence ?? "").trim().length > 0) {
    return true;
  }
  if (Array.isArray(o.variations) && o.variations.length > 0) {
    return true;
  }
  if (
    String(o.whyPattern ?? "").trim().length > 0 ||
    String(o.teachingFocus ?? "").trim().length > 0
  ) {
    return true;
  }
  return false;
}

/** Normalize headword for vocabulary de-duplication (UI + API). */
export function normVocabHeadword(w: string): string {
  return w.trim().toLowerCase();
}

/**
 * Unique headwords from the final vocabulary table (定表) of all other lessons
 * in the same level — used to exclude duplicate teaching targets across lessons.
 * Scans lesson slots 1..maxLesson, skipping currentLesson.
 */
export function collectFinalVocabHeadwordsFromOtherLessons(
  levelId: string,
  currentLesson: number,
  maxLesson: number,
): string[] {
  const set = new Set<string>();
  const cap = Math.max(0, Math.min(maxLesson, 2000));
  for (let n = 1; n <= cap; n++) {
    if (n === currentLesson) {
      continue;
    }
    const rec = getLesson(levelId, n);
    const items = rec?.vocabFinalTable?.items;
    if (!items?.length) {
      continue;
    }
    for (const row of items) {
      const h = normVocabHeadword(row.word ?? "");
      if (h) {
        set.add(h);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

export function getLesson(
  levelId: string,
  lessonIndex: number,
): LessonRecord | null {
  if (lessonIndex < 1) {
    return null;
  }
  const s = readStore();
  const r = s.byLevel[levelId]?.[lessonKey(lessonIndex)];
  return r && typeof r.text === "string" ? r : null;
}

export function saveLesson(
  levelId: string,
  lessonIndex: number,
  data: {
    text: string;
    wordCount: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
    fictionOrNonfiction?: "fiction" | "nonfiction";
    structureType?: string;
    tenseFocus?: string;
    genreFocus?: string;
    /** Level 1 staged JSON (same semantics as level3). */
    level1DraftText?: string;
    level1RefinedText?: string;
    level2DraftText?: string;
    level2RefinedText?: string;
    /** When set, updates stage-1 draft; when omitted, previous draft is kept if any. */
    level3DraftText?: string;
    /** When set, updates stage-2 精修; when omitted, previous value is kept if any. */
    level3RefinedText?: string;
    level4DraftText?: string;
    level4RefinedText?: string;
    /** Set to a snapshot after 句型分析; use `null` to clear. */
    sentencePatternSnapshot?: SentencePatternSnapshot | null;
    /** User-curated final table (max 4–6 by level); use `null` to clear. */
    vocabFinalTable?: VocabFinalTable | null;
    /** Style bible for AI illustration prompts (Step 1); omit to keep previous. */
    illustrationStyleBible?: string;
    /** Short tag for Volc prompt `style:`; null clears. Omit to keep previous. */
    illustrationStyleShortTag?: string | null;
    /** Matched preset id; `null` clears. Omit to keep previous. */
    illustrationStylePresetId?: StyleBiblePresetId | null;
    illustrationLayoutId?: IllustrationLayoutId | null;
    illustrationQualityTier?: IllustrationQualityTier | null;
    /** Protagonist slots; `null` clears entire block. */
    illustrationProtagonists?: IllustrationProtagonistsState | null;
    illustrationGlobalStoryScene?: string | null;
    illustrationPageDirections?: IllustrationPageDirectionsMap | null;
    /** Per-page images; omit to keep previous; null clears all. */
    bookIllustrations?: Record<string, string> | null;
  },
): boolean {
  if (lessonIndex < 1) {
    return false;
  }
  const s = readStore();
  if (!s.byLevel[levelId]) {
    s.byLevel[levelId] = {};
  }
  const prev = s.byLevel[levelId]![lessonKey(lessonIndex)];
  const next: LessonRecord = {
    text: data.text,
    wordCount: data.wordCount,
    updatedAt: new Date().toISOString(),
    topic: data.topic,
    lessonTitle: data.lessonTitle,
    contentBrief: data.contentBrief,
    fictionOrNonfiction: data.fictionOrNonfiction,
    structureType: data.structureType,
    tenseFocus: data.tenseFocus,
    genreFocus: data.genreFocus,
  };
  if (data.level1DraftText !== undefined) {
    next.level1DraftText = data.level1DraftText;
  } else if (prev?.level1DraftText) {
    next.level1DraftText = prev.level1DraftText;
  }
  if (data.level1RefinedText !== undefined) {
    next.level1RefinedText = data.level1RefinedText;
  } else if (prev?.level1RefinedText) {
    next.level1RefinedText = prev.level1RefinedText;
  }
  if (data.level2DraftText !== undefined) {
    next.level2DraftText = data.level2DraftText;
  } else if (prev?.level2DraftText) {
    next.level2DraftText = prev.level2DraftText;
  }
  if (data.level2RefinedText !== undefined) {
    next.level2RefinedText = data.level2RefinedText;
  } else if (prev?.level2RefinedText) {
    next.level2RefinedText = prev.level2RefinedText;
  }
  if (data.level3DraftText !== undefined) {
    next.level3DraftText = data.level3DraftText;
  } else if (prev?.level3DraftText) {
    next.level3DraftText = prev.level3DraftText;
  }
  if (data.level3RefinedText !== undefined) {
    next.level3RefinedText = data.level3RefinedText;
  } else if (prev?.level3RefinedText) {
    next.level3RefinedText = prev.level3RefinedText;
  }
  if (data.level4DraftText !== undefined) {
    next.level4DraftText = data.level4DraftText;
  } else if (prev?.level4DraftText) {
    next.level4DraftText = prev.level4DraftText;
  }
  if (data.level4RefinedText !== undefined) {
    next.level4RefinedText = data.level4RefinedText;
  } else if (prev?.level4RefinedText) {
    next.level4RefinedText = prev.level4RefinedText;
  }
  if (data.sentencePatternSnapshot === null) {
    delete next.sentencePatternSnapshot;
  } else if (data.sentencePatternSnapshot !== undefined) {
    next.sentencePatternSnapshot = data.sentencePatternSnapshot;
  } else if (prev?.sentencePatternSnapshot) {
    next.sentencePatternSnapshot = prev.sentencePatternSnapshot;
  }
  if (data.vocabFinalTable === null) {
    delete next.vocabFinalTable;
  } else if (data.vocabFinalTable !== undefined) {
    next.vocabFinalTable = data.vocabFinalTable;
  } else if (prev?.vocabFinalTable) {
    next.vocabFinalTable = prev.vocabFinalTable;
  }
  if (data.illustrationStyleBible !== undefined) {
    const v = data.illustrationStyleBible;
    if (v === "") {
      delete next.illustrationStyleBible;
      delete next.illustrationStylePresetId;
    } else {
      next.illustrationStyleBible = v;
    }
  } else if (prev?.illustrationStyleBible !== undefined) {
    next.illustrationStyleBible = prev.illustrationStyleBible;
  }
  if (data.illustrationStyleShortTag === null) {
    delete next.illustrationStyleShortTag;
  } else if (data.illustrationStyleShortTag !== undefined) {
    const t = data.illustrationStyleShortTag.trim();
    if (t === "") {
      delete next.illustrationStyleShortTag;
    } else {
      next.illustrationStyleShortTag = t;
    }
  } else if (prev?.illustrationStyleShortTag !== undefined) {
    next.illustrationStyleShortTag = prev.illustrationStyleShortTag;
  }
  if (data.illustrationStylePresetId === null) {
    delete next.illustrationStylePresetId;
  } else if (data.illustrationStylePresetId !== undefined) {
    next.illustrationStylePresetId = data.illustrationStylePresetId;
  } else if (prev?.illustrationStylePresetId !== undefined) {
    next.illustrationStylePresetId = prev.illustrationStylePresetId;
  }
  if (data.illustrationLayoutId === null) {
    delete next.illustrationLayoutId;
  } else if (data.illustrationLayoutId !== undefined) {
    next.illustrationLayoutId = data.illustrationLayoutId;
  } else if (prev?.illustrationLayoutId !== undefined) {
    next.illustrationLayoutId = prev.illustrationLayoutId;
  }
  if (data.illustrationQualityTier === null) {
    delete next.illustrationQualityTier;
  } else if (data.illustrationQualityTier !== undefined) {
    next.illustrationQualityTier = data.illustrationQualityTier;
  } else if (prev?.illustrationQualityTier !== undefined) {
    next.illustrationQualityTier = prev.illustrationQualityTier;
  }
  if (data.illustrationProtagonists === null) {
    delete next.illustrationProtagonists;
  } else if (data.illustrationProtagonists !== undefined) {
    next.illustrationProtagonists = data.illustrationProtagonists;
  } else if (prev?.illustrationProtagonists) {
    next.illustrationProtagonists = prev.illustrationProtagonists;
  }
  if (data.illustrationGlobalStoryScene === null) {
    delete next.illustrationGlobalStoryScene;
  } else if (data.illustrationGlobalStoryScene !== undefined) {
    const g = data.illustrationGlobalStoryScene.trim();
    if (g === "") {
      delete next.illustrationGlobalStoryScene;
    } else {
      next.illustrationGlobalStoryScene = g;
    }
  } else if (prev?.illustrationGlobalStoryScene !== undefined) {
    next.illustrationGlobalStoryScene = prev.illustrationGlobalStoryScene;
  }
  if (data.illustrationPageDirections === null) {
    delete next.illustrationPageDirections;
  } else if (data.illustrationPageDirections !== undefined) {
    next.illustrationPageDirections = data.illustrationPageDirections;
  } else if (prev?.illustrationPageDirections) {
    next.illustrationPageDirections = prev.illustrationPageDirections;
  }
  if (data.bookIllustrations === null) {
    delete next.bookIllustrations;
  } else if (data.bookIllustrations !== undefined) {
    next.bookIllustrations = data.bookIllustrations;
  } else if (prev?.bookIllustrations) {
    next.bookIllustrations = prev.bookIllustrations;
  }
  s.byLevel[levelId]![lessonKey(lessonIndex)] = next;
  return writeStore(s);
}

/** Merge new page URLs into saved book illustrations (keeps other lesson fields). */
export function mergeLessonBookIllustrations(
  levelId: string,
  lessonIndex: number,
  updates: Record<string, string>,
): boolean {
  const rec = getLesson(levelId, lessonIndex);
  if (!rec) {
    return false;
  }
  const merged = { ...(rec.bookIllustrations ?? {}), ...updates };
  return saveLesson(levelId, lessonIndex, {
    text: rec.text,
    wordCount: rec.wordCount,
    bookIllustrations: merged,
  });
}

/** Merge one page's illustration storyboard (plot, camera, emotion). */
export function mergeLessonIllustrationPageDirection(
  levelId: string,
  lessonIndex: number,
  pageNum: number,
  patch: Partial<IllustrationPageDirection>,
): boolean {
  const rec = getLesson(levelId, lessonIndex);
  if (!rec) {
    return false;
  }
  const key = String(pageNum);
  const map: IllustrationPageDirectionsMap = {
    ...(rec.illustrationPageDirections ?? {}),
  };
  const mergedSlot: IllustrationPageDirection = {
    ...getDefaultIllustrationPageDirection(),
    ...map[key],
    ...patch,
  };
  map[key] = mergedSlot;
  return saveLesson(levelId, lessonIndex, {
    text: rec.text,
    wordCount: rec.wordCount,
    illustrationPageDirections: map,
  });
}

/** How many lessons in [1, max] have saved content. */
export function countGeneratedInLevel(
  levelId: string,
  maxLesson: number,
): number {
  const s = readStore();
  const m = s.byLevel[levelId];
  if (!m) {
    return 0;
  }
  let c = 0;
  for (let i = 1; i <= maxLesson; i++) {
    const r = m[lessonKey(i)];
    if (resolveLessonTextForExport(levelId, r)) {
      c += 1;
    }
  }
  return c;
}

export function hasLessonContent(
  levelId: string,
  lessonIndex: number,
): boolean {
  return !!resolveLessonTextForExport(levelId, getLesson(levelId, lessonIndex));
}

export function getLessonWordCount(
  levelId: string,
  lessonIndex: number,
): number | null {
  const r = getLesson(levelId, lessonIndex);
  const chosen = resolveLessonTextForExport(levelId, r);
  if (!chosen) {
    return null;
  }
  if (!chosen.trim()) {
    return null;
  }
  // Keep exactly the same counting behavior as the on-screen正文词数.
  return countWordsInModelOutput(chosen);
}

/** Sorted lesson numbers in [1, maxLesson] that have non-empty saved text. */
export function listFilledLessonIndices(
  levelId: string,
  maxLesson: number,
): number[] {
  const out: number[] = [];
  for (let i = 1; i <= maxLesson; i++) {
    const r = getLesson(levelId, i);
    if (resolveLessonTextForExport(levelId, r)) {
      out.push(i);
    }
  }
  return out;
}
