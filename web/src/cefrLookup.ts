/**
 * CEFR A1 / A2 / B1 headword match against bundled JSON (from user xlsx exports).
 * Rule: trim + lowercase exact match. Priority: A1, then A2, then B1 (first hit wins).
 */
import data from "./data/cefr-a1-a2.json";

type CefrJson = {
  version: number;
  a1: string[];
  a2: string[];
  b1?: string[];
};

const parsed = data as CefrJson;

let a1Set: Set<string> | null = null;
let a2Set: Set<string> | null = null;
let b1Set: Set<string> | null = null;

function sets(): { a1: Set<string>; a2: Set<string>; b1: Set<string> } {
  if (!a1Set) {
    a1Set = new Set(parsed.a1);
    a2Set = new Set(parsed.a2);
    b1Set = new Set(parsed.b1 ?? []);
  }
  return { a1: a1Set, a2: a2Set, b1: b1Set };
}

export type CefrBand = "A1" | "A2" | "B1";

/**
 * @returns "A1" / "A2" / "B1" if the whole token (or phrase) matches a headword; else null.
 */
export function lookupCefrWord(word: string): CefrBand | null {
  const w = word.trim().toLowerCase();
  if (!w) {
    return null;
  }
  const { a1, a2, b1 } = sets();
  if (a1.has(w)) {
    return "A1";
  }
  if (a2.has(w)) {
    return "A2";
  }
  if (b1.has(w)) {
    return "B1";
  }
  return null;
}

export function cefrLabelText(word: string): string {
  const b = lookupCefrWord(word);
  return b ?? "未收录";
}

/**
 * Sort key for Level 4: prioritize A2 / B1 as teaching targets; A1 last among bands.
 * Lower = earlier in list.
 */
export function cefrRankForL4Teaching(word: string): number {
  const b = lookupCefrWord(word);
  if (b === "B1") {
    return 0;
  }
  if (b === "A2") {
    return 1;
  }
  if (b === "A1") {
    return 2;
  }
  return 3;
}
