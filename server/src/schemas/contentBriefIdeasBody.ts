import { z } from "zod";

export const contentBriefIdeasBodySchema = z.object({
  level: z.enum(["level1", "level2", "level3", "level4"]),
  topic: z.string().max(2000).optional(),
  lessonTitle: z.string().max(2000).optional(),
  lesson: z.number().int().min(1).max(2000).optional(),
  fictionOrNonfiction: z.enum(["fiction", "nonfiction"]).optional(),
  structureType: z.string().max(400).optional(),
  genreFocus: z.string().max(400).optional(),
  tenseFocus: z.string().max(400).optional(),
});

export type ContentBriefIdeasBody = z.infer<typeof contentBriefIdeasBodySchema>;

export const contentBriefIdeasResponseSchema = z.object({
  ideas: z.array(z.string().min(1).max(1200)).min(5).max(7),
});

export type ContentBriefIdeasResult = z.infer<
  typeof contentBriefIdeasResponseSchema
>;
