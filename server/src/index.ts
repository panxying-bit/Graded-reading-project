import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  env,
  llmShouldOmitTemperature,
  resolveLlmBaseUrlForDisplay,
} from "./config/env.js";
import { generateBodySchema } from "./schemas/generateBody.js";
import { generateProofreadBodySchema } from "./schemas/generateProofreadBody.js";
import { generateRefineBodySchema } from "./schemas/generateRefineBody.js";
import { promptsPutBodySchema } from "./schemas/promptsPutBody.js";
import {
  getLevel,
  getLevelBaseFromYaml,
  getLevelsData,
} from "./services/levelsStore.js";
import {
  clearOverrideForLevel,
  getOverrideEntryForLevel,
  saveOverrideForLevel,
} from "./services/promptOverrideStore.js";
import {
  buildLevel1ProofreadMessages,
  buildLevel1RefineMessages,
  buildLevel2ProofreadMessages,
  buildLevel2RefineMessages,
  buildLevel3ProofreadMessages,
  buildLevel3RefineMessages,
  buildMessages,
  type ChatMessage,
} from "./services/promptResolver.js";
import { callChatCompletions, LlmError } from "./services/llmClient.js";
import {
  isBookPipelineLevel,
  isPagedBookLevel,
  type BookPipelineLevelId,
  type PagedBookLevelId,
} from "./bookPhase.js";
import { runLevel3WithWordRepair } from "./services/level3WordRepair.js";
import {
  callImageGeneration,
  isImageGenError,
  isVolcImageGenerationConfigured,
} from "./services/imageGenClient.js";
import { imageGenerateBodySchema } from "./schemas/imageGenerateBody.js";
import { getLessonPlan } from "./services/lessonCurriculum.js";
import {
  contentBriefIdeasBodySchema,
  contentBriefIdeasResponseSchema,
} from "./schemas/contentBriefIdeasBody.js";
import {
  sentencePatternBodySchema,
  sentencePatternResultSchema,
} from "./schemas/sentencePatternBody.js";
import {
  vocabCandidateBodySchema,
  vocabCandidateResponseSchema,
} from "./schemas/vocabCandidateBody.js";
import { buildContentBriefIdeasUserMessage } from "./services/contentBriefIdeasLoader.js";
import { buildSentencePatternUserMessage } from "./services/sentencePatternLoader.js";
import { buildVocabCandidateUserMessage } from "./services/vocabCandidateLoader.js";
import {
  filterLevel3CandidatesAgainstL0L2Mastery,
  filterLevel4CandidatesAgainstL0L3Mastery,
} from "./services/masteryWordlist.js";
import { filterCandidatesAgainstExcludeHeadwords } from "./services/vocabCandidateExclude.js";
import { extractPassageTextForPattern } from "./utils/extractPassageText.js";
import { canonicalVocabLemma } from "./utils/vocabHeadwordCanonical.js";
import { ttsBodySchema } from "./schemas/ttsBody.js";
import { synthesizeAzureSpeechToMp3 } from "./services/azureSpeechTts.js";
import {
  PACKAGE_DESCRIPTION,
  PACKAGE_VERSION,
} from "./packageInfo.js";

/** Non-LlmError catch: include upstream hint in JSON `message` for easier diagnosis. */
function formatInternalCatchMessage(e: unknown): string {
  const prefix = "Unexpected server error";
  if (e instanceof Error && e.message.trim()) {
    const m = e.message.trim();
    const tail = m.length > 1000 ? `${m.slice(0, 1000)}…` : m;
    return `${prefix}: ${tail}`;
  }
  const raw = typeof e === "string" ? e : String(e);
  const t = raw.trim();
  if (t && t !== "[object Object]") {
    const tail = t.length > 1000 ? `${t.slice(0, 1000)}…` : t;
    return `${prefix}: ${tail}`;
  }
  return prefix;
}

/** Chained illustration refs send prior page as data URLs (base64); default 1MB is too small. */
const app = Fastify({ logger: true, bodyLimit: 40 * 1024 * 1024 });

await app.register(cors, {
  origin: true,
});

// Browsers open `/` by default; this service is API-only without a static UI on 3000.
app.get("/", async () => ({
  ok: true,
  version: PACKAGE_VERSION,
  releaseNote: PACKAGE_DESCRIPTION,
  message: "Graded reading API. No HTML at /. Use the web app (e.g. Vite dev) or call /api/* below.",
  endpoints: {
    health: "GET /health",
    levels: "GET /api/levels",
    "level-lesson-plan": "GET /api/levels/:levelId/lessons",
    generate: "POST /api/generate",
    "generate-draft": "POST /api/generate/draft (level1|level2|level3|level4 stage 1)",
    "generate-refine": "POST /api/generate/refine (level1|level2|level3|level4 stage 2 精修)",
    "generate-proofread": "POST /api/generate/proofread (level1|level2|level3|level4 stage 3 定稿)",
    "image-generate": "POST /api/images/generate",
    "images-enabled":
      "GET /api/images/enabled (IMAGE_API_BASE_URL + IMAGE_API_KEY configured?)",
    "sentence-pattern":
      "POST /api/learning/sentence-pattern (定稿/课文句型+例句+变体; prompt: config/sentence-pattern-prompt.md)",
    "content-brief-ideas":
      "POST /api/learning/content-brief-ideas (AI 文本内容构思选项 list; prompt: config/content-brief-ideas-prompt.md)",
    "vocab-candidates":
      "POST /api/learning/vocab-candidates (定稿备选词; prompt: config/prompts/vocab-candidate-prompt.md)",
    "prompts-get-put": "GET|PUT|DELETE /api/prompts/:levelId",
    "speech-tts-enabled":
      "GET /api/speech/tts/enabled (Azure Speech configured? no secrets)",
    "speech-tts":
      "POST /api/speech/tts JSON { text } → audio/mpeg (Azure TTS; needs AZURE_SPEECH_KEY)",
  },
}));

app.get("/health", async () => ({
  ok: true,
  service: "graded-reading-platform",
  version: PACKAGE_VERSION,
}));

app.get("/api/health", async () => ({
  ok: true,
  service: "graded-reading-platform",
  version: PACKAGE_VERSION,
}));

app.get("/api/levels", async (request, reply) => {
  try {
    const data = getLevelsData();
    const defaultLessons = data.defaults?.lessonsPerLevel ?? 144;
    const levels = Object.entries(data.levels).map(([id, cfg]) => ({
      id,
      name: cfg.name,
      cefr: cfg.cefr,
      defaultWordCount: cfg.defaultWordCount,
      lessonsPerLevel: cfg.lessonsPerLevel ?? defaultLessons,
    }));
    return { levels };
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "LEVELS_CONFIG",
      message:
        e instanceof Error
          ? e.message
          : "Failed to load config/levels.yaml. See server logs.",
    });
  }
});

app.get<{
  Params: { levelId: string };
}>("/api/levels/:levelId/lessons", async (request, reply) => {
  const { levelId } = request.params;
  const plan = getLessonPlan(levelId);
  if (!plan) {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `No lesson plan JSON for this level: ${levelId}. Add server/config/lessons/${levelId}.json`,
    });
  }
  return plan;
});

app.get<{
  Params: { levelId: string };
}>("/api/prompts/:levelId", async (request, reply) => {
  const { levelId } = request.params;
  const base = getLevelBaseFromYaml(levelId);
  if (!base) {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `Unknown level: ${levelId}`,
    });
  }
  const def = getLevel(levelId);
  if (!def) {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `Unknown level: ${levelId}`,
    });
  }
  const o = getOverrideEntryForLevel(levelId);
  return {
    levelId,
    base: {
      system: base.system,
      userTemplate: base.userTemplate,
      referencePhases: base.referencePhases,
    },
    effective: {
      system: def.system,
      userTemplate: def.userTemplate,
      referencePhases: def.referencePhases,
    },
    hasOverride: Object.keys(o).length > 0,
  };
});

app.put<{
  Params: { levelId: string };
  Body: unknown;
}>("/api/prompts/:levelId", async (request, reply) => {
  const { levelId } = request.params;
  const base = getLevelBaseFromYaml(levelId);
  if (!base) {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `Unknown level: ${levelId}`,
    });
  }
  const parsed = promptsPutBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const { system, userTemplate, referencePhases } = parsed.data;
  const patch: Parameters<typeof saveOverrideForLevel>[2] = { system, userTemplate };
  if (referencePhases) {
    patch.referencePhases = referencePhases;
  }
  saveOverrideForLevel(levelId, base, patch);
  return { ok: true, message: "Saved to server/config/prompt-overrides.json" };
});

app.delete<{
  Params: { levelId: string };
}>("/api/prompts/:levelId", async (request, reply) => {
  const { levelId } = request.params;
  if (!getLevelBaseFromYaml(levelId)) {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `Unknown level: ${levelId}`,
    });
  }
  clearOverrideForLevel(levelId);
  return { ok: true, message: "Override cleared; YAML defaults are active." };
});

app.post<{
  Body: unknown;
}>("/api/generate", async (request, reply) => {
  const parsed = generateBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const {
    level,
    topic,
    lessonTitle,
    contentBrief,
    wordCount,
    lesson,
    fictionOrNonfiction,
    structureType,
    tenseFocus,
    genreFocus,
  } = parsed.data;
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  if (wordCount !== undefined && (!Number.isFinite(wordCount) || wordCount < 1)) {
    return reply.status(400).send({
      error: "INVALID_WORD_COUNT",
      message: "wordCount must be a positive integer",
    });
  }

  let messages: ReturnType<typeof buildMessages>;
  try {
    messages = buildMessages(def, {
      topic,
      lessonTitle,
      contentBrief,
      wordCount,
      lesson,
      levelId: level,
      fictionOrNonfiction,
      structureType,
      tenseFocus,
      genreFocus,
    });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "PROMPT_BUILD",
      message: e instanceof Error ? e.message : "Failed to build chat messages from templates",
    });
  }

  const needsBookJsonRepair =
    (isPagedBookLevel(level) && def.referencePhases != null) ||
    (level === "level1" && def.referencePhasesUnified != null) ||
    (level === "level2" && def.referencePhases != null);

  try {
    if (needsBookJsonRepair) {
      const { text, repairRounds, level3WordCount } =
        await runLevel3WithWordRepair(
          messages,
          lesson,
          level as BookPipelineLevelId,
          def.cefr,
        );
      return {
        level,
        cefr: def.cefr,
        text,
        level3WordCount: {
          ...level3WordCount,
          repairRounds,
        },
      };
    }
    const text = await callChatCompletions(messages);
    return {
      level,
      cefr: def.cefr,
      text,
    };
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
});

/** Level3 stage 1 — story quality + reference; no strict word-repair loop. */
app.post<{
  Body: unknown;
}>("/api/generate/draft", async (request, reply) => {
  const parsed = generateBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const {
    level,
    topic,
    lessonTitle,
    contentBrief,
    wordCount,
    lesson,
    fictionOrNonfiction,
    structureType,
    tenseFocus,
    genreFocus,
    draftExtraInstructions,
    previousDraftText,
  } = parsed.data;
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  const supportsDraft =
    (level === "level1" && def.referencePhasesUnified != null) ||
    (level === "level2" && def.referencePhases != null) ||
    (isPagedBookLevel(level) && def.referencePhases != null);
  if (!supportsDraft) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message:
        "POST /api/generate/draft requires level1 (referencePhasesUnified), level2 (referencePhases), or level3/level4 (referencePhases)",
    });
  }
  let messages: ReturnType<typeof buildMessages>;
  try {
    messages = buildMessages(def, {
      topic,
      lessonTitle,
      contentBrief,
      wordCount,
      lesson,
      levelId: level,
      fictionOrNonfiction,
      structureType,
      tenseFocus,
      genreFocus,
      level3Mode: "draft",
      draftExtraInstructions,
      previousDraftText,
    });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "PROMPT_BUILD",
      message: e instanceof Error ? e.message : "Failed to build draft messages",
    });
  }
  try {
    const text = await callChatCompletions(messages);
    return {
      stage: "draft" as const,
      level,
      cefr: def.cefr,
      text,
    };
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
});

/** Level3 stage 2 — fit draft to page + word bands (with repair). */
app.post<{
  Body: unknown;
}>("/api/generate/refine", async (request, reply) => {
  const parsed = generateRefineBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const {
    level,
    lesson,
    draftText,
    topic,
    lessonTitle,
    contentBrief,
    fictionOrNonfiction,
    structureType,
  } = parsed.data;
  if (!isBookPipelineLevel(level)) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "POST /api/generate/refine supports level1, level2, level3, level4 only",
    });
  }
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  let messages: ChatMessage[];
  try {
    messages =
      level === "level1"
        ? buildLevel1RefineMessages(draftText, {
            cefr: def.cefr,
            lesson,
            topic,
            lessonTitle,
            contentBrief,
            structureType,
          })
        : level === "level2"
          ? buildLevel2RefineMessages(draftText, {
              cefr: def.cefr,
              lesson,
              topic,
              lessonTitle,
              contentBrief,
              fictionOrNonfiction,
              structureType,
            })
          : buildLevel3RefineMessages(draftText, {
              levelId: level as PagedBookLevelId,
              cefr: def.cefr,
              lesson,
              topic,
              lessonTitle,
              contentBrief,
              fictionOrNonfiction,
            });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "PROMPT_BUILD",
      message: e instanceof Error ? e.message : "Failed to build refine messages",
    });
  }
  try {
    const { text, repairRounds, level3WordCount } =
      await runLevel3WithWordRepair(
        messages,
        lesson,
        level as BookPipelineLevelId,
        def.cefr,
      );
    return {
      stage: "refine" as const,
      level,
      cefr: def.cefr,
      text,
      level3WordCount: {
        ...level3WordCount,
        repairRounds,
      },
    };
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
});

/** Level3 stage 3 — spelling/grammar only; single model pass, no word-repair loop. */
app.post<{
  Body: unknown;
}>("/api/generate/proofread", async (request, reply) => {
  const parsed = generateProofreadBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const { level, bookText, lesson, topic, lessonTitle, contentBrief } =
    parsed.data;
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  if (!isBookPipelineLevel(level)) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "POST /api/generate/proofread supports level1, level2, level3, level4 only",
    });
  }
  let messages: ChatMessage[];
  try {
    messages =
      level === "level1"
        ? buildLevel1ProofreadMessages(bookText, {
            cefr: def.cefr,
            lesson,
            topic,
            lessonTitle,
            contentBrief,
          })
        : level === "level2"
          ? buildLevel2ProofreadMessages(bookText, {
              cefr: def.cefr,
              lesson,
              topic,
              lessonTitle,
              contentBrief,
            })
          : buildLevel3ProofreadMessages(bookText, {
              levelId: level as PagedBookLevelId,
              cefr: def.cefr,
              lesson,
              topic,
              lessonTitle,
              contentBrief,
            });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "PROMPT_BUILD",
      message: e instanceof Error ? e.message : "Failed to build proofread messages",
    });
  }
  try {
    const text = await callChatCompletions(messages);
    return {
      stage: "proofread" as const,
      level,
      cefr: def.cefr,
      text,
    };
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
});

/** Optional: AI-generated Chinese outline ideas for the content brief field (teacher picks or edits). */
app.post<{
  Body: unknown;
}>("/api/learning/content-brief-ideas", async (request, reply) => {
  const parsed = contentBriefIdeasBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const body = parsed.data;
  const def = getLevel(body.level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${body.level}`,
    });
  }
  const cefr = def.cefr ?? "A1";
  const levelLabel = def.name ?? body.level;
  const topic = body.topic?.trim() ?? "";
  const lessonTitle = body.lessonTitle?.trim() ?? "";
  const fic = body.fictionOrNonfiction ?? "fiction";
  const structureType = body.structureType?.trim() || "(not specified)";
  const genre = body.genreFocus?.trim();
  const tense = body.tenseFocus?.trim();
  const lessonLine =
    body.lesson != null
      ? `- Lesson slot (1-based index in course): **${body.lesson}**`
      : "- Lesson slot: (not specified)";
  const genreLine = genre
    ? `- Genre / form focus: **${genre}**`
    : "";
  const tenseLine = tense
    ? `- Tense / grammar focus: **${tense}**`
    : "";
  const userContent = buildContentBriefIdeasUserMessage({
    levelLabel,
    cefr,
    lessonLine,
    topic: topic || "(empty)",
    lessonTitle: lessonTitle || "(empty)",
    fictionOrNonfiction: fic,
    structureType,
    genreLine,
    tenseLine,
    countMin: 5,
    countMax: 7,
  });
  const system: ChatMessage = {
    role: "system",
    content:
      "You help teachers plan graded English readers. Follow the user instructions exactly. Reply with one valid JSON object only, key \"ideas\" (array of strings), no markdown code fences, no extra keys.",
  };
  const user: ChatMessage = { role: "user", content: userContent };
  const messages: ChatMessage[] = [system, user];
  let raw: string;
  try {
    try {
      raw = await callChatCompletions(messages, {
        temperature: 0.65,
        responseFormat: { type: "json_object" },
      });
    } catch (e) {
      if (e instanceof LlmError && e.statusCode === 400) {
        request.log.warn(
          "content-brief-ideas: retrying without response_format (provider may not support json_object mode)",
        );
        raw = await callChatCompletions(messages, { temperature: 0.65 });
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped) as unknown;
  } catch {
    return reply.status(502).send({
      error: "INVALID_JSON",
      message: "Model did not return valid JSON for content brief ideas.",
    });
  }
  const out = contentBriefIdeasResponseSchema.safeParse(data);
  if (!out.success) {
    return reply.status(502).send({
      error: "SCHEMA",
      message: out.error.message,
    });
  }
  return { ideas: out.data.ideas };
});

/** After final text: one core pattern, exemplar in text, variations, teaching focus. Prompt: server/config/sentence-pattern-prompt.md */
app.post<{
  Body: unknown;
}>("/api/learning/sentence-pattern", async (request, reply) => {
  const parsed = sentencePatternBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const { level, text, patternExtraInstructions, providedPatternStructure } =
    parsed.data;
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  const cefr = def.cefr ?? "A1";
  const passage = extractPassageTextForPattern(text);
  if (!passage.trim()) {
    return reply.status(400).send({
      error: "EMPTY_PASSAGE",
      message: "No text to analyze after parsing (empty or invalid).",
    });
  }
  const hasTeacherNote = Boolean(patternExtraInstructions?.trim());
  const hasProvidedPattern = Boolean(providedPatternStructure?.trim());
  const spTemperature =
    hasTeacherNote || hasProvidedPattern ? 0.55 : 0.35;
  const system: ChatMessage = {
    role: "system",
    content:
      "You are an expert in English for young and teenage learners. Follow the user instructions exactly. Reply with a single valid JSON object only, no markdown code fences, no extra keys." +
      (hasProvidedPattern
        ? " When Teacher-provided target pattern appears first in the user message, that pattern is mandatory for the JSON pattern field."
        : "") +
      (hasTeacherNote
        ? " When a teacher re-analysis block is present, it overrides a generic choice: search the full passage, select pattern and example to satisfy the teacher, not only the first part of the text."
        : ""),
  };
  const user: ChatMessage = {
    role: "user",
    content: buildSentencePatternUserMessage(
      passage,
      cefr,
      patternExtraInstructions,
      providedPatternStructure,
    ),
  };
  const messages: ChatMessage[] = [system, user];
  let raw: string;
  try {
    try {
      raw = await callChatCompletions(messages, {
        temperature: spTemperature,
        responseFormat: { type: "json_object" },
      });
    } catch (e) {
      if (e instanceof LlmError && e.statusCode === 400) {
        request.log.warn(
          "sentence-pattern: retrying without response_format (provider may not support json_object mode)",
        );
        raw = await callChatCompletions(messages, { temperature: spTemperature });
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped) as unknown;
  } catch {
    return reply.status(502).send({
      error: "INVALID_JSON",
      message: "Model did not return valid JSON for sentence pattern.",
    });
  }
  const out = sentencePatternResultSchema.safeParse(data);
  if (!out.success) {
    return reply.status(502).send({
      error: "SCHEMA",
      message: out.error.message,
    });
  }
  const { exampleSentence, ...rest } = out.data;
  const exTrim = exampleSentence.trim();
  const exampleMatchedInText =
    passage.includes(exampleSentence) ||
    (exTrim.length > 0 && passage.includes(exTrim));
  return {
    level,
    cefr,
    exampleSentence,
    exampleMatchedInText,
    ...rest,
  };
});

/** Step 1 vocabulary pool: 5–7 teachable words from passage. Prompt: config/prompts/vocab-candidate-prompt.md */
app.post<{
  Body: unknown;
}>("/api/learning/vocab-candidates", async (request, reply) => {
  const parsed = vocabCandidateBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const { level, text, excludeHeadwords } = parsed.data;
  const def = getLevel(level);
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: `Unknown level: ${level}`,
    });
  }
  const cefr = def.cefr ?? "A1";
  const passage = extractPassageTextForPattern(text);
  if (!passage.trim()) {
    return reply.status(400).send({
      error: "EMPTY_PASSAGE",
      message: "No text to analyze after parsing (empty or invalid).",
    });
  }
  const system: ChatMessage = {
    role: "system",
    content:
      "You are an expert in English for young and teenage learners. Follow the user instructions exactly. Reply with a single valid JSON object only, with the key `candidates` (array) as specified. No markdown code fences, no extra top-level keys.",
  };
  const user: ChatMessage = {
    role: "user",
    content: buildVocabCandidateUserMessage(
      passage,
      cefr,
      level,
      excludeHeadwords,
    ),
  };
  const messages: ChatMessage[] = [system, user];
  let raw: string;
  try {
    try {
      raw = await callChatCompletions(messages, {
        temperature: 0.4,
        responseFormat: { type: "json_object" },
      });
    } catch (e) {
      if (e instanceof LlmError && e.statusCode === 400) {
        request.log.warn(
          "vocab-candidates: retrying without response_format (provider may not support json_object mode)",
        );
        raw = await callChatCompletions(messages, { temperature: 0.4 });
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof LlmError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped) as unknown;
  } catch {
    return reply.status(502).send({
      error: "INVALID_JSON",
      message: "Model did not return valid JSON for vocabulary candidates.",
    });
  }
  const out = vocabCandidateResponseSchema.safeParse(data);
  if (!out.success) {
    return reply.status(502).send({
      error: "SCHEMA",
      message: out.error.message,
    });
  }
  let candidates = out.data.candidates.map((c) => ({
    ...c,
    word: canonicalVocabLemma(c.word),
  }));
  let excludedByPriorMastery: { word: string; sentence: string }[] | undefined;
  let priorMasteryFilterNote: string | undefined;
  if (level === "level3") {
    const { kept, removed } = filterLevel3CandidatesAgainstL0L2Mastery(
      candidates,
    );
    candidates = kept;
    if (removed.length > 0) {
      excludedByPriorMastery = removed;
      priorMasteryFilterNote = `已剔除 ${
        removed.length
      } 个与 Level 0–2 词表（Mastery 核心词）重名的候选项；剩余 ${kept.length} 个。`;
    }
  } else if (level === "level4") {
    const { kept, removed } = filterLevel4CandidatesAgainstL0L3Mastery(
      candidates,
    );
    candidates = kept;
    if (removed.length > 0) {
      excludedByPriorMastery = removed;
      priorMasteryFilterNote = `已剔除 ${
        removed.length
      } 个与 Level 0–3 词表（Mastery 核心词）重名的候选项；剩余 ${kept.length} 个。`;
    }
  }
  let excludedByOtherLessons:
    | { word: string; sentence: string }[]
    | undefined;
  let otherLessonsFilterNote: string | undefined;
  {
    const { kept, removed } = filterCandidatesAgainstExcludeHeadwords(
      candidates,
      excludeHeadwords,
    );
    candidates = kept;
    if (removed.length > 0) {
      excludedByOtherLessons = removed;
      otherLessonsFilterNote = `已剔除 ${
        removed.length
      } 个与本级别其他课已保存「定表词」重名的候选项；剩余 ${kept.length} 个。`;
    }
  }
  return {
    level,
    cefr,
    candidates,
    ...(excludedByPriorMastery
      ? { excludedByPriorMastery, priorMasteryFilterNote }
      : {}),
    ...(excludedByOtherLessons
      ? { excludedByOtherLessons, otherLessonsFilterNote }
      : {}),
  };
});

app.get("/api/images/enabled", async (): Promise<{
  enabled: boolean;
  provider: "volc" | "getimg" | null;
  /** Server-side soft cap for POST /api/images/generate prompt (Jimeng/getimg). */
  promptMaxChars: number;
  /** True when ILLUSTRATION_DEBUG_MINIMAL_PROMPT is set (client prompt + refs ignored). */
  debugMinimalPromptActive: boolean;
}> => {
  const volc = isVolcImageGenerationConfigured();
  const getimg = Boolean(
    env.imageApiBaseUrl?.trim() && env.imageApiKey?.trim(),
  );
  const provider = volc ? "volc" : getimg ? "getimg" : null;
  return {
    enabled: volc || getimg,
    provider,
    promptMaxChars: env.imagePromptMaxChars,
    debugMinimalPromptActive: env.illustrationDebugMinimalPrompt.length > 0,
  };
});

app.post<{
  Body: unknown;
}>("/api/images/generate", async (request, reply) => {
  const parsed = imageGenerateBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  let { prompt, referenceImageUrls, layoutPreset, qualityTier } =
    parsed.data;
  if (env.illustrationDebugMinimalPrompt) {
    request.log.warn(
      {
        clientPromptLen: prompt.length,
        hadRefs: Boolean(referenceImageUrls?.length),
        replacedBy: "ILLUSTRATION_DEBUG_MINIMAL_PROMPT",
      },
      "[imageGen] debug minimal prompt — ignoring client body prompt and reference images",
    );
    prompt = env.illustrationDebugMinimalPrompt;
    referenceImageUrls = undefined;
  }
  try {
    const out = await callImageGeneration({
      prompt,
      referenceImageUrls,
      layoutPreset,
      qualityTier,
    });
    const t = out.timings;
    request.log.info(
      `[imageGen] ok provider=${t.provider} serverTotalMs=${t.serverTotalMs}` +
        (t.volcSubmitMs != null ? ` volcSubmitMs=${t.volcSubmitMs}` : "") +
        (t.volcPollHttpMs != null ? ` volcPollHttpMs=${t.volcPollHttpMs}` : "") +
        (t.volcPollSleepMs != null ? ` volcPollSleepMs=${t.volcPollSleepMs}` : "") +
        (t.volcPollAttempts != null ? ` attempts=${t.volcPollAttempts}` : "") +
        (t.getimgUpstreamMs != null ? ` getimgUpstreamMs=${t.getimgUpstreamMs}` : ""),
    );
    return {
      imageUrl: out.imageUrl,
      b64Json: out.b64Json,
      model: isVolcImageGenerationConfigured()
        ? env.volcVisualReqKey
        : env.imageModel,
      timings: out.timings,
    };
  } catch (e) {
    if (isImageGenError(e)) {
      if (e.code === "VOLC_TASK" || e.code === "VOLC_API" || e.code === "VOLC_SDK") {
        request.log.warn(
          {
            imageGenCode: e.code,
            statusCode: e.statusCode,
            messagePreview: e.message.slice(0, 1200),
          },
          "[imageGen] upstream image error",
        );
      }
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: formatInternalCatchMessage(e),
    });
  }
});

app.get("/api/speech/tts/enabled", async () => ({
  enabled: Boolean(env.azureSpeechKey?.trim()),
}));

app.post<{
  Body: unknown;
}>("/api/speech/tts", async (request, reply) => {
  if (!env.azureSpeechKey?.trim()) {
    return reply.status(503).send({
      error: "TTS_DISABLED",
      message:
        "Azure Speech is not configured. Set AZURE_SPEECH_KEY (and optional AZURE_SPEECH_REGION / AZURE_SPEECH_VOICE) in .env.",
    });
  }
  const parsed = ttsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "INVALID_BODY",
      message: parsed.error.flatten().formErrors.join("; ") || "Invalid body",
    });
  }
  const { text } = parsed.data;
  try {
    const buf = await synthesizeAzureSpeechToMp3({
      text,
      subscriptionKey: env.azureSpeechKey,
      region: env.azureSpeechRegion,
      voiceName: env.azureSpeechVoice,
    });
    return reply
      .header("Content-Type", "audio/mpeg")
      .header("Cache-Control", "private, max-age=86400")
      .send(buf);
  } catch (e) {
    request.log.error(e);
    return reply.status(502).send({
      error: "TTS_UPSTREAM",
      message: e instanceof Error ? e.message : "Speech synthesis failed",
    });
  }
});

try {
  const port =
    Number.isFinite(env.port) && env.port > 0 ? env.port : 3000;
  await app.listen({ port, host: "0.0.0.0" });
  let llmHost = "";
  try {
    const base = resolveLlmBaseUrlForDisplay() || env.llmBaseUrl;
    llmHost = new URL(base).host;
  } catch {
    llmHost = "(invalid LLM_BASE_URL / LLM_CHAT_COMPLETIONS_URL)";
  }
  app.log.info(
    {
      llmHost,
      model: env.llmModel,
      maxTokens: env.llmDisableMaxTokens
        ? "(omitted, LLM_DISABLE_MAX_TOKENS=1)"
        : (env.llmMaxTokens ?? "(default, not set)"),
      timeoutMs: env.llmTimeoutMs,
      level3OmitReference: env.llmLevel3OmitReference,
      level3CompactPrompt: env.llmLevel3CompactPrompt,
      omitTemperature: llmShouldOmitTemperature(),
      customAuthorization: Boolean(env.llmAuthorization),
    },
    "LLM: host / model / max_tokens / timeout / level3 ref (Key is not logged).",
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
