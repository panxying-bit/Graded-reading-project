/**
 * Client-side Mastery headwords (aligned with server config).
 * L0–L2: server/config/mastery-words-l0-l2.json
 * L3: server/config/mastery-words-l3.json (Level 4 union uses both)
 */
import l0l2Data from "../../server/config/mastery-words-l0-l2.json";
import l3Data from "../../server/config/mastery-words-l3.json";

export type MasteryScope = "l0-l2" | "l0-l3";

let cacheL0L2: Set<string> | null = null;
let cacheL3: Set<string> | null = null;

function masterySetL0L2(): Set<string> {
  if (!cacheL0L2) {
    const words = (l0l2Data as { words?: string[] }).words ?? [];
    cacheL0L2 = new Set(
      words.map((w) => w.toLowerCase().trim()).filter(Boolean),
    );
  }
  return cacheL0L2;
}

function masterySetL3(): Set<string> {
  if (!cacheL3) {
    const words = (l3Data as { words?: string[] }).words ?? [];
    cacheL3 = new Set(
      words.map((w) => w.toLowerCase().trim()).filter(Boolean),
    );
  }
  return cacheL3;
}

/** True if the lemma (headword) is in the L0–L2 Mastery list (case-insensitive). */
export function isL0L2MasteryWord(lemma: string): boolean {
  if (!lemma.trim()) {
    return false;
  }
  return masterySetL0L2().has(lemma.toLowerCase().trim());
}

/** True if lemma is in L3 Mastery list only. */
export function isL3MasteryWordOnly(lemma: string): boolean {
  if (!lemma.trim()) {
    return false;
  }
  return masterySetL3().has(lemma.toLowerCase().trim());
}

/** Level 4 scope: L0–L2 ∪ L3 Mastery (exact headword / chunk string). */
export function isMasteryWordInScope(
  lemma: string,
  scope: MasteryScope,
): boolean {
  if (!lemma.trim()) {
    return false;
  }
  const n = lemma.toLowerCase().trim();
  if (masterySetL0L2().has(n)) {
    return true;
  }
  if (scope === "l0-l3" && masterySetL3().has(n)) {
    return true;
  }
  return false;
}

/**
 * Level 3: L0–L2 only. Level 4: L0–L3.
 * Returns true if caller should proceed; false to abort.
 */
export function confirmMasteryDuplicate(
  word: string,
  scope: MasteryScope,
): boolean {
  if (!isMasteryWordInScope(word, scope)) {
    return true;
  }
  if (scope === "l0-l3") {
    return window.confirm(
      "该词与 Level 0–3 核心词（Mastery）词库重名；「筛选候选词」会剔除此类词。仍要加入或保留在定表中吗？",
    );
  }
  return window.confirm(
    "该词与 L0–L2 核心词（Mastery）词库重名；「筛选候选词」会剔除此类词。仍要加入或保留在定表中吗？",
  );
}

/** @deprecated Use confirmMasteryDuplicate(word, \"l0-l2\") */
export function confirmL0L2MasteryDuplicate(word: string): boolean {
  return confirmMasteryDuplicate(word, "l0-l2");
}
