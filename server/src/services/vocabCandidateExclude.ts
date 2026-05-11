import { canonicalVocabLemma } from "../utils/vocabHeadwordCanonical.js";

/**
 * Remove LLM candidates whose headword is in the teacher-provided exclusion list
 * (e.g.定表 from other lessons in the same level, sent from the client).
 */
export function filterCandidatesAgainstExcludeHeadwords(
  items: { word: string; sentence: string }[],
  excludeHeadwords: string[] | undefined,
): {
  kept: { word: string; sentence: string }[];
  removed: { word: string; sentence: string }[];
} {
  if (!excludeHeadwords?.length) {
    return { kept: [...items], removed: [] };
  }
  const ex = new Set(
    excludeHeadwords
      .map((w) => canonicalVocabLemma(w))
      .filter((w) => w.length > 0),
  );
  if (ex.size === 0) {
    return { kept: [...items], removed: [] };
  }
  const kept: { word: string; sentence: string }[] = [];
  const removed: { word: string; sentence: string }[] = [];
  for (const it of items) {
    const w = canonicalVocabLemma(it.word ?? "");
    if (w && ex.has(w)) {
      removed.push(it);
    } else {
      kept.push(it);
    }
  }
  return { kept, removed };
}
