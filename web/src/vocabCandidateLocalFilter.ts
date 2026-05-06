import type { VocabCandidateItem } from "./api/client";
import { normVocabHeadword } from "./lessonLibrary";

/**
 * Remove any candidate whose headword appears in the exclusion set (e.g. other
 * lessons' 定表 in this level). Defensive: run on API response in case the model
 * ignored the prompt; idempotent if the server already filtered.
 */
export function filterVocabCandidatesByExcludedHeadwords(
  items: VocabCandidateItem[],
  excludeHeadwords: readonly string[] | null | undefined,
): { kept: VocabCandidateItem[]; removed: VocabCandidateItem[] } {
  if (!items.length) {
    return { kept: [], removed: [] };
  }
  const ex = new Set(
    (excludeHeadwords ?? [])
      .map((w) => normVocabHeadword(w))
      .filter(Boolean),
  );
  if (ex.size === 0) {
    return { kept: [...items], removed: [] };
  }
  const kept: VocabCandidateItem[] = [];
  const removed: VocabCandidateItem[] = [];
  for (const it of items) {
    const w = normVocabHeadword(it.word);
    if (w && ex.has(w)) {
      removed.push(it);
    } else {
      kept.push(it);
    }
  }
  return { kept, removed };
}
