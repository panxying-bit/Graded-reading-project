/**
 * Per-level lesson slots (1..N): persisted in localStorage for offline-first use.
 * Storage shape is versioned for future migrations.
 */

import { countWordsInModelOutput } from "./parseBookOutput";
const STORAGE_KEY = "graded-reading.lessonLibrary.v1";

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
  /** Snapshot of the topic used when saving (for reference). */
  topic?: string;
  /** Lesson title snapshot (e.g. outline line). */
  lessonTitle?: string;
  /** Form snapshot at last save (omitted in older local data). */
  fictionOrNonfiction?: "fiction" | "nonfiction";
  structureType?: string;
  /** Raw value, same as API. */
  tenseFocus?: string;
  genreFocus?: string;
};

function hasNonEmptyText(s: string | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Export/统计用正文选择：
 * - level3: 终稿(text) > 精修(level3RefinedText) > 初稿(level3DraftText)
 * - 其他级别: text
 */
export function resolveLessonTextForExport(
  levelId: string,
  rec: LessonRecord | null | undefined,
): string | null {
  if (!rec) {
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
    fictionOrNonfiction?: "fiction" | "nonfiction";
    structureType?: string;
    tenseFocus?: string;
    genreFocus?: string;
    /** When set, updates stage-1 draft; when omitted, previous draft is kept if any. */
    level3DraftText?: string;
    /** When set, updates stage-2 精修; when omitted, previous value is kept if any. */
    level3RefinedText?: string;
    /** Set to a snapshot after 句型分析; use `null` to clear. */
    sentencePatternSnapshot?: SentencePatternSnapshot | null;
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
    fictionOrNonfiction: data.fictionOrNonfiction,
    structureType: data.structureType,
    tenseFocus: data.tenseFocus,
    genreFocus: data.genreFocus,
  };
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
  if (data.sentencePatternSnapshot === null) {
    delete next.sentencePatternSnapshot;
  } else if (data.sentencePatternSnapshot !== undefined) {
    next.sentencePatternSnapshot = data.sentencePatternSnapshot;
  } else if (prev?.sentencePatternSnapshot) {
    next.sentencePatternSnapshot = prev.sentencePatternSnapshot;
  }
  s.byLevel[levelId]![lessonKey(lessonIndex)] = next;
  return writeStore(s);
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
