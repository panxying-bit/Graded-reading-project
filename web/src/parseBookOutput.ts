/**
 * Model output for level3 (see levels.yaml): OpenAI JSON mode may still wrap in ``` fences.
 */

export type BookPage = {
  page: number;
  text: string;
  scene_note?: string;
};

export type BookOutput = {
  title?: string;
  level?: string;
  structure_type?: string;
  pages: BookPage[];
};

function stripCodeFences(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m && m[1] ? m[1].trim() : t;
}

function isPage(x: unknown): x is BookPage {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as Record<string, unknown>;
  const page = o.page;
  if (
    !(typeof page === "number" || typeof page === "string") ||
    !Number.isFinite(Number(page))
  ) {
    return false;
  }
  const text = o.text;
  // Allow missing / null text so the book still parses (coerced to "" in tryParseBookOutput).
  if (typeof text === "string" || text == null) {
    return true;
  }
  return false;
}

/**
 * If `raw` is valid level3-style book JSON, returns the parsed object; else null.
 */
export function tryParseBookOutput(raw: string): BookOutput | null {
  const unwrapped = stripCodeFences(raw);
  if (!unwrapped.startsWith("{")) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !("pages" in parsed)) {
    return null;
  }
  const p = (parsed as { pages: unknown }).pages;
  if (!Array.isArray(p) || p.length === 0) {
    return null;
  }
  if (!p.every(isPage)) {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    level: typeof o.level === "string" ? o.level : undefined,
    structure_type:
      typeof o.structure_type === "string" ? o.structure_type : undefined,
    pages: p.map((x) => {
      const pg = x as Record<string, unknown>;
      const rawText = pg.text;
      const text =
        typeof rawText === "string" ? rawText : rawText == null ? "" : "";
      return {
        page: Number((x as BookPage).page),
        text,
        scene_note:
          typeof (x as BookPage).scene_note === "string"
            ? (x as BookPage).scene_note
            : undefined,
      };
    }),
  };
}

/**
 * Flat text for clipboard / plain export.
 */
export function bookToPlainText(book: BookOutput): string {
  const lines: string[] = [];
  if (book.title?.trim()) {
    lines.push(book.title.trim(), "");
  }
  const sorted = [...book.pages].sort((a, b) => a.page - b.page);
  for (const pg of sorted) {
    lines.push(`Page ${pg.page}`, pg.text, "");
  }
  return lines.join("\n").trim();
}

/** English word count: non-empty segments split on whitespace. */
export function countEnglishWords(text: string): number {
  const t = text.trim();
  if (!t) {
    return 0;
  }
  return t.split(/\s+/).length;
}

/**
 * Total words in generated output (plain or level3 book body from page texts).
 */
export function countWordsInModelOutput(raw: string): number {
  const book = tryParseBookOutput(raw);
  if (book) {
    const body = book.pages
      .map((p) => p.text)
      .join(" ")
      .trim();
    return countEnglishWords(body);
  }
  return countEnglishWords(raw);
}
