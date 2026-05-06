import fs from "node:fs";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

type MasteryJson = {
  version: number;
  words: string[];
  sourceFile?: string;
};

let cacheL0L2: Set<string> | null = null;
let cacheL3: Set<string> | null = null;

function loadMasterySet(): Set<string> {
  if (cacheL0L2) {
    return cacheL0L2;
  }
  const p = resolveServerConfigFile(
    import.meta.url,
    "mastery-words-l0-l2.json",
  );
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as MasteryJson;
  cacheL0L2 = new Set(
    (data.words ?? []).map((w) => w.toLowerCase().trim()).filter(Boolean),
  );
  return cacheL0L2;
}

function loadL3MasterySet(): Set<string> {
  if (cacheL3) {
    return cacheL3;
  }
  const p = resolveServerConfigFile(import.meta.url, "mastery-words-l3.json");
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as MasteryJson;
  cacheL3 = new Set(
    (data.words ?? []).map((w) => w.toLowerCase().trim()).filter(Boolean),
  );
  return cacheL3;
}

/** Union(L0–L2 Mastery, L3 Mastery) for Level 4 candidate filtering. */
function loadL0ThroughL3MasterySet(): Set<string> {
  const u = new Set(loadMasterySet());
  for (const w of loadL3MasterySet()) {
    u.add(w);
  }
  return u;
}

/** True if the lemma (headword) appears in Level 0–2 sheets l0/l1/l2 with type Mastery. */
export function isL0L2MasteryWord(lemma: string): boolean {
  if (!lemma.trim()) {
    return false;
  }
  return loadMasterySet().has(lemma.toLowerCase().trim());
}

/** True if the lemma appears in Level 3 Mastery list (config/mastery-words-l3.json). */
export function isL3MasteryWord(lemma: string): boolean {
  if (!lemma.trim()) {
    return false;
  }
  return loadL3MasterySet().has(lemma.toLowerCase().trim());
}

/** Level 4: headword matches any L0–L3 Mastery core word. */
export function isL0ThroughL3MasteryWord(lemma: string): boolean {
  if (!lemma.trim()) {
    return false;
  }
  const n = lemma.toLowerCase().trim();
  return loadL0ThroughL3MasterySet().has(n);
}

export function filterLevel3CandidatesAgainstL0L2Mastery(
  items: { word: string; sentence: string }[],
): {
  kept: { word: string; sentence: string }[];
  removed: { word: string; sentence: string }[];
} {
  const set = loadMasterySet();
  return filterByMasterySet(items, set);
}

/** Level 4: remove candidates whose headword matches L0–L2 or L3 Mastery lists. */
export function filterLevel4CandidatesAgainstL0L3Mastery(
  items: { word: string; sentence: string }[],
): {
  kept: { word: string; sentence: string }[];
  removed: { word: string; sentence: string }[];
} {
  const set = loadL0ThroughL3MasterySet();
  return filterByMasterySet(items, set);
}

function filterByMasterySet(
  items: { word: string; sentence: string }[],
  set: Set<string>,
): {
  kept: { word: string; sentence: string }[];
  removed: { word: string; sentence: string }[];
} {
  const kept: { word: string; sentence: string }[] = [];
  const removed: { word: string; sentence: string }[] = [];
  for (const it of items) {
    const w = (it.word ?? "").trim();
    if (!w) {
      continue;
    }
    if (set.has(w.toLowerCase().trim())) {
      removed.push(it);
    } else {
      kept.push(it);
    }
  }
  return { kept, removed };
}
