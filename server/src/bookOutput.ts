/**
 * Level3 book JSON: parse and word count (aligned with web/src/parseBookOutput.ts).
 * Used server-side to validate and trigger repair rounds.
 */

type BookPage = {
  page: number;
  text: string;
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
  if (typeof text === "string" || text == null) {
    return true;
  }
  return false;
}

export function tryParseBookOutput(raw: string) {
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
    pages: p.map((x) => {
      const pg = x as Record<string, unknown>;
      const rawText = pg.text;
      const text =
        typeof rawText === "string" ? rawText : rawText == null ? "" : "";
      return {
        page: Number((x as BookPage).page),
        text,
      };
    }),
  };
}

function countEnglishWords(text: string): number {
  const t = text.trim();
  if (!t) {
    return 0;
  }
  return t.split(/\s+/).length;
}

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
