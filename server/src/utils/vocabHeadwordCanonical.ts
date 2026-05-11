import pluralize from "pluralize";

/**
 * Canonical headword for vocab teaching: trimmed, lowercased, and singularized
 * where `pluralize` applies (single token or last token of a short phrase).
 * Used for dedup, exclusions, and Mastery matching across L1–L4.
 */
export function canonicalVocabLemma(phrase: string): string {
  const raw = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) {
    return raw;
  }
  const parts = raw.split(" ");
  if (parts.length === 1) {
    return pluralize.singular(parts[0]!);
  }
  const last = parts[parts.length - 1]!;
  const rest = parts.slice(0, -1).join(" ");
  const sing = pluralize.singular(last);
  return rest ? `${rest} ${sing}` : sing;
}
