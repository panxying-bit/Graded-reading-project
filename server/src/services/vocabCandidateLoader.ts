import fs from "node:fs";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

let cached: string | null = null;

function pathToPrompt(): string {
  return resolveServerConfigFile(
    import.meta.url,
    "prompts",
    "vocab-candidate-prompt.md",
  );
}

/** Template with {{cefr}}, {{文章}}, {{避免词表}}, {{levelUnitRules}}, {{level4BandRules}}. */
export function getVocabCandidatePromptTemplate(): string {
  if (cached) {
    return cached;
  }
  cached = fs.readFileSync(pathToPrompt(), "utf8");
  return cached;
}

function formatExcludeHeadwordBlock(
  excludeHeadwords: string[] | undefined,
): string {
  if (!excludeHeadwords?.length) {
    return "No headwords are locked from other lessons (empty list). You may select any teachable items from the passage that follow the rules below.";
  }
  const lines = excludeHeadwords
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((w) => `- ${w}`);
  return [
    "The following `word` values (single lemmas **or** multi-word chunks) are **forbidden** — you must not include any of them in `candidates` (the teacher has already set them as 定表词 in another lesson in this same level). Match the **entire** string, case-insensitive:",
    "",
    ...lines,
  ].join("\n");
}

function formatLevel4BandRules(
  level: "level1" | "level2" | "level3" | "level4",
): string {
  if (level !== "level4") {
    return "";
  }
  return [
    "",
    "## Level 4 — Vocabulary band priority (CRITICAL for this level)",
    "",
    "This course level targets **CEFR A2** progression. When choosing the **5–7** `candidates`:",
    "- **Prioritize** teachable headwords that are **A2** or **B1** in difficulty: words that stretch learners beyond the most basic A1 core (topic words, slightly formal items, collocations, B1 content words when they appear naturally in the passage).",
    "- **Do not** make **A1** high-frequency items the **main** teaching focus of this list. If the passage offers a **clear A2 or B1 alternative** for the same idea in context, **prefer** the higher-band item. You may include **at most 1–2** A1 items only when they are **indispensable to the topic** and no reasonable A2/B1 option exists in the text.",
    "- If you must include an A1 word, it should be **exceptional** (e.g. the only way to name a key story object), not routine sight words like *go*, *big*, *see* when a more teachable A2/B1 item is available nearby.",
    "",
  ].join("\n");
}

function formatLevelUnitRules(
  level: "level1" | "level2" | "level3" | "level4",
): string {
  if (level === "level3" || level === "level4") {
    return [
      "## Unit of analysis (Level 3–4 — headwords and phrases)",
      "",
      "- **Default: single-word** headwords (same as general practice). **Do not** favour chunks over single words; there is **no** minimum or quota of multi-word items.",
      "- **When to use a chunk (2–4 words):** only when a **fixed, natural phrase** in the text is the sensible teaching unit—e.g. *go to bed*, *take a shower*, *in the end*—i.e. learning it as **one** chunk is more useful than breaking it apart. Do not glue random adjacent words for the sake of length.",
      "- Each `word` (one word or one chunk) must be a **contiguous** substring of its `sentence`, and that `sentence` must be **verbatim** from the passage (same words, spaces, punctuation).",
      "- **At most 4 words** in one `word` field; a single headword is fine for most items.",
      "- No more than **2** `candidates` from the same source sentence when possible; spread across sentences.",
    ].join("\n");
  }
  return [
    "## Unit of analysis (Level 1–2 — headword first)",
    "",
    "- Prefer **single-word** headwords at the target band; use a **short fixed phrase** only when the teaching point is clearly the whole unit.",
    "- `word` and `sentence` follow the same contiguous / verbatim rules as in Level 3.",
  ].join("\n");
}

export function buildVocabCandidateUserMessage(
  passage: string,
  cefr: string,
  level: "level1" | "level2" | "level3" | "level4",
  excludeHeadwords?: string[],
): string {
  return getVocabCandidatePromptTemplate()
    .replaceAll("{{cefr}}", cefr)
    .replaceAll("{{文章}}", passage)
    .replaceAll("{{避免词表}}", formatExcludeHeadwordBlock(excludeHeadwords))
    .replaceAll("{{levelUnitRules}}", formatLevelUnitRules(level))
    .replaceAll("{{level4BandRules}}", formatLevel4BandRules(level));
}
