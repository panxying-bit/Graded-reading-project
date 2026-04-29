import fs from "node:fs";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

let cached: string | null = null;

function pathToPrompt(): string {
  return resolveServerConfigFile(
    import.meta.url,
    "sentence-pattern-prompt.md",
  );
}

/** Full markdown template; use {{cefr}} and {{文章}}. Appends teacher block when set. */
export function getSentencePatternPromptTemplate(): string {
  if (cached) {
    return cached;
  }
  cached = fs.readFileSync(pathToPrompt(), "utf8");
  return cached;
}

const TEACHER_NOTES_EN =
  "Teacher instructions (MUST follow — re-choose the pattern, example sentence, and all JSON fields to satisfy this; the previous run may be suboptimal):";

export function buildSentencePatternUserMessage(
  passage: string,
  cefr: string,
  patternExtraInstructions?: string,
): string {
  const tpl = getSentencePatternPromptTemplate();
  let s = tpl.replaceAll("{{cefr}}", cefr).replaceAll("{{文章}}", passage);
  const note = patternExtraInstructions?.trim();
  if (note) {
    s += `

---

**${TEACHER_NOTES_EN}**

${note}
`;
  }
  return s;
}
