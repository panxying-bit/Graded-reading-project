/**
 * Optional verbal tense emphasis. `value` is what the model sees (English).
 * Empty value = do not send / no extra instruction.
 */
export const TENSE_FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不指定" },
  { value: "present simple", label: "一般现在时为主" },
  { value: "present continuous", label: "现在进行时为主" },
  { value: "past simple", label: "一般过去时为主" },
  { value: "past continuous", label: "过去进行时为主" },
  { value: "future (will or be going to, as natural)", label: "一般将来时为主" },
  {
    value: "present perfect (simple) where natural for the topic",
    label: "现在完成时（简单）为主",
  },
  { value: "a clear contrast: past and present (simple)", label: "现在时/过去时对比" },
  {
    value: "modal focus: can, could, and should in many sentences",
    label: "情态动词突出 (can / could / should)",
  },
];

export const DEFAULT_TENSE_FOCUS = "";
