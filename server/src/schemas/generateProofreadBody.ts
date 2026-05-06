import { z } from "zod";

/** Level 1 / 2 / 3 / 4 stage 3 — spelling/grammar pass only; same JSON shape. */
export const generateProofreadBodySchema = z.object({
  level: z.enum(["level1", "level2", "level3", "level4"]),
  /** Refined book JSON (stage 2), possibly teacher-edited. */
  bookText: z.string().min(1).max(500_000),
  lesson: z.number().int().min(1).max(500).optional(),
  topic: z.string().optional(),
  lessonTitle: z.string().max(2000).optional(),
  contentBrief: z.string().max(4000).optional(),
});

export type GenerateProofreadBody = z.infer<typeof generateProofreadBodySchema>;
