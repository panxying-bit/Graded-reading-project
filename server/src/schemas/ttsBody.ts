import { z } from "zod";

/** Single utterance for Azure Speech short-TTS (sentence or headword). */
export const ttsBodySchema = z.object({
  text: z.string().min(1).max(600),
});

export type TtsBody = z.infer<typeof ttsBodySchema>;
