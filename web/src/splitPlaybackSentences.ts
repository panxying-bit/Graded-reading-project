/**
 * Split passage text into playback chunks (roughly one sentence per chunk).
 * Falls back to the whole string when there is no sentence-ending punctuation.
 */
export function splitPlaybackSentences(text: string): string[] {
  const t = text.trim();
  if (!t) {
    return [];
  }
  const parts = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (parts.length <= 1 && !/[.!?]/.test(t)) {
    return [t];
  }
  return parts.length > 0 ? parts : [t];
}
