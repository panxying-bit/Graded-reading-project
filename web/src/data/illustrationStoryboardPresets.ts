/**
 * Per-page illustration storyboard: camera + emotion presets (labels for UI + English for prompt).
 */

export const ILLUSTRATION_CAMERA_OPTIONS = [
  { id: "close_up" as const, zh: "近景", en: "Close-up" },
  { id: "wide_shot" as const, zh: "全景", en: "Wide shot" },
  { id: "birds_eye" as const, zh: "俯视", en: "Bird's-eye view" },
] as const;

export type IllustrationCameraAngleId =
  (typeof ILLUSTRATION_CAMERA_OPTIONS)[number]["id"];

export const ILLUSTRATION_EMOTION_PRESETS = [
  { id: "happy" as const, label: "Happy", promptHint: "happy, bright expression" },
  {
    id: "surprise" as const,
    label: "Surprise",
    promptHint: "surprised expression",
  },
  {
    id: "thoughtful" as const,
    label: "Thoughtful",
    promptHint: "thoughtful, calm expression",
  },
  { id: "sleepy" as const, label: "Sleepy", promptHint: "sleepy, drowsy expression" },
  { id: "sad" as const, label: "Sad", promptHint: "sad expression" },
  { id: "scared" as const, label: "Scared", promptHint: "scared, worried expression" },
] as const;

export type IllustrationEmotionPresetId =
  (typeof ILLUSTRATION_EMOTION_PRESETS)[number]["id"];

export function cameraPromptLine(
  angle: IllustrationCameraAngleId | undefined,
): string | undefined {
  const id = angle ?? "wide_shot";
  const o = ILLUSTRATION_CAMERA_OPTIONS.find((c) => c.id === id);
  if (!o) {
    return undefined;
  }
  return `Use a **${o.en}** (${o.zh}) framing for this spread: compose the scene accordingly (subject scale, environment visible, and eye-line).`;
}

export function emotionPromptLine(
  presetIds: IllustrationEmotionPresetId[] | undefined,
  custom?: string,
): string | undefined {
  const hints: string[] = [];
  if (presetIds?.length) {
    for (const pid of presetIds) {
      const p = ILLUSTRATION_EMOTION_PRESETS.find((e) => e.id === pid);
      if (p) {
        hints.push(`${p.label}: ${p.promptHint}`);
      }
    }
  }
  const c = custom?.trim();
  if (c) {
    hints.push(`Additional expression notes: ${c}`);
  }
  if (!hints.length) {
    return undefined;
  }
  return `Character facial expression and body language should convey: ${hints.join(" | ")}.`;
}
