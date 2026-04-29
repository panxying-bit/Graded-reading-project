import { z } from "zod";

/** Stage 2 — refine draft JSON to exact Level3 page/word bands. */
export const generateRefineBodySchema = z.object({
  level: z.literal("level3"),
  /** Selects band (1–48 / 49–96 / 97–144) and word targets. */
  lesson: z.number().int().min(1).max(500),
  /** Draft JSON (possibly edited by teacher). Must be non-empty. */
  draftText: z.string().min(1).max(500_000),
  topic: z.string().optional(),
  lessonTitle: z.string().max(2000).optional(),
  fictionOrNonfiction: z.enum(["fiction", "nonfiction"]).optional(),
});

export type GenerateRefineBody = z.infer<typeof generateRefineBodySchema>;
