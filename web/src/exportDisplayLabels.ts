import { GENRE_FOCUS_OPTIONS } from "./genreOptions";
import { STRUCTURE_TYPES } from "./structureOptions";
import { TENSE_FOCUS_OPTIONS } from "./tenseOptions";

/** Map stored value to Chinese UI label for exports; fall back to raw if unknown. */
export function displayStructure(v: string | undefined): string {
  if (!v?.trim()) {
    return "";
  }
  const o = STRUCTURE_TYPES.find((x) => x.value === v);
  return o ? o.label : v;
}

export function displayTense(v: string | undefined): string {
  if (!v?.trim()) {
    return "";
  }
  const o = TENSE_FOCUS_OPTIONS.find((x) => x.value === v);
  return o ? o.label : v;
}

export function displayGenre(v: string | undefined): string {
  if (!v?.trim()) {
    return "";
  }
  const o = GENRE_FOCUS_OPTIONS.find((x) => x.value === v);
  return o ? o.label : v;
}

export function displayFiction(
  v: "fiction" | "nonfiction" | undefined,
): string {
  if (!v) {
    return "";
  }
  return v === "fiction" ? "虚构 (fiction)" : "非虚构 (nonfiction)";
}
