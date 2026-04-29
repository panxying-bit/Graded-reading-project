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
  buildLevel3ProofreadMessages,
  buildLevel3RefineMessages,
  buildMessages,
} from "./services/promptResolver.js";
import { callChatCompletions, LlmError } from "./services/llmClient.js";
import { runLevel3WithWordRepair } from "./services/level3WordRepair.js";
import {
  callImageGeneration,
  ImageGenError,
} from "./services/imageGenClient.js";
import { imageGenerateBodySchema } from "./schemas/imageGenerateBody.js";
import { getLessonPlan } from "./services/lessonCurriculum.js";
import {
  sentencePatternBodySchema,
  sentencePatternResultSchema,
} from "./schemas/sentencePatternBody.js";
import { buildSentencePatternUserMessage } from "./services/sentencePatternLoader.js";
import { extractPassageTextForPattern } from "./utils/extractPassageText.js";
import type { ChatMessage } from "./services/promptResolver.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
});

// Browsers open `/` by default; this service is API-only without a static UI on 3000.
app.get("/", async () => ({
  ok: true,
  message: "Graded reading API. No HTML at /. Use the web app (e.g. Vite dev) or call /api/* below.",
  endpoints: {
    health: "GET /health",
    levels: "GET /api/levels",
    "level-lesson-plan": "GET /api/levels/:levelId/lessons",
    generate: "POST /api/generate",
    "generate-draft": "POST /api/generate/draft (level3 stage 1)",
    "generate-refine": "POST /api/generate/refine (level3 stage 2 精修)",
    "generate-proofread": "POST /api/generate/proofread (level3 stage 3 定稿)",
    "image-generate": "POST /api/images/generate",
    "sentence-pattern":
      "POST /api/learning/sentence-pattern (定稿/课文句型+例句+变体; prompt: config/sentence-pattern-prompt.md)",
    "prompts-get-put": "GET|PUT|DELETE /api/prompts/:levelId",
  },
}));

app.get("/health", async () => ({
  ok: true,
  service: "graded-reading-platform",
}));

app.get("/api/health", async () => ({
  ok: true,
  service: "graded-reading-platform",
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

  const isLevel3Phased = level === "level3" && def.referencePhases != null;

  try {
    if (isLevel3Phased) {
      const { text, repairRounds, level3WordCount } = await runLevel3WithWordRepair(
        messages,
        lesson,
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
      message: "Unexpected server error",
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
    wordCount,
    lesson,
    fictionOrNonfiction,
    structureType,
    tenseFocus,
    genreFocus,
    draftExtraInstructions,
    previousDraftText,
  } = parsed.data;
  if (level !== "level3") {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "POST /api/generate/draft is only for level: level3",
    });
  }
  const def = getLevel(level);
  if (!def?.referencePhases) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "Level3 reference phases missing in config",
    });
  }
  let messages: ReturnType<typeof buildMessages>;
  try {
    messages = buildMessages(def, {
      topic,
      lessonTitle,
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
      message: "Unexpected server error",
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
  const { lesson, draftText, topic, lessonTitle, fictionOrNonfiction } =
    parsed.data;
  const def = getLevel("level3");
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "Unknown level: level3",
    });
  }
  let messages: ReturnType<typeof buildLevel3RefineMessages>;
  try {
    messages = buildLevel3RefineMessages(draftText, {
      lesson,
      topic,
      lessonTitle,
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
    const { text, repairRounds, level3WordCount } = await runLevel3WithWordRepair(
      messages,
      lesson,
    );
    return {
      stage: "refine" as const,
      level: "level3",
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
      message: "Unexpected server error",
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
  const { bookText, lesson, topic, lessonTitle } = parsed.data;
  const def = getLevel("level3");
  if (!def) {
    return reply.status(400).send({
      error: "INVALID_LEVEL",
      message: "Unknown level: level3",
    });
  }
  let messages: ReturnType<typeof buildLevel3ProofreadMessages>;
  try {
    messages = buildLevel3ProofreadMessages(bookText, {
      lesson,
      topic,
      lessonTitle,
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
      level: "level3",
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
      message: "Unexpected server error",
    });
  }
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
  const { level, text, patternExtraInstructions } = parsed.data;
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
      "You are an expert in English for young and teenage learners. Follow the user instructions exactly. Reply with a single valid JSON object only, no markdown code fences, no extra keys.",
  };
  const user: ChatMessage = {
    role: "user",
    content: buildSentencePatternUserMessage(
      passage,
      cefr,
      patternExtraInstructions,
    ),
  };
  const messages: ChatMessage[] = [system, user];
  let raw: string;
  try {
    try {
      raw = await callChatCompletions(messages, {
        temperature: 0.35,
        responseFormat: { type: "json_object" },
      });
    } catch (e) {
      if (e instanceof LlmError && e.statusCode === 400) {
        request.log.warn(
          "sentence-pattern: retrying without response_format (provider may not support json_object mode)",
        );
        raw = await callChatCompletions(messages, { temperature: 0.35 });
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
      message: "Unexpected server error",
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
  const { prompt, referenceImageUrls } = parsed.data;
  try {
    const out = await callImageGeneration({ prompt, referenceImageUrls });
    return {
      imageUrl: out.imageUrl,
      b64Json: out.b64Json,
      model: env.imageModel,
    };
  } catch (e) {
    if (e instanceof ImageGenError) {
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
      });
    }
    request.log.error(e);
    return reply.status(500).send({
      error: "INTERNAL",
      message: e instanceof Error ? e.message : "Image generation failed",
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
