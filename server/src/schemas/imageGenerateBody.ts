import { z } from "zod";

export const imageGenerateBodySchema = z.object({
  prompt: z.string().min(1, "prompt required").max(20_000),
  /** Public URLs; multiple characters / poses allowed (provider-specific limit, we cap at 10). */
  referenceImageUrls: z.array(z.string().min(4).max(4096)).max(10).optional(),
});

export type ImageGenerateBody = z.infer<typeof imageGenerateBodySchema>;
