import { z } from "zod";

/**
 * Request: final passage (plain or level3 book JSON) + level for CEFR from config.
 */
export const sentencePatternBodySchema = z.object({
  level: z.enum(["level1", "level2", "level3"]),
  /** Full stored output: plain text (L1/L2) or book JSON (L3). */
  text: z.string().min(1).max(500_000),
  /** Optional; teacher says what was wrong with the last pick and how to re-choose. */
  patternExtraInstructions: z.string().max(4000).optional(),
});

export type SentencePatternBody = z.infer<typeof sentencePatternBodySchema>;

export const sentencePatternResultSchema = z.object({
  pattern: z.string().min(1),
  exampleSentence: z.string().min(1),
  whyPattern: z.string().min(1),
  variations: z.array(z.string().min(1)).length(3),
  teachingFocus: z.string().min(1),
});

export type SentencePatternResult = z.infer<typeof sentencePatternResultSchema>;
