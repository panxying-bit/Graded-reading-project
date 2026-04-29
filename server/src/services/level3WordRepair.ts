import { countWordsInModelOutput, tryParseBookOutput } from "../bookOutput.js";
import { getLevel3WordCountBounds } from "../level3Phase.js";
import type { ChatMessage } from "./promptResolver.js";
import { callChatCompletions } from "./llmClient.js";

const MAX_REPAIR_ROUNDS = 2;
const REPAIR_TEMP = 0.3;

/**
 * Re-call the model with a correction user message if level3 book JSON
 * is outside the configured [min, max] word count (LLMs often ignore a single pass).
 */
export async function runLevel3WithWordRepair(
  baseMessages: ChatMessage[],
  lesson: number | undefined,
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
  const bounds = getLevel3WordCountBounds(lesson);
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
      ? `The JSON is valid, but the total English word count in all "text" fields (split on spaces) is ${count}. It MUST be between ${bounds.min} and ${bounds.max} inclusive (target about ${bounds.target}). The text is too LONG. Keep the same "pages" array length (6–8 pages) and the same page order and page numbers, same "title" if any, the same story meaning and CEFR A1+ style, but shorten: remove low-value adjectives, use shorter subjects, or merge with simpler clauses. The final count must be at most ${bounds.max}. Count words in your head before you answer. Reply with exactly ONE JSON object, no markdown code fences, no text before or after.`
      : `The JSON is valid, but the total English word count in all "text" fields is ${count}. It must be between ${bounds.min} and ${bounds.max} (target about ${bounds.target}). The text is too SHORT. Add a few more simple CEFR A1+ words across the pages, keeping the same structure. Reply with exactly ONE JSON object, no markdown code fences, no text before or after.`;

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
