/** English value sent to API (and into prompts); label is for UI only. */
export const STRUCTURE_TYPES: { value: string; label: string }[] = [
  { value: "unspecified", label: "不指定" },
  { value: "linear", label: "线性叙述 (linear)" },
  { value: "problem_solution", label: "问题—解决 (problem_solution)" },
  { value: "circular", label: "循环 / 环形 (circular)" },
  { value: "compare_contrast", label: "对比 (compare_contrast)" },
  { value: "cause_effect", label: "因果 (cause_effect)" },
  { value: "description", label: "说明 / 描述 (description)" },
];

export const DEFAULT_STRUCTURE = "linear";
