import { env } from "../config/env.js";
import type { LevelConfig } from "../types/levels.js";
import {
  getLevel3Phase,
  getLevel3WordCountBoundsForTarget,
  type Level3PhaseInfo,
} from "../level3Phase.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const DEFAULT_TOPIC = "everyday life";
const DEFAULT_FICTION: "fiction" | "nonfiction" = "fiction";
const DEFAULT_STRUCTURE = "linear";

function buildTenseFocusBlock(tenseFocus: string | undefined): string {
  const t = tenseFocus?.trim();
  if (!t) {
    return "";
  }
  return `

Tense focus (per user request): Prioritize **${t}** in the finite verbs and time references across the text. This should read natural for the CEFR level; do not force the tense in every clause if the meaning would be odd. If the chosen tense is narrow (e.g. a modal focus), use it in many, but not necessarily all, sentences.`;
}

function buildGenreFocusBlock(genreFocus: string | undefined): string {
  const g = genreFocus?.trim();
  if (!g) {
    return "";
  }
  return `

Reading form / subgenre (per user request): Write the text as **${g}**, while keeping the **fiction** vs **nonfiction** choice above, the word and sentence limits, and the CEFR level. If the form needs a small moral (e.g. fable), a “once upon a time” feel (fairy tale), or a clear how-to list, use simple, band-appropriate English; do not add advanced literary devices.`;
}

/** Optional second line when a specific lesson title is given (e.g. from curriculum outline). */
function buildLessonTitleBlock(lessonTitle: string | undefined): string {
  const t = lessonTitle?.trim();
  if (!t) {
    return "";
  }
  return ` Specific lesson title (main focus; you may use it as the JSON "title" when it fits): **${t}**.`;
}

function applyTemplate(
  template: string,
  vars: {
    topic: string;
    /** Raw; may be empty. */
    lessonTitle: string;
    lessonTitleBlock: string;
    wordCount: number;
    fictionOrNonfiction: "fiction" | "nonfiction";
    structureType: string;
    /** Empty string when the user does not request a tense focus. */
    tenseFocusBlock: string;
    /** Empty string when the user does not request a subgenre. */
    genreFocusBlock: string;
    level3?: Level3PhaseInfo;
  },
): string {
  const fi = vars.fictionOrNonfiction;
  const fiLabel =
    fi === "nonfiction" ? "nonfiction (非虚构)" : "fiction (虚构)";

  let t = template
    .replaceAll("{{topic}}", vars.topic)
    .replaceAll("{{lessonTitle}}", vars.lessonTitle)
    .replaceAll("{{lessonTitleBlock}}", vars.lessonTitleBlock)
    .replaceAll("{{wordCount}}", String(vars.wordCount))
    .replaceAll("{{fictionOrNonfiction}}", fi)
    .replaceAll("{{fictionOrNonfictionLabel}}", fiLabel)
    .replaceAll("{{structureType}}", vars.structureType)
    .replaceAll("{{tenseFocusBlock}}", vars.tenseFocusBlock)
    .replaceAll("{{genreFocusBlock}}", vars.genreFocusBlock);

  if (vars.level3) {
    const p = vars.level3;
    // Per-page average depends on 6–8 pages: more words/page when fewer pages.
    const wppLo = p.targetWords / p.pageCountMax;
    const wppHi = p.targetWords / p.pageCountMin;
    const b = getLevel3WordCountBoundsForTarget(p.targetWords);
    const wordCountMin = b.min;
    const wordCountMax = b.max;
    const avgLo = Math.max(4, Math.floor(wppLo) - 1);
    const avgHi = Math.min(18, Math.ceil(wppHi) + 2);
    t = t
      .replaceAll("{{pageCountMin}}", String(p.pageCountMin))
      .replaceAll("{{pageCountMax}}", String(p.pageCountMax))
      .replaceAll("{{targetWordCount}}", String(p.targetWords))
      .replaceAll("{{minWordsPerSentence}}", String(p.minWordsPerSentence))
      .replaceAll("{{maxWordsPerSentence}}", String(p.maxWordsPerSentence))
      .replaceAll("{{phaseRange}}", p.phaseRange)
      .replaceAll("{{wordCountMin}}", String(wordCountMin))
      .replaceAll("{{wordCountMax}}", String(wordCountMax))
      .replaceAll("{{avgWordsPerPageLo}}", String(avgLo))
      .replaceAll("{{avgWordsPerPageHi}}", String(avgHi));
  }

  return t;
}

/**
 * Shorter Level3 prompts — cuts request body size for gateways that 503 on large bodies
 * (full YAML + JSON wrapper was often ~4k+ chars; compact is often ~1.5–2.5k).
 */
function buildLevel3CompactSystemUser(
  c: {
    topic: string;
    lessonTitleBlock: string;
    fictionOrNonfiction: "fiction" | "nonfiction";
    structureType: string;
    tenseFocusBlock: string;
    genreFocusBlock: string;
    level3: Level3PhaseInfo;
  },
): { system: string; user: string } {
  const p = c.level3;
  const b = getLevel3WordCountBoundsForTarget(p.targetWords);
  const wppLo = p.targetWords / p.pageCountMax;
  const wppHi = p.targetWords / p.pageCountMin;
  const avgLo = Math.max(4, Math.floor(wppLo) - 1);
  const avgHi = Math.min(18, Math.ceil(wppHi) + 2);
  const pMin = p.pageCountMin;
  const pMax = p.pageCountMax;
  const fi = c.fictionOrNonfiction;
  const fiLine =
    fi === "nonfiction"
      ? "Nonfiction: hook → facts → close; one memorable or surprising fact; no invented statistics."
      : "Fiction — must read like a **story**, not a list: 1–2 named characters and a setting; a small problem or worry; they try or ask; a surprise or slightly funny beat; an ending with a feeling (happy / relieved / surprised). Short dialogue is ok. Arc: intro → problem → action → resolution.";

  const system = `You are an EFL expert for children. CEFR A1+ (lessons **${p.phaseRange}**).
**Mode: ${fi}.** **Layout: ${c.structureType}.**${c.tenseFocusBlock}${c.genreFocusBlock}
Output ONE "book" as **JSON** only. **${pMin}–${pMax}** pages; each: "page" (1…N) and "text" (1–2 full sentences, ~${p.minWordsPerSentence}–${p.maxWordsPerSentence} words per sentence).
**Pattern practice (do not misread this):** In **at least five** sentences **across the whole book**, reuse the **same grammar frame** (e.g. "There is/are …", "She/He + verb + object", or a repeated opener) — but **each of those sentences must use different words and new story information**. **Never** paste the same full sentence on more than one page. **Each page must advance the story**; no filler repetition of the same line (e.g. the same "looks at the clock" line on every page is wrong).
**Word total (HARD):** all words in all "text" fields, ${b.min}–${b.max} (aim ~${b.target}; split on spaces). ~${avgLo}–${avgHi} words per page. If over ${b.max}, shorten before you reply.
${fiLine}
Reply with **one JSON object** only, no code fences, no other text. Straight double quotes; escape internal quotes. "pages" must be length ${pMin}–${pMax} in order.`;

  const user = `Topic: ${c.topic}.${c.lessonTitleBlock} Mode **${c.fictionOrNonfiction}**. One JSON as in the system.`;

  return { system, user };
}

/**
 * Fills userTemplate and returns OpenAI-style chat messages.
 */
export function buildMessages(
  def: LevelConfig,
  options: {
    topic?: string;
    lessonTitle?: string;
    wordCount?: number;
    fictionOrNonfiction?: "fiction" | "nonfiction";
    structureType?: string;
    /** English phrase for the model, e.g. "past simple" (optional). */
    tenseFocus?: string;
    /** e.g. "a fairy tale" (optional; refines form on top of fiction/nonfiction). */
    genreFocus?: string;
    /** When set with level3 + referencePhases, drives targets and reference text. */
    lesson?: number;
    levelId?: string;
    /**
     * Level3 only. `draft` = full prompt + reference, story quality first; exact word/page
     * bounds are relaxed in the copy. Ignores LLM_LEVEL3_COMPACT_PROMPT and forces reference on.
     */
    level3Mode?: "default" | "draft";
    /** Level3 draft: optional extra instructions (first gen or regenerate). */
    draftExtraInstructions?: string;
    /** Level3 draft regenerate: previous 初稿 JSON. */
    previousDraftText?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const fictionOrNonfiction =
    options.fictionOrNonfiction ?? DEFAULT_FICTION;
  const structureRaw = (
    options.structureType?.trim() || DEFAULT_STRUCTURE
  ) as string;
  const structureType =
    structureRaw === "unspecified"
      ? "not specified (choose the structure that best fits the topic and CEFR level)"
      : structureRaw;

  const isLevel3Phased =
    options.levelId === "level3" && def.referencePhases != null;
  const level3Draft = options.level3Mode === "draft";
  const level3Phase = isLevel3Phased
    ? getLevel3Phase(options.lesson)
    : undefined;
  const wordCount = level3Phase
    ? level3Phase.targetWords
    : (options.wordCount ?? def.defaultWordCount);

  const tenseFocusBlock = buildTenseFocusBlock(options.tenseFocus);
  const genreFocusBlock = buildGenreFocusBlock(options.genreFocus);
  const ctx = {
    topic,
    lessonTitle: lessonTitleRaw,
    lessonTitleBlock,
    wordCount,
    fictionOrNonfiction,
    structureType,
    tenseFocusBlock,
    genreFocusBlock,
    level3: level3Phase,
  };

  let systemContent: string;
  let compactUser: string | null = null;
  if (
    isLevel3Phased &&
    level3Phase &&
    env.llmLevel3CompactPrompt &&
    !level3Draft
  ) {
    const compact = buildLevel3CompactSystemUser({
      topic,
      lessonTitleBlock,
      fictionOrNonfiction,
      structureType,
      tenseFocusBlock,
      genreFocusBlock,
      level3: level3Phase,
    });
    systemContent = compact.system;
    compactUser = compact.user;
  } else {
    systemContent = applyTemplate(def.system, ctx).trim();
  }

  if (isLevel3Phased && def.referencePhases) {
    const pMin = level3Phase?.pageCountMin ?? 6;
    const pMax = level3Phase?.pageCountMax ?? 8;
    if (env.llmLevel3OmitReference && !level3Draft) {
      systemContent += `

---
(Curriculum REFERENCE sample was omitted to shorten the request. You still follow **${fictionOrNonfiction}** and the engagement rules in the system text above. For **fiction**: narrative with characters + problem + resolution, not a bullet list. JSON only; ${pMin}–${pMax} pages; original text for the topic/lesson — do not copy training samples.)`;
    } else {
      const key = level3Phase?.key ?? "early";
      const band =
        key === "early"
          ? def.referencePhases.early
          : key === "mid"
            ? def.referencePhases.mid
            : def.referencePhases.late;
      const bandLessons =
        key === "early" ? "1–48" : key === "mid" ? "49–96" : "97–144";
      const phaseR = level3Phase?.phaseRange ?? bandLessons;
      const refRaw =
        fictionOrNonfiction === "nonfiction" ? band.nonfiction : band.fiction;
      const ref = applyTemplate(refRaw, ctx).trim();
      systemContent += `

---
REFERENCE for lessons **${phaseR}** (band **${bandLessons}**): **only** the **${fictionOrNonfiction}** sample below (not the other mode, not other bands). Imitate voice and classroom English; do not copy content. Your output: one JSON object, ${pMin}–${pMax} pages, as in "Output format" above; new text for the user topic/lesson title.

${ref}`;
    }
    if (level3Draft && level3Phase) {
      const b = getLevel3WordCountBoundsForTarget(level3Phase.targetWords);
      const pMin = level3Phase.pageCountMin;
      const pMax = level3Phase.pageCountMax;
      systemContent += `

---
**STAGE 1 — DRAFT (quality and story first):** Prioritize an engaging, coherent mini-book that matches the user topic/lesson and imitates the **REFERENCE** voice and classroom English above. Output **one valid JSON** with a "pages" array of **${pMin}–${pMax}** pages (choose 6, 7, or 8). Total English words in all "text" fields should be **roughly** in the **${b.min}–${b.max}** band (target ~${b.target}), but **story flow and interest beat exact counts** in this pass; a later step will enforce exact curriculum limits. Do not repeat the same full sentence on multiple pages.`;
    }
  } else if (def.referenceSample) {
    const refBlock = applyTemplate(def.referenceSample, ctx).trim();
    systemContent += `

---
REFERENCE example (imitate the agreed format and style only. Write original content for the topics given in the user message.):

${refBlock}`;
  }

  let userContent =
    compactUser != null
      ? compactUser
      : applyTemplate(def.userTemplate, ctx).trim();

  if (isLevel3Phased && level3Draft) {
    const inst = options.draftExtraInstructions?.trim();
    const prev = options.previousDraftText?.trim();
    const extraBlocks: string[] = [];
    if (inst) {
      extraBlocks.push(
        `**Instructions from the teacher (what to emphasize, what was wrong, or the revision direction; may be Chinese or English):**\n${inst}`,
      );
    }
    if (prev) {
      extraBlocks.push(
        `**Previous draft JSON to replace** (keep the same topic/lesson; address the instructions above; output one **new** full book JSON, not a patch or partial update):\n${prev}`,
      );
    }
    if (extraBlocks.length) {
      userContent += `\n\n---\n\n${extraBlocks.join("\n\n---\n\n")}\n\n---`;
    }
  }

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}

/**
 * Stage 2: tighten draft JSON to exact page and word bands; teacher draft may be edited.
 */
export function buildLevel3RefineMessages(
  draftText: string,
  options: {
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    fictionOrNonfiction?: "fiction" | "nonfiction";
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const fictionOrNonfiction =
    options.fictionOrNonfiction ?? DEFAULT_FICTION;
  const level3Phase = getLevel3Phase(options.lesson);
  const b = getLevel3WordCountBoundsForTarget(level3Phase.targetWords);
  const pMin = level3Phase.pageCountMin;
  const pMax = level3Phase.pageCountMax;
  const phaseR = level3Phase.phaseRange;

  const system = `You are an EFL editor for children's graded reading (CEFR A1+), curriculum band **lessons ${phaseR}**.

The teacher will paste a **draft** book as one JSON object (they may have edited it). Your job is to output **one final JSON object** that:
- Preserves the **same story meaning, characters, and topic** as the draft. You may rephrase, shorten, or expand; you may merge or split ideas across pages; do **not** invent a new plot or new main events.
- Meets **hard** limits: **${pMin}–${pMax}** pages in order ("page": 1…N), each "text" is 1–2 complete sentences in simple, band-appropriate English.
- Total English word count (sum of all words in all "text" fields; split on spaces) must be **between ${b.min} and ${b.max}** inclusive (aim ~${b.target}).
- **Do not** repeat the same full sentence on more than one page. For pattern practice, at least **five** sentences in the book may share the same **grammar frame** (e.g. "There is/are …") with **different details** each time.
- **Mode:** **${fictionOrNonfiction}** (match the draft).

Reply with **one JSON object only** (no markdown code fences, no other text). Shape: optional "title"; "pages" as an array of {"page": number, "text": string}.`;

  const user = `Topic: ${topic}.${lessonTitleBlock}

---
DRAFT (revise into the final JSON that meets all limits above):

${draftText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Stage 3: proofread only — spelling, grammar, punctuation; same JSON shape and length.
 */
export function buildLevel3ProofreadMessages(
  bookText: string,
  options: {
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const phaseR = getLevel3Phase(options.lesson).phaseRange;

  const system = `You are a careful **copy-editor** for children's graded reading English (CEFR A1+), curriculum band **lessons ${phaseR}**.

You will receive **one JSON object** with optional "title" and a **"pages"** array of objects like {"page": number, "text": string, ...}.

**STAGE 3 — PROOFREAD ONLY.** Your job is **only**:
- Fix only **objective language errors** in "text" fields (and "title" if present):
  - spelling / typos
  - grammar errors
  - punctuation errors
  - clearly wrong collocations (unnatural word combinations that are incorrect in context)
- Keep **the same story, same meaning, same number of pages, same page order, and same page numbers**. Do **not** add or remove pages. Do **not** merge or split pages. Do **not** change the plot, characters, or facts.
- If a sentence is already acceptable, keep it **exactly unchanged**.
- Do **not** rewrite for style, tone, rhythm, vocabulary upgrade, or "sound better".
- Do **not** paraphrase whole sentences. Change only the minimum tokens needed to fix the error.
- Keep sentence count per page unchanged; keep page text length as close as possible.

Priority rule: when uncertain whether something is an error or a stylistic choice, **do not change it**.

Reply with **exactly one valid JSON object** (no markdown code fences, no text before or after). The output shape must match the input (same keys per page; only string contents may be corrected).`;

  const user = `Context (for tone only): Topic: ${topic}.${lessonTitleBlock}

---
JSON to proofread (return the same structure with corrections only):

${bookText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
