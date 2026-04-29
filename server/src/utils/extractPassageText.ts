/**
 * Build a plain reading passage for sentence-pattern analysis.
 * Level3 book JSON: join page bodies with blank lines. Otherwise return trimmed text.
 */
export function extractPassageTextForPattern(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{")) {
    return t;
  }
  const unwrapped = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const o = JSON.parse(unwrapped) as { pages?: unknown };
    if (o && typeof o === "object" && Array.isArray(o.pages)) {
      const parts: string[] = [];
      for (const p of o.pages as Array<{ text?: unknown }>) {
        const text =
          typeof p.text === "string" ? p.text.trim() : "";
        if (text) {
          parts.push(text);
        }
      }
      if (parts.length > 0) {
        return parts.join("\n\n");
      }
    }
  } catch {
    // fall through
  }
  return t;
}
