import { z } from "zod";

/** Stage 2 — refine draft JSON to exact book page/word bands (L1/L2/L3/L4). */
export const generateRefineBodySchema = z.object({
  level: z.enum(["level1", "level2", "level3", "level4"]),
  /** Selects band (1–48 / 49–96 / 97–144) and word targets. */
  lesson: z.number().int().min(1).max(500),
  /** Draft JSON (possibly edited by teacher). Must be non-empty. */
  draftText: z.string().min(1).max(500_000),
  topic: z.string().optional(),
  lessonTitle: z.string().max(2000).optional(),
  /** Optional outline for editor context (may be Chinese). */
  contentBrief: z.string().max(4000).optional(),
  fictionOrNonfiction: z.enum(["fiction", "nonfiction"]).optional(),
  /** Level 1: labeling | pattern (same as generate body). */
  structureType: z.string().max(100).optional(),
});

export type GenerateRefineBody = z.infer<typeof generateRefineBodySchema>;
