import { z } from "zod";

const referencePhaseBandSchema = z.object({
  fiction: z.string(),
  nonfiction: z.string(),
});

export const promptsPutBodySchema = z.object({
  system: z.string(),
  userTemplate: z.string(),
  referencePhases: z
    .object({
      early: referencePhaseBandSchema,
      mid: referencePhaseBandSchema,
      late: referencePhaseBandSchema,
    })
    .optional(),
});

export type PromptsPutBody = z.infer<typeof promptsPutBodySchema>;
