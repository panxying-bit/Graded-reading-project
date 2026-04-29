/**
 * Mirrors server/src/level3Phase.ts for UI (targets when level3 + lesson is selected).
 */
export type Level3PhaseInfo = {
  key: "early" | "mid" | "late";
  targetWords: number;
  pageCountMin: 6;
  pageCountMax: 8;
  phaseRange: string;
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

/** Aligned with server getLevel3WordCountBounds (prompt + repair). */
export function getLevel3WordCountBounds(lesson: number | undefined): {
  target: number;
  min: number;
  max: number;
} {
  const t = getLevel3Phase(lesson).targetWords;
  return {
    target: t,
    min: Math.max(50, t - 8),
    max: t + 10,
  };
}
