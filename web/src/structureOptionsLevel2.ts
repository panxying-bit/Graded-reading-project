/** Level 2 (CEFR A1, 6–7y): matches server prompt allowed structure types. */

export const STRUCTURE_TYPES_LEVEL2 = [
  { value: "pattern", label: "pattern（句式重复）" },
  { value: "concept", label: "concept（概念展开）" },
  { value: "question_answer", label: "question_answer（问答）" },
  { value: "action_sequence", label: "action_sequence（动作顺序）" },
] as const;

export const DEFAULT_STRUCTURE_LEVEL2 = "pattern";
