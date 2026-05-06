import { countWordsInModelOutput, tryParseBookOutput } from "../bookOutput.js";
import {
  getBookPipelinePageRange,
  getBookPipelineWordBounds,
  type BookPipelineLevelId,
} from "../bookPhase.js";
import type { ChatMessage } from "./promptResolver.js";
import { callChatCompletions } from "./llmClient.js";

const MAX_REPAIR_ROUNDS = 2;
const REPAIR_TEMP = 0.3;

/**
 * Re-call the model if book JSON word total is outside [min, max] (L1/L3/L4).
 */
export async function runBookJsonWordRepair(
  baseMessages: ChatMessage[],
  lesson: number | undefined,
  pipelineLevelId: BookPipelineLevelId,
  cefrLabel: string,
): Promise<{
  text: string;
  repairRounds: number;
  level3WordCount: {
    actual: number;
    min: number;
    max: number;
    target: number;
    inRange: boolean;
  };
}> {
  const bounds = getBookPipelineWordBounds(pipelineLevelId, lesson);
  const { pageMin, pageMax } = getBookPipelinePageRange(
    pipelineLevelId,
    lesson,
  );
  const pagePhrase =
    pageMin === pageMax
      ? `exactly ${pageMin} pages`
      : `${pageMin}–${pageMax} pages`;
  let text = await callChatCompletions(baseMessages);
  let repairRounds = 0;

  for (let i = 0; i < MAX_REPAIR_ROUNDS; i++) {
    if (!tryParseBookOutput(text)) {
      break;
    }
    const count = countWordsInModelOutput(text);
    if (count >= bounds.min && count <= bounds.max) {
      break;
    }
    const tooLong = count > bounds.max;
    const fixUserContent = tooLong
      ? `The JSON is valid, but the total English word count in all "text" fields (split on spaces) is ${count}. It MUST be between ${bounds.min} and ${bounds.max} inclusive (target about ${bounds.target}). The text is too LONG. Keep the same "pages" array length (${pagePhrase}) and the same page order and page numbers, same "title" if any, the same meaning and CEFR ${cefrLabel} style, but shorten. The final count must be at most ${bounds.max}. Reply with exactly ONE JSON object, no markdown code fences, no text before or after.`
      : `The JSON is valid, but the total English word count in all "text" fields is ${count}. It must be between ${bounds.min} and ${bounds.max} (target about ${bounds.target}). The text is too SHORT. Add a few more simple CEFR ${cefrLabel} words across the pages, keeping the same structure (${pagePhrase}). Reply with exactly ONE JSON object, no markdown code fences, no text before or after.`;

    const followUp: ChatMessage[] = [
      ...baseMessages,
      { role: "assistant" as const, content: text },
      { role: "user" as const, content: fixUserContent },
    ];
    text = await callChatCompletions(followUp, { temperature: REPAIR_TEMP });
    repairRounds++;
  }

  const actual = countWordsInModelOutput(text);
  return {
    text,
    repairRounds,
    level3WordCount: {
      actual,
      min: bounds.min,
      max: bounds.max,
      target: bounds.target,
      inRange: actual >= bounds.min && actual <= bounds.max,
    },
  };
}

/** @deprecated Use runBookJsonWordRepair — kept name for existing imports. */
export async function runLevel3WithWordRepair(
  baseMessages: ChatMessage[],
  lesson: number | undefined,
  pipelineLevelId: BookPipelineLevelId,
  cefrLabel: string,
): Promise<ReturnType<typeof runBookJsonWordRepair>> {
  return runBookJsonWordRepair(baseMessages, lesson, pipelineLevelId, cefrLabel);
}
