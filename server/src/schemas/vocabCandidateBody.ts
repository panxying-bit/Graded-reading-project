import { z } from "zod";

export const vocabCandidateBodySchema = z.object({
  level: z.enum(["level1", "level2", "level3", "level4"]),
  text: z.string().min(1).max(500_000),
  /** From client localStorage: headwords from other lessons' 定表 in this level (lowercase). */
  excludeHeadwords: z.array(z.string().min(1).max(200)).max(500).optional(),
});

export type VocabCandidateBody = z.infer<typeof vocabCandidateBodySchema>;

export const vocabCandidateItemSchema = z.object({
  /** Lemma, or 2–4 word chunk (Level 3 theme chunks). */
  word: z.string().min(1).max(160),
  sentence: z.string().min(1),
});

export const vocabCandidateResponseSchema = z.object({
  candidates: z.array(vocabCandidateItemSchema).min(5).max(7),
});

export type VocabCandidateItem = z.infer<typeof vocabCandidateItemSchema>;
