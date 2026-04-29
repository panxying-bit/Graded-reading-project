import { z } from "zod";

/** Level3 stage 3 — spelling/grammar pass only; same JSON shape. */
export const generateProofreadBodySchema = z.object({
  level: z.literal("level3"),
  /** Refined book JSON (stage 2), possibly teacher-edited. */
  bookText: z.string().min(1).max(500_000),
  lesson: z.number().int().min(1).max(500).optional(),
  topic: z.string().optional(),
  lessonTitle: z.string().max(2000).optional(),
});

export type GenerateProofreadBody = z.infer<typeof generateProofreadBodySchema>;
