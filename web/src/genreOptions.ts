/**
 * Optional reading form / subgenre. `value` is the English phrase the model uses.
 * Empty = no extra subgenre instruction (fiction/nonfiction alone is enough).
 */
export const GENRE_FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不指定" },
  { value: "a fairy tale", label: "童话" },
  { value: "a fable (animal characters, simple moral)", label: "寓言" },
  {
    value: "a simple legend or 'why' story (pourquoi)",
    label: "传说 / 原因小故事",
  },
  { value: "a dialogue story (turn-taking lines)", label: "对话体故事" },
  { value: "a letter or diary in first person", label: "书信/日记体" },
  { value: "a simple interview or Q&A in prose", label: "采访/问答式" },
  {
    value: "a short how-to or step list (factual, clear order)",
    label: "操作说明/步骤（非虚构时更合适）",
  },
  {
    value: "a brief report or simple news (factual, neutral tone)",
    label: "简讯/报道感（非虚构时更合适）",
  },
];

export const DEFAULT_GENRE_FOCUS = "";
