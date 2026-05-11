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

function buildProvidedPatternLead(teacherText: string): string {
  return `## Teacher-provided target pattern (MANDATORY)

Skip open-ended "pick the most representative pattern" from the task. The teacher **already chose** the grammatical target.

Rules:
- Fill JSON field \`pattern\` from the teacher's text below: either **verbatim** if it is already an abstract scaffold (slots like **[subject]** / **[verb]**) **or** one short abstract line that preserves **exactly** the structure they want to teach (do **not** replace with a different grammar focus).
- Scan the **entire** passage and set \`exampleSentence\` to **one sentence copied verbatim** from the passage that matches **this** pattern.
- \`whyPattern\`: brief English note on how this pattern fits the passage.
- \`variations\`: exactly **3** new sentences that use **this same teacher pattern**, same difficulty as the example, within the lesson CEFR band.

**Teacher's target pattern:**

${teacherText}`;
}

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
  providedPatternStructure?: string,
): string {
  const tpl = getSentencePatternPromptTemplate();
  const base = tpl
    .replaceAll("{{cefr}}", cefr)
    .replaceAll("{{文章}}", passage);
  const note = patternExtraInstructions?.trim();
  const provided = providedPatternStructure?.trim();
  if (!note && !provided) {
    return base;
  }
  const providedBlock = provided ? buildProvidedPatternLead(provided) : "";
  if (provided && !note) {
    return `${providedBlock}\n\n---\n\n${base}`;
  }
  if (!provided && note) {
    return `${TEACHER_LEAD}
${note}

---

${base}
${TEACHER_TRAIL}
${note}
`;
  }
  return `${providedBlock}

---

${TEACHER_LEAD}
${note}

---

${base}
${TEACHER_TRAIL}
${note}
`;
}
