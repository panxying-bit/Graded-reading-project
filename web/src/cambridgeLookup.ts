import data from "./data/cambridge-movers-ket-pet.json";

export type CambridgeBand = "Movers" | "KET" | "PET";

type CambridgeJson = {
  version: number;
  sourceFile: string;
  priorityRule: string;
  movers: string[];
  ket: string[];
  pet: string[];
};

const parsed = data as CambridgeJson;

let moversSet: Set<string> | null = null;
let ketSet: Set<string> | null = null;
let petSet: Set<string> | null = null;

function normWord(w: string): string {
  return w
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sets(): { movers: Set<string>; ket: Set<string>; pet: Set<string> } {
  if (!moversSet) {
    moversSet = new Set(parsed.movers.map(normWord));
    ketSet = new Set(parsed.ket.map(normWord));
    petSet = new Set(parsed.pet.map(normWord));
  }
  return { movers: moversSet, ket: ketSet!, pet: petSet! };
}

/**
 * Cambridge wordlist lookup with "first-appearance" priority:
 * Movers > KET > PET.
 */
export function lookupCambridgeWord(word: string): CambridgeBand | null {
  const w = normWord(word);
  if (!w) {
    return null;
  }
  const { movers, ket, pet } = sets();
  if (movers.has(w)) {
    return "Movers";
  }
  if (ket.has(w)) {
    return "KET";
  }
  if (pet.has(w)) {
    return "PET";
  }
  return null;
}

export function cambridgeLabelText(word: string): string {
  return lookupCambridgeWord(word) ?? "未收录";
}
