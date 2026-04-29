/**
 * Level3 curriculum: 144 lessons in three bands (word targets + 6–8 page book layout).
 */

export type Level3PhaseInfo = {
  key: "early" | "mid" | "late";
  targetWords: number;
  /** Inclusive range; model picks 6, 7, or 8 pages to fit the story and word cap. */
  pageCountMin: 6;
  pageCountMax: 8;
  /** e.g. "1–48" for UI / prompt */
  phaseRange: string;
  /** Soft guidance for sentence length inside a page. */
  minWordsPerSentence: number;
  maxWordsPerSentence: number;
};

const MIN = 4;
const MAX = 12;
const PAGE_MIN = 6 as const;
const PAGE_MAX = 8 as const;

export function getLevel3Phase(lesson: number | undefined): Level3PhaseInfo {
  const n =
    lesson == null || !Number.isFinite(lesson)
      ? 1
      : Math.max(1, Math.min(144, Math.floor(lesson)));
  if (n <= 48) {
    return {
      key: "early",
      targetWords: 70,
      pageCountMin: PAGE_MIN,
      pageCountMax: PAGE_MAX,
      phaseRange: "1–48",
      minWordsPerSentence: MIN,
      maxWordsPerSentence: MAX,
    };
  }
  if (n <= 96) {
    return {
      key: "mid",
      targetWords: 80,
      pageCountMin: PAGE_MIN,
      pageCountMax: PAGE_MAX,
      phaseRange: "49–96",
      minWordsPerSentence: MIN,
      maxWordsPerSentence: MAX,
    };
  }
  return {
    key: "late",
    targetWords: 90,
    pageCountMin: PAGE_MIN,
    pageCountMax: PAGE_MAX,
    phaseRange: "97–144",
    minWordsPerSentence: MIN,
    maxWordsPerSentence: MAX,
  };
}

/**
 * Word band for prompts and server-side repair; must match levels.yaml.
 */
export function getLevel3WordCountBoundsForTarget(targetWords: number): {
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

export function getLevel3WordCountBounds(lesson: number | undefined): {
  target: number;
  min: number;
  max: number;
} {
  return getLevel3WordCountBoundsForTarget(getLevel3Phase(lesson).targetWords);
}
