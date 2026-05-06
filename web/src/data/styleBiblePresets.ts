/**
 * Style Bible preset library for picture-book illustration prompts (Step 1).
 * Single source of truth for labels + full prompt text sent to the image model.
 */

export type StyleBiblePresetId =
  | "cute_cartoon"
  | "watercolor_storybook"
  | "flat_illustration"
  | "pencil_sketch"
  | "clay_3d_toy"
  | "realistic_soft";

export type StyleBiblePreset = {
  id: StyleBiblePresetId;
  /** English name for chips / export. */
  titleEn: string;
  /** Short Chinese label in UI. */
  titleZh: string;
  /** Who / what teaching context this fits (Chinese, for teachers). */
  audienceZh: string;
  /** Full style bible stored per lesson; API uses a short digest (see illustrationPromptCompress). */
  prompt: string;
  /**
   * Short English phrase for Jimeng `style:` when this preset is matched (exact library text).
   * User-facing "cute cartoon / clay" style tags — not the long boilerplate above.
   */
  jimengStyleTag: string;
};

export const STYLE_BIBLE_PRESETS: readonly StyleBiblePreset[] = [
  {
    id: "cute_cartoon",
    titleEn: "Cute Cartoon",
    titleZh: "可爱卡通风",
    audienceZh: "低龄、启蒙、绘本主流",
    jimengStyleTag: "cute cartoon",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

cute cartoon style, soft colors, simple shapes, big eyes, child-friendly illustration, clean background, warm and bright, storybook illustration.`,
  },
  {
    id: "watercolor_storybook",
    titleEn: "Watercolor Storybook",
    titleZh: "水彩绘本风",
    audienceZh: "低龄、启蒙、绘本主流",
    jimengStyleTag: "watercolor storybook",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

watercolor illustration, soft brush strokes, light pastel colors, hand-painted style, gentle and warm, children's storybook illustration`,
  },
  {
    id: "flat_illustration",
    titleEn: "Flat Illustration",
    titleZh: "扁平插画风",
    audienceZh: "教学清晰（认词、句型）",
    jimengStyleTag: "flat illustration",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

flat illustration style, simple shapes, solid colors, minimal details, clean lines, educational illustration, white background`,
  },
  {
    id: "pencil_sketch",
    titleEn: "Pencil Sketch",
    titleZh: "铅笔手绘风",
    audienceZh: "可打印、涂色、任务",
    jimengStyleTag: "pencil sketch",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

pencil sketch style, black and white line drawing, simple lines, no color, coloring book style, children's worksheet illustration`,
  },
  {
    id: "clay_3d_toy",
    titleEn: "Clay / 3D Toy",
    titleZh: "黏土/玩具风",
    audienceZh: "提升兴趣",
    jimengStyleTag: "clay toy",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

clay style, 3D toy-like characters, soft lighting, rounded shapes, colorful, playful, children's animation style`,
  },
  {
    id: "realistic_soft",
    titleEn: "Realistic Soft",
    titleZh: "轻写实风",
    audienceZh: "动物 / 科普（认知类）",
    jimengStyleTag: "soft realistic",
    prompt: `Warm, friendly picture-book art for young English learners (roughly ages 4–8).

Soft rounded shapes, bright but calm palette, clear focal character or object, simple background.
No scary, violent, or mature content. No photorealistic horror or weapons.

The image must contain NO readable text, logos, or watermarks.

consistent character design, same style across pages

soft realistic illustration, gentle lighting, clear details, child-friendly realism, natural colors, educational style`,
  },
] as const;

/** Default prompt when the user leaves style bible empty (matches first preset). */
export const DEFAULT_STYLE_BIBLE_PROMPT = STYLE_BIBLE_PRESETS[0].prompt;

function normalizeForMatch(s: string): string {
  return s.replace(/\r\n/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}

/** Returns preset id when `bible` exactly matches a library prompt (after whitespace normalize). */
export function matchStylePresetId(bible: string): StyleBiblePresetId | undefined {
  const n = normalizeForMatch(bible);
  if (!n) {
    return undefined;
  }
  for (const p of STYLE_BIBLE_PRESETS) {
    if (normalizeForMatch(p.prompt) === n) {
      return p.id;
    }
  }
  return undefined;
}

export function getStylePresetById(
  id: StyleBiblePresetId,
): StyleBiblePreset | undefined {
  return STYLE_BIBLE_PRESETS.find((p) => p.id === id);
}
