import { env } from "../config/env.js";
import type { LevelConfig } from "../types/levels.js";
import {
  getLevel1Band,
  getLevel1WordCountBounds,
  getLevel2Band,
  getLevel2WordCountBounds,
  getPagedBookBand,
  getPagedBookWordCountBoundsForTarget,
  isPagedBookLevel,
  type Level1Band,
  type Level2Band,
  type PagedBookBand,
  type PagedBookLevelId,
} from "../bookPhase.js";

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

/** Optional teacher outline; may be Chinese or English. */
function buildContentBriefBlock(contentBrief: string | undefined): string {
  const t = contentBrief?.trim();
  if (!t) {
    return "";
  }
  return ` Content outline (from teacher; may be Chinese or English; guide the story, do not paste verbatim): ${t}`;
}

function applyTemplate(
  template: string,
  vars: {
    topic: string;
    /** Raw; may be empty. */
    lessonTitle: string;
    lessonTitleBlock: string;
    contentBrief: string;
    contentBriefBlock: string;
    wordCount: number;
    fictionOrNonfiction: "fiction" | "nonfiction";
    structureType: string;
    /** Empty string when the user does not request a tense focus. */
    tenseFocusBlock: string;
    /** Empty string when the user does not request a subgenre. */
    genreFocusBlock: string;
    pagedBook?: PagedBookBand;
  },
): string {
  const fi = vars.fictionOrNonfiction;
  const fiLabel =
    fi === "nonfiction" ? "nonfiction (非虚构)" : "fiction (虚构)";

  let t = template
    .replaceAll("{{topic}}", vars.topic)
    .replaceAll("{{lessonTitle}}", vars.lessonTitle)
    .replaceAll("{{lessonTitleBlock}}", vars.lessonTitleBlock)
    .replaceAll("{{contentBrief}}", vars.contentBrief)
    .replaceAll("{{contentBriefBlock}}", vars.contentBriefBlock)
    .replaceAll("{{wordCount}}", String(vars.wordCount))
    .replaceAll("{{fictionOrNonfiction}}", fi)
    .replaceAll("{{fictionOrNonfictionLabel}}", fiLabel)
    .replaceAll("{{structureType}}", vars.structureType)
    .replaceAll("{{tenseFocusBlock}}", vars.tenseFocusBlock)
    .replaceAll("{{genreFocusBlock}}", vars.genreFocusBlock);

  if (vars.pagedBook) {
    const p = vars.pagedBook;
    // Per-page average depends on 6–8 pages: more words/page when fewer pages.
    const wppLo = p.targetWords / p.pageCountMax;
    const wppHi = p.targetWords / p.pageCountMin;
    const b = getPagedBookWordCountBoundsForTarget(p.targetWords);
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

/** Inject Level 1 curriculum placeholders into system/user templates. */
/** Inject Level 2 curriculum placeholders (short-book bands). */
function injectLevel2PhaseVars(
  template: string,
  band: Level2Band,
  bounds: { min: number; max: number; target: number },
): string {
  const pMin = band.pageCountMin;
  const pMax = band.pageCountMax;
  const wppLo = bounds.target / pMax;
  const wppHi = bounds.target / pMin;
  const avgLo = Math.max(2, Math.floor(wppLo) - 1);
  const avgHi = Math.min(12, Math.ceil(wppHi) + 1);
  return template
    .replaceAll("{{phaseRange}}", band.phaseRange)
    .replaceAll("{{pageCountMin}}", String(pMin))
    .replaceAll("{{pageCountMax}}", String(pMax))
    .replaceAll("{{targetWordCount}}", String(band.targetWords))
    .replaceAll("{{wordCountMin}}", String(bounds.min))
    .replaceAll("{{wordCountMax}}", String(bounds.max))
    .replaceAll("{{minWordsPerSentence}}", String(band.minWordsPerSentence))
    .replaceAll("{{maxWordsPerSentence}}", String(band.maxWordsPerSentence))
    .replaceAll("{{avgWordsPerPageLo}}", String(avgLo))
    .replaceAll("{{avgWordsPerPageHi}}", String(avgHi));
}

function injectLevel1PhaseVars(
  template: string,
  band: Level1Band,
  bounds: { min: number; max: number; target: number },
): string {
  const pc = band.pageCountMax;
  return template
    .replaceAll("{{phaseRange}}", band.phaseRange)
    .replaceAll("{{targetWordTotal}}", String(band.targetWords))
    .replaceAll("{{wordCountMin}}", String(bounds.min))
    .replaceAll("{{wordCountMax}}", String(bounds.max))
    .replaceAll("{{pageCount}}", String(pc))
    .replaceAll("{{minPhraseWords}}", String(band.minPhraseWords))
    .replaceAll("{{maxPhraseWords}}", String(band.maxPhraseWords))
    .replaceAll("{{phraseLineMin}}", String(band.phraseLineMin))
    .replaceAll("{{phraseLineMax}}", String(band.phraseLineMax));
}

/**
 * Shorter Level3 prompts — cuts request body size for gateways that 503 on large bodies
 * (full YAML + JSON wrapper was often ~4k+ chars; compact is often ~1.5–2.5k).
 */
function buildLevel3CompactSystemUser(
  c: {
    cefrBand: string;
    topic: string;
    lessonTitleBlock: string;
    contentBriefBlock: string;
    fictionOrNonfiction: "fiction" | "nonfiction";
    structureType: string;
    tenseFocusBlock: string;
    genreFocusBlock: string;
    level3: PagedBookBand;
  },
): { system: string; user: string } {
  const p = c.level3;
  const b = getPagedBookWordCountBoundsForTarget(p.targetWords);
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

  const system = `You are an EFL expert for children. CEFR ${c.cefrBand} (lessons **${p.phaseRange}**).
**Mode: ${fi}.** **Layout: ${c.structureType}.**${c.tenseFocusBlock}${c.genreFocusBlock}
Output ONE "book" as **JSON** only. **${pMin}–${pMax}** pages; each: "page" (1…N) and "text" (1–2 full sentences, ~${p.minWordsPerSentence}–${p.maxWordsPerSentence} words per sentence).
**Pattern practice (do not misread this):** In **at least five** sentences **across the whole book**, reuse the **same grammar frame** (e.g. "There is/are …", "She/He + verb + object", or a repeated opener) — but **each of those sentences must use different words and new story information**. **Never** paste the same full sentence on more than one page. **Each page must advance the story**; no filler repetition of the same line (e.g. the same "looks at the clock" line on every page is wrong).
**Word total (HARD):** all words in all "text" fields, ${b.min}–${b.max} (aim ~${b.target}; split on spaces). ~${avgLo}–${avgHi} words per page. If over ${b.max}, shorten before you reply.
${fiLine}
Reply with **one JSON object** only, no code fences, no other text. Straight double quotes; escape internal quotes. "pages" must be length ${pMin}–${pMax} in order.`;

  const user = `Topic: ${c.topic}.${c.lessonTitleBlock}${c.contentBriefBlock} Mode **${c.fictionOrNonfiction}**. One JSON as in the system.`;

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
    /** Optional outline of what the passage should cover (any language). */
    contentBrief?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefRaw = options.contentBrief?.trim() ?? "";
  const contentBriefBlock = buildContentBriefBlock(contentBriefRaw);
  const fictionOrNonfiction =
    options.fictionOrNonfiction ?? DEFAULT_FICTION;
  const structureRaw = (
    options.structureType?.trim() || DEFAULT_STRUCTURE
  ) as string;
  let structureType =
    structureRaw === "unspecified"
      ? "not specified (choose the structure that best fits the topic and CEFR level)"
      : structureRaw;

  const level1Phased =
    options.levelId === "level1" && def.referencePhasesUnified != null;
  const level1Band = level1Phased ? getLevel1Band(options.lesson) : undefined;
  const level2Phased =
    options.levelId === "level2" && def.referencePhases != null;
  const level2Band = level2Phased ? getLevel2Band(options.lesson) : undefined;
  if (level1Phased) {
    const st = options.structureType?.trim();
    if (!st || st === "unspecified" || st === "linear") {
      structureType = "labeling";
    }
  }

  const pagedLevelId =
    options.levelId && isPagedBookLevel(options.levelId)
      ? (options.levelId as PagedBookLevelId)
      : null;
  const isPagedBookPhased =
    pagedLevelId != null && def.referencePhases != null;
  const level3Draft = options.level3Mode === "draft";
  const pagedBand = isPagedBookPhased
    ? getPagedBookBand(pagedLevelId, options.lesson)
    : undefined;
  const wordCount = pagedBand
    ? pagedBand.targetWords
    : level1Band
      ? level1Band.targetWords
      : level2Band
        ? level2Band.targetWords
        : (options.wordCount ?? def.defaultWordCount);

  const tenseFocusBlock = buildTenseFocusBlock(options.tenseFocus);
  const genreFocusBlock = buildGenreFocusBlock(options.genreFocus);
  const ctx = {
    topic,
    lessonTitle: lessonTitleRaw,
    lessonTitleBlock,
    contentBrief: contentBriefRaw,
    contentBriefBlock,
    wordCount,
    fictionOrNonfiction,
    structureType,
    tenseFocusBlock,
    genreFocusBlock,
    pagedBook: pagedBand,
  };

  let systemContent: string;
  let compactUser: string | null = null;
  if (
    isPagedBookPhased &&
    pagedBand &&
    env.llmLevel3CompactPrompt &&
    !level3Draft
  ) {
    const compact = buildLevel3CompactSystemUser({
      cefrBand: def.cefr,
      topic,
      lessonTitleBlock,
      contentBriefBlock,
      fictionOrNonfiction,
      structureType,
      tenseFocusBlock,
      genreFocusBlock,
      level3: pagedBand,
    });
    systemContent = compact.system;
    compactUser = compact.user;
  } else {
    systemContent = applyTemplate(def.system, ctx).trim();
    if (level1Phased && level1Band) {
      const lb = getLevel1WordCountBounds(level1Band.targetWords);
      systemContent = injectLevel1PhaseVars(systemContent, level1Band, lb);
    } else if (level2Band) {
      const wb = getLevel2WordCountBounds(options.lesson);
      systemContent = injectLevel2PhaseVars(systemContent, level2Band, wb);
    }
  }

  if (level2Phased && def.referencePhases && level2Band) {
    const pMin = level2Band.pageCountMin;
    const pMax = level2Band.pageCountMax;
    const key = level2Band.key;
    const band =
      key === "early"
        ? def.referencePhases.early
        : key === "mid"
          ? def.referencePhases.mid
          : def.referencePhases.late;
    const bandLessons =
      key === "early" ? "1–48" : key === "mid" ? "49–96" : "97–144";
    const phaseR = level2Band.phaseRange;
    const refRaw =
      fictionOrNonfiction === "nonfiction" ? band.nonfiction : band.fiction;
    const ref = applyTemplate(refRaw, ctx).trim();
    if (env.llmLevel3OmitReference && !level3Draft) {
      systemContent += `

---
(Curriculum REFERENCE sample was omitted to shorten the request. You still follow Level 2 rules: **${fictionOrNonfiction}**, **${pMin}–${pMax}** pages, sentence length, word band, JSON only; write original text for the user's topic — do not copy training samples.)`;
    } else {
      systemContent += `

---
REFERENCE for lessons **${phaseR}** (band **${bandLessons}**): **only** the **${fictionOrNonfiction}** sample below. Imitate **voice and classroom English**; do **not** copy wording or topic. Your output: **one JSON object**, **${pMin}–${pMax}** pages, new content for the user's topic/lesson.

${ref}`;
    }
    if (level3Draft) {
      const wb = getLevel2WordCountBounds(options.lesson);
      systemContent += `

---
**STAGE 1 — DRAFT (Level 2):** Prioritize an engaging, coherent mini-book that matches the user topic and imitates the **REFERENCE** tone. Output **one valid JSON** with **${pMin}–${pMax}** pages. Total English words in all "text" fields should be **roughly** **${wb.min}–${wb.max}** (target ~${wb.target}), but **story flow** comes first; a later step will tighten counts. Each sentence about **${level2Band.minWordsPerSentence}–${level2Band.maxWordsPerSentence}** words.`;
    }
  }

  if (isPagedBookPhased && def.referencePhases) {
    const pMin = pagedBand?.pageCountMin ?? 6;
    const pMax = pagedBand?.pageCountMax ?? 8;
    if (env.llmLevel3OmitReference && !level3Draft) {
      systemContent += `

---
(Curriculum REFERENCE sample was omitted to shorten the request. You still follow **${fictionOrNonfiction}** and the engagement rules in the system text above. For **fiction**: narrative with characters + problem + resolution, not a bullet list. JSON only; ${pMin}–${pMax} pages; original text for the topic/lesson — do not copy training samples.)`;
    } else {
      const key = pagedBand?.key ?? "early";
      const band =
        key === "early"
          ? def.referencePhases.early
          : key === "mid"
            ? def.referencePhases.mid
            : def.referencePhases.late;
      const bandLessons =
        key === "early" ? "1–48" : key === "mid" ? "49–96" : "97–144";
      const phaseR = pagedBand?.phaseRange ?? bandLessons;
      const refRaw =
        fictionOrNonfiction === "nonfiction" ? band.nonfiction : band.fiction;
      const ref = applyTemplate(refRaw, ctx).trim();
      systemContent += `

---
REFERENCE for lessons **${phaseR}** (band **${bandLessons}**): **only** the **${fictionOrNonfiction}** sample below (not the other mode, not other bands). Imitate voice and classroom English; do not copy content. Your output: one JSON object, ${pMin}–${pMax} pages, as in "Output format" above; new text for the user topic/lesson title.

${ref}`;
    }
    if (level3Draft && pagedBand) {
      const b = getPagedBookWordCountBoundsForTarget(pagedBand.targetWords);
      const pMin = pagedBand.pageCountMin;
      const pMax = pagedBand.pageCountMax;
      systemContent += `

---
**STAGE 1 — DRAFT (quality and story first):** Prioritize an engaging, coherent mini-book that matches the user topic/lesson and imitates the **REFERENCE** voice and classroom English above. Output **one valid JSON** with a "pages" array of **${pMin}–${pMax}** pages (choose 6, 7, or 8). Total English words in all "text" fields should be **roughly** in the **${b.min}–${b.max}** band (target ~${b.target}), but **story flow and interest beat exact counts** in this pass; a later step will enforce exact curriculum limits. Do not repeat the same full sentence on multiple pages.`;
    }
  }

  if (level1Phased && def.referencePhasesUnified && level1Band) {
    const pc = level1Band.pageCountMax;
    if (env.llmLevel3OmitReference && !level3Draft) {
      systemContent += `

---
(Curriculum REFERENCE sample was omitted to shorten the request. You still follow Level 1 rules above: **${pc}** pages; phrase length ${level1Band.minPhraseWords}–${level1Band.maxPhraseWords} words per page; total words in band; JSON only; original text for the user's topic — do not copy training samples.)`;
    } else {
      const refRaw =
        level1Band.key === "early"
          ? def.referencePhasesUnified.early
          : level1Band.key === "mid"
            ? def.referencePhasesUnified.mid
            : def.referencePhasesUnified.late;
      const ref = applyTemplate(refRaw, ctx).trim();
      systemContent += `

---
REFERENCE for lessons **${level1Band.phaseRange}**: imitate **voice and classroom English** only; do **not** copy topics or wording. Your output: **one JSON object**, exactly **${pc}** pages, new content for the user's topic and structure type.

${ref}`;
    }
    if (level3Draft) {
      const b = getLevel1WordCountBounds(level1Band.targetWords);
      systemContent += `

---
**STAGE 1 — DRAFT (Level 1):** Match the user topic and **REFERENCE** tone. Output **one valid JSON** with exactly **${pc}** pages; total English words in all "text" fields roughly **${b.min}–${b.max}** (target ~${b.target}), but natural phrase rhythm comes first; a later step will tighten counts. Each page: **${level1Band.minPhraseWords}–${level1Band.maxPhraseWords}** words; same structure pattern on every line.`;
    }
  } else if (!isPagedBookPhased && !level1Phased && def.referenceSample) {
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
  if (level1Phased && level1Band && compactUser == null) {
    const lb = getLevel1WordCountBounds(level1Band.targetWords);
    userContent = injectLevel1PhaseVars(userContent, level1Band, lb);
  } else if (level2Band && compactUser == null) {
    const wb = getLevel2WordCountBounds(options.lesson);
    userContent = injectLevel2PhaseVars(userContent, level2Band, wb);
  }

  if ((isPagedBookPhased || level1Phased || level2Phased) && level3Draft) {
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
 * Level 1 stage 2 — six pages, phrase length + word band.
 */
export function buildLevel1RefineMessages(
  draftText: string,
  options: {
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
    structureType?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const band = getLevel1Band(options.lesson);
  const b = getLevel1WordCountBounds(band.targetWords);
  const st = options.structureType?.trim();
  const structureLine = st
    ? `Keep the user's **structure type**: **${st}** — every page line follows that same pattern (labeling or repeated frame).`
    : "Keep a consistent simple pattern across all pages (labeling or repeated frame).";

  const system = `You are an EFL editor for children's graded reading (CEFR ${options.cefr}), Level 1 curriculum band **lessons ${band.phaseRange}**.

The teacher will paste a **draft** book as one JSON object (they may have edited it). Output **one final JSON object** that:
- Preserves the **same topic meaning** as the draft; you may rephrase page lines.
- **Exactly 6** pages in order ("page": 1…6); each "text" is **one** phrase/sentence of **${band.minPhraseWords}–${band.maxPhraseWords}** English words (split on spaces).
- Total English word count in all "text" fields must be **between ${b.min} and ${b.max}** inclusive (aim ~${b.target}).
- ${structureLine}
- Pre-A1 only: no complex sentences; vocabulary very simple.

Reply with **one JSON object only** (no markdown). Shape: optional "title"; "pages": [{"page": number, "text": string}, …].`;

  const user = `Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

---
DRAFT (revise into the final JSON that meets all limits above):

${draftText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Level 1 stage 3 — proofread only.
 */
export function buildLevel1ProofreadMessages(
  bookText: string,
  options: {
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const phaseR = getLevel1Band(options.lesson).phaseRange;
  const cefr = options.cefr.trim() || "Pre-A1";

  const system = `You are a careful **copy-editor** for children's graded reading English (CEFR ${cefr}), Level 1 band **lessons ${phaseR}**.

You will receive **one JSON object** with optional "title" and **"pages"** (exactly 6 entries).

**PROOFREAD ONLY.** Fix only objective errors in "text" (and "title" if present): spelling, grammar, punctuation. Keep the **same** story meaning, **6** pages, same order and page numbers. Do **not** add/remove pages. Do **not** rewrite for style.

Reply with **exactly one valid JSON object** (no markdown).`;

  const user = `Context (tone only): Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

---
JSON to proofread:

${bookText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Level 2 stage 2 — short A1 JSON book; sentence length + word band.
 */
export function buildLevel2RefineMessages(
  draftText: string,
  options: {
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
    fictionOrNonfiction?: "fiction" | "nonfiction";
    structureType?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const fictionOrNonfiction =
    options.fictionOrNonfiction ?? DEFAULT_FICTION;
  const band = getLevel2Band(options.lesson);
  const b = getLevel2WordCountBounds(options.lesson);
  const pMin = band.pageCountMin;
  const pMax = band.pageCountMax;
  const phaseR = band.phaseRange;
  const cefr = options.cefr.trim() || "A1";
  const st = options.structureType?.trim();
  const structureLine = st
    ? `Keep the user's **structure type**: **${st}**. At least **four** sentences must share the same **grammar frame** with different details — do not repeat the same full sentence on two pages.`
    : "Keep one clear structure type; at least four sentences share the same grammar frame with different details.";

  const system = `You are an EFL editor for children's graded reading (CEFR ${cefr}), Level 2 band **lessons ${phaseR}** (about ages 6–7).

The teacher will paste a **draft** book as one JSON object (possibly edited). Output **one final JSON object** that:
- Preserves the **same story meaning and topic** as the draft. You may rephrase or shorten.
- **${pMin}–${pMax}** pages in order; each "text": **one or two** complete sentences; **each sentence** **${band.minWordsPerSentence}–${band.maxWordsPerSentence}** words (split on spaces).
- Total English words in all "text" fields: **${b.min}–${b.max}** inclusive (aim ~${b.target}).
- ${structureLine}
- **Mode:** **${fictionOrNonfiction}** (match the draft). Simple grammar only; no complex clauses.

Reply with **one JSON object only** (no markdown). Shape: optional "title"; "pages": [{"page": number, "text": string}, …].`;

  const user = `Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

---
DRAFT (revise into the final JSON that meets all limits above):

${draftText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Level 2 stage 3 — proofread only.
 */
export function buildLevel2ProofreadMessages(
  bookText: string,
  options: {
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const phaseR = getLevel2Band(options.lesson).phaseRange;
  const cefr = options.cefr.trim() || "A1";

  const system = `You are a careful **copy-editor** for children's graded reading English (CEFR ${cefr}), Level 2 band **lessons ${phaseR}**.

You will receive **one JSON object** with optional "title" and **"pages"**.

**PROOFREAD ONLY.** Fix only objective errors in "text" (and "title" if present): spelling, grammar, punctuation. Keep the **same** meaning, **same** number of pages, same order and page numbers. Do **not** add or remove pages. Do **not** rewrite for style.

Reply with **exactly one valid JSON object** (no markdown).`;

  const user = `Context (tone only): Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

---
JSON to proofread:

${bookText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Stage 2: tighten draft JSON to exact page and word bands; teacher draft may be edited.
 */
export function buildLevel3RefineMessages(
  draftText: string,
  options: {
    levelId: PagedBookLevelId;
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    fictionOrNonfiction?: "fiction" | "nonfiction";
    contentBrief?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const fictionOrNonfiction =
    options.fictionOrNonfiction ?? DEFAULT_FICTION;
  const band = getPagedBookBand(options.levelId, options.lesson);
  const b = getPagedBookWordCountBoundsForTarget(band.targetWords);
  const pMin = band.pageCountMin;
  const pMax = band.pageCountMax;
  const phaseR = band.phaseRange;
  const cefr = options.cefr.trim() || "A1+";

  const system = `You are an EFL editor for children's graded reading (CEFR ${cefr}), curriculum band **lessons ${phaseR}**.

The teacher will paste a **draft** book as one JSON object (they may have edited it). Your job is to output **one final JSON object** that:
- Preserves the **same story meaning, characters, and topic** as the draft. You may rephrase, shorten, or expand; you may merge or split ideas across pages; do **not** invent a new plot or new main events.
- Meets **hard** limits: **${pMin}–${pMax}** pages in order ("page": 1…N), each "text" is 1–2 complete sentences in simple, band-appropriate English.
- Total English word count (sum of all words in all "text" fields; split on spaces) must be **between ${b.min} and ${b.max}** inclusive (aim ~${b.target}).
- **Do not** repeat the same full sentence on more than one page. For pattern practice, at least **five** sentences in the book may share the same **grammar frame** (e.g. "There is/are …") with **different details** each time.
- **Mode:** **${fictionOrNonfiction}** (match the draft).

Reply with **one JSON object only** (no markdown code fences, no other text). Shape: optional "title"; "pages" as an array of {"page": number, "text": string}.`;

  const user = `Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

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
    levelId: PagedBookLevelId;
    cefr: string;
    lesson?: number;
    topic?: string;
    lessonTitle?: string;
    contentBrief?: string;
  },
): ChatMessage[] {
  const topic = (options.topic?.trim() || DEFAULT_TOPIC) as string;
  const lessonTitleRaw = options.lessonTitle?.trim() ?? "";
  const lessonTitleBlock = buildLessonTitleBlock(lessonTitleRaw);
  const contentBriefBlock = buildContentBriefBlock(options.contentBrief);
  const phaseR = getPagedBookBand(options.levelId, options.lesson).phaseRange;
  const cefr = options.cefr.trim() || "A1+";

  const system = `You are a careful **copy-editor** for children's graded reading English (CEFR ${cefr}), curriculum band **lessons ${phaseR}**.

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

  const user = `Context (for tone only): Topic: ${topic}.${lessonTitleBlock}${contentBriefBlock}

---
JSON to proofread (return the same structure with corrections only):

${bookText.trim()}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
