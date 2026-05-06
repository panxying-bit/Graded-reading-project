import { z } from "zod";

export const imageGenerateBodySchema = z.object({
  prompt: z.string().min(1, "prompt required").max(20_000),
  /** HTTPS URLs or data:image/*;base64,... (Volc maps data: to binary_data_base64 server-side). */
  referenceImageUrls: z
    .array(z.string().min(4).max(35 * 1024 * 1024))
    .max(10)
    .optional(),
  /** Picture-book output aspect; default landscape 4:3. */
  layoutPreset: z
    .enum(["landscape_43", "portrait_34", "widescreen_169"])
    .optional(),
  /** standard = default pixel buckets; high = larger (rarely used). */
  qualityTier: z.enum(["standard", "high"]).optional(),
});

export type ImageGenerateBody = z.infer<typeof imageGenerateBodySchema>;
