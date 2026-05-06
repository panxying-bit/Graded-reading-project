import { z } from "zod";

export const generateBodySchema = z.object({
  level: z.string().min(1),
  topic: z.string().optional(),
  /** Specific lesson title (e.g. from outline); optional. */
  lessonTitle: z.string().max(2000).optional(),
  /** Optional outline of what the text should cover (any language). */
  contentBrief: z.string().max(4000).optional(),
  wordCount: z.number().int().positive().max(10_000).optional(),
  /** 1..N — for level3 selects word/sentence band and reference passage. */
  lesson: z.number().int().min(1).max(500).optional(),
  fictionOrNonfiction: z.enum(["fiction", "nonfiction"]).optional(),
  structureType: z.string().min(1).max(100).optional(),
  /** English phrase for the model, e.g. "past simple". Optional. */
  tenseFocus: z.string().max(500).optional(),
  /** e.g. "a fairy tale" or "a fable". Optional; narrows subgenre on top of fiction/nonfiction. */
  genreFocus: z.string().max(500).optional(),
  /**
   * Level3 **draft** (stage 1) only. Teacher's note: what is wrong / what direction to take.
   * May be Chinese or English. Optional for first ①, recommended when regenerating 初稿.
   */
  draftExtraInstructions: z.string().max(4000).optional(),
  /**
   * Level3 draft regenerate only. Current 初稿 JSON; model revises into a new full book JSON.
   * Omit on first ① 生成初稿.
   */
  previousDraftText: z.string().max(500_000).optional(),
});

export type GenerateBody = z.infer<typeof generateBodySchema>;
