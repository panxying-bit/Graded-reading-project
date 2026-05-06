/**
 * Shared phased curriculum: Level 1 (6-page phrase books), Level 3 / Level 4 (6–8 pages).
 */

export const PAGED_BOOK_LEVEL_IDS = ["level3", "level4"] as const;
export type PagedBookLevelId = (typeof PAGED_BOOK_LEVEL_IDS)[number];

export function isPagedBookLevel(level: string): level is PagedBookLevelId {
  return level === "level3" || level === "level4";
}

/** JSON book pipeline: draft → refine → proofread. */
export const BOOK_PIPELINE_LEVEL_IDS = ["level1", "level2", "level3", "level4"] as const;
export type BookPipelineLevelId = (typeof BOOK_PIPELINE_LEVEL_IDS)[number];

export function isBookPipelineLevel(level: string): level is BookPipelineLevelId {
  return (
    level === "level1" ||
    level === "level2" ||
    level === "level3" ||
    level === "level4"
  );
}

/** Level 2 (CEFR A1, ~6–7 y): short JSON books; bands match curriculum worksheet refs. */
export type Level2Band = {
  key: "early" | "mid" | "late";
  targetWords: number;
  pageCountMin: number;
  pageCountMax: number;
  phaseRange: string;
  minWordsPerSentence: number;
  maxWordsPerSentence: number;
};

export function getLevel2Band(lesson: number | undefined): Level2Band {
  const n =
    lesson == null || !Number.isFinite(lesson)
      ? 1
      : Math.max(1, Math.min(144, Math.floor(lesson)));
  if (n <= 48) {
    return {
      key: "early",
      targetWords: 26,
      pageCountMin: 6,
      pageCountMax: 7,
      phaseRange: "1–48",
      minWordsPerSentence: 4,
      maxWordsPerSentence: 5,
    };
  }
  if (n <= 96) {
    return {
      key: "mid",
      targetWords: 34,
      pageCountMin: 7,
      pageCountMax: 8,
      phaseRange: "49–96",
      minWordsPerSentence: 4,
      maxWordsPerSentence: 5,
    };
  }
  return {
    key: "late",
    targetWords: 38,
    pageCountMin: 6,
    pageCountMax: 8,
    phaseRange: "97–144",
    minWordsPerSentence: 5,
    maxWordsPerSentence: 6,
  };
}

/** Word band per curriculum phase (aligns with worksheet annotations). */
export function getLevel2WordCountBounds(lesson: number | undefined): {
  target: number;
  min: number;
  max: number;
} {
  const b = getLevel2Band(lesson);
  if (b.key === "early") {
    return { target: b.targetWords, min: 24, max: 28 };
  }
  if (b.key === "mid") {
    return { target: b.targetWords, min: 30, max: 36 };
  }
  return { target: b.targetWords, min: 35, max: 40 };
}

export type PagedBookBand = {
  key: "early" | "mid" | "late";
  targetWords: number;
  pageCountMin: 6;
  pageCountMax: 8;
  phaseRange: string;
  minWordsPerSentence: number;
  maxWordsPerSentence: number;
};

const MIN_SENT = 4;
const MAX_SENT = 12;
const PAGE_MIN = 6 as const;
const PAGE_MAX = 8 as const;

const TARGETS: Record<PagedBookLevelId, [number, number, number]> = {
  level3: [70, 80, 90],
  level4: [90, 100, 110],
};

export function getPagedBookBand(
  levelId: PagedBookLevelId,
  lesson: number | undefined,
): PagedBookBand {
  const n =
    lesson == null || !Number.isFinite(lesson)
      ? 1
      : Math.max(1, Math.min(144, Math.floor(lesson)));
  const [earlyT, midT, lateT] = TARGETS[levelId];
  if (n <= 48) {
    return {
      key: "early",
      targetWords: earlyT,
      pageCountMin: PAGE_MIN,
      pageCountMax: PAGE_MAX,
      phaseRange: "1–48",
      minWordsPerSentence: MIN_SENT,
      maxWordsPerSentence: MAX_SENT,
    };
  }
  if (n <= 96) {
    return {
      key: "mid",
      targetWords: midT,
      pageCountMin: PAGE_MIN,
      pageCountMax: PAGE_MAX,
      phaseRange: "49–96",
      minWordsPerSentence: MIN_SENT,
      maxWordsPerSentence: MAX_SENT,
    };
  }
  return {
    key: "late",
    targetWords: lateT,
    pageCountMin: PAGE_MIN,
    pageCountMax: PAGE_MAX,
    phaseRange: "97–144",
    minWordsPerSentence: MIN_SENT,
    maxWordsPerSentence: MAX_SENT,
  };
}

/** Word band for prompts and server-side repair; aligned with levels.yaml bands. */
export function getPagedBookWordCountBoundsForTarget(targetWords: number): {
  target: number;
  min: number;
  max: number;
} {
  return {
    target: targetWords,
    min: Math.max(50, targetWords - 8),
    max: targetWords + 10,
  };
}

export function getPagedBookWordCountBounds(
  levelId: PagedBookLevelId,
  lesson: number | undefined,
): { target: number; min: number; max: number } {
  return getPagedBookWordCountBoundsForTarget(
    getPagedBookBand(levelId, lesson).targetWords,
  );
}

/** Level 1: fixed 6 pages; total words 12 / 18 / 24 by band (lessons 1–48 / 49–96 / 97–144). */
export type Level1Band = {
  key: "early" | "mid" | "late";
  targetWords: number;
  pageCountMin: number;
  pageCountMax: number;
  phaseRange: string;
  minPhraseWords: number;
  maxPhraseWords: number;
  phraseLineMin: number;
  phraseLineMax: number;
};

const LEVEL1_PAGE = 6 as const;
const LEVEL1_TARGETS: [number, number, number] = [12, 18, 24];

export function getLevel1Band(lesson: number | undefined): Level1Band {
  const n =
    lesson == null || !Number.isFinite(lesson)
      ? 1
      : Math.max(1, Math.min(144, Math.floor(lesson)));
  const [earlyT, midT, lateT] = LEVEL1_TARGETS;
  const tail = {
    pageCountMin: LEVEL1_PAGE,
    pageCountMax: LEVEL1_PAGE,
    minPhraseWords: 2,
    maxPhraseWords: 4,
    phraseLineMin: 6,
    phraseLineMax: 8,
  };
  if (n <= 48) {
    return {
      key: "early",
      targetWords: earlyT,
      phaseRange: "1–48",
      ...tail,
    };
  }
  if (n <= 96) {
    return {
      key: "mid",
      targetWords: midT,
      phaseRange: "49–96",
      ...tail,
    };
  }
  return {
    key: "late",
    targetWords: lateT,
    phaseRange: "97–144",
    ...tail,
  };
}

/** Tight band around curriculum target (Pre-A1 word totals are small). */
export function getLevel1WordCountBounds(targetWords: number): {
  target: number;
  min: number;
  max: number;
} {
  return {
    target: targetWords,
    min: Math.max(1, targetWords - 2),
    max: targetWords + 2,
  };
}

export function getBookPipelineWordBounds(
  levelId: BookPipelineLevelId,
  lesson: number | undefined,
): { target: number; min: number; max: number } {
  if (levelId === "level1") {
    return getLevel1WordCountBounds(getLevel1Band(lesson).targetWords);
  }
  if (levelId === "level2") {
    return getLevel2WordCountBounds(lesson);
  }
  return getPagedBookWordCountBounds(levelId, lesson);
}

export function getBookPipelinePageRange(
  levelId: BookPipelineLevelId,
  lesson: number | undefined,
): { pageMin: number; pageMax: number } {
  if (levelId === "level1") {
    return { pageMin: LEVEL1_PAGE, pageMax: LEVEL1_PAGE };
  }
  if (levelId === "level2") {
    const b = getLevel2Band(lesson);
    return { pageMin: b.pageCountMin, pageMax: b.pageCountMax };
  }
  const b = getPagedBookBand(levelId, lesson);
  return { pageMin: b.pageCountMin, pageMax: b.pageCountMax };
}
