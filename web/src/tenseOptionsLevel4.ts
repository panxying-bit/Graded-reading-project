/**
 * Level 4 tense / grammar emphasis. `value` is what the model sees (English).
 */
export const TENSE_FOCUS_OPTIONS_LEVEL4: { value: string; label: string }[] = [
  { value: "", label: "不指定" },
  { value: "Present continuous", label: "现在进行时" },
  {
    value: "Present continuous for future",
    label: "现在进行时表计划中的将来",
  },
  { value: "Present perfect", label: "现在完成时" },
  { value: "Past simple", label: "一般过去时" },
  { value: "Past continuous", label: "过去进行时" },
  {
    value: "Future time (will and going to)",
    label: "将来时间（will / going to）",
  },
  { value: "Going to", label: "be going to 表将来" },
  { value: "Time-related structures", label: "时间相关结构" },
  { value: "Wh-questions in past", label: "过去时的 Wh- 问句" },
  { value: "Zero conditional", label: "零条件句" },
  { value: "First conditional", label: "第一条件句" },
];

export const DEFAULT_TENSE_FOCUS_LEVEL4 = "";
