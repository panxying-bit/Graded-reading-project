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

const TEACHER_LEAD = `## Re-analysis — teacher is changing the target pattern

**Read this block first. It overrides a generic "most representative" choice.**

- Search the **entire** passage below, including the **last pages/paragraphs**, not only the opening. Long books often contain the best match for the teacher in a later part.
- Pick \`exampleSentence\` and \`pattern\` that **satisfy the teacher's text** (teachers may write in Chinese, English, or both).
- Do not repeat a previous or first-paragraph default if the teacher asks for something else from the same passage.
- The teacher's line appears again after the full passage as a final reminder; both copies are binding.

**Teacher (binding):**`;

const TEACHER_TRAIL = `

---

**Reminder (same as above — still binding; pick pattern + example to match this, scanning the full passage):**
`;

/**
 * When teacher instructions exist, they are prepended and repeated at the end so
 * long multi-page passages (Level 3) do not bury them after the user message.
 */
export function buildSentencePatternUserMessage(
  passage: string,
  cefr: string,
  patternExtraInstructions?: string,
): string {
  const tpl = getSentencePatternPromptTemplate();
  const base = tpl
    .replaceAll("{{cefr}}", cefr)
    .replaceAll("{{文章}}", passage);
  const note = patternExtraInstructions?.trim();
  if (!note) {
    return base;
  }
  return `${TEACHER_LEAD}
${note}

---

${base}
${TEACHER_TRAIL}
${note}
`;
}
