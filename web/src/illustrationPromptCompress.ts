/**
 * Compressed Jimeng prompt (one page):
 *
 * Sent in POST prompt text (omit empty): style (short tag or preset match only), character,
 * scene (storyboard plot only — not book scene_note), camera (always), emotion, anchor.
 * Capped (~500 chars) + fixed “no text” tail.
 *
 * NOT in prompt: illustrationGlobalStoryScene, full style bible, layout (pixels via API body).
 * Reference images: separate `referenceImageUrls` on the request (protagonists + optional chain).
 */

import {
  DEFAULT_ILLUSTRATION_STYLE_BIBLE,
  normalizeProtagonistSlotsForImageRequest,
  sanitizeIllustrationPageDirection,
  type IllustrationProtagonistsState,
  type IllustrationPageDirection,
  type PageIllustrationSource,
} from "./bookIllustration";
import {
  getStylePresetById,
  matchStylePresetId,
} from "./data/styleBiblePresets";
import {
  ILLUSTRATION_CAMERA_OPTIONS,
  ILLUSTRATION_EMOTION_PRESETS,
  type IllustrationCameraAngleId,
  type IllustrationEmotionPresetId,
} from "./data/illustrationStoryboardPresets";

/** Default max length for the prompt body sent to POST /api/images/generate (excluding optional future suffix growth). */
export const ILLUSTRATION_PROMPT_COMPRESSED_MAX_CHARS = 500;

/** Short compliance tail — keeps total prompt small. */
const FIXED_SUFFIX = " Picture book, no readable text.";

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function ellipsize(s: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  if (s.length <= max) {
    return s;
  }
  if (max < 2) {
    return s.slice(0, max);
  }
  return s.slice(0, max - 1).trimEnd() + "…";
}

function cameraEnglishShort(angle: IllustrationCameraAngleId | undefined): string {
  const id = angle ?? "wide_shot";
  return (
    ILLUSTRATION_CAMERA_OPTIONS.find((c) => c.id === id)?.en ?? "Wide shot"
  );
}

function emotionHintsJoined(
  presetIds: IllustrationEmotionPresetId[] | undefined,
  custom: string | undefined,
  maxLen: number,
): string {
  if (maxLen <= 0) {
    return "";
  }
  const hints: string[] = [];
  if (presetIds?.length) {
    for (const pid of presetIds) {
      const p = ILLUSTRATION_EMOTION_PRESETS.find((e) => e.id === pid);
      if (p) {
        hints.push(p.promptHint);
      }
    }
  }
  const c = custom?.trim();
  if (c) {
    hints.push(c);
  }
  if (!hints.length) {
    return "";
  }
  return ellipsize(hints.join(", "), maxLen);
}

/** Prefer first English sentence or first Chinese sentence; then hard cap. */
function takeFirstSentenceOrPhrase(s: string): string {
  const t = oneLine(s);
  const en = t.match(/^(.+?[.!?])(\s|$)/);
  if (en && en[1].length >= 12 && en[1].length <= 420) {
    return en[1].trim();
  }
  const parts = t.split(/(?<=[。！？])/);
  if (parts[0] && parts[0].trim().length >= 6) {
    return parts[0].trim();
  }
  return t;
}

/** Digest of custom (non-library) style bible — last resort when preset does not match. */
export function compressStyleBibleDigest(styleBible: string, maxLen: number): string {
  const raw = oneLine(styleBible.trim() || DEFAULT_ILLUSTRATION_STYLE_BIBLE);
  const snippet = takeFirstSentenceOrPhrase(raw);
  return ellipsize(snippet, maxLen);
}

/** When lesson bible exactly matches a STYLE_BIBLE_PRESETS prompt, use its short Jimeng tag. */
function jimengTagFromMatchedPreset(styleBible: string): string | undefined {
  const raw = styleBible.trim();
  if (!raw) {
    return undefined;
  }
  const id = matchStylePresetId(raw);
  if (!id) {
    return undefined;
  }
  return getStylePresetById(id)?.jimengStyleTag;
}

function resolveStyleSegment(
  styleBible: string,
  styleShortTag: string | null | undefined,
  maxLen: number,
): string {
  const tag = styleShortTag?.trim();
  if (tag) {
    return ellipsize(oneLine(tag), maxLen);
  }
  const presetTag = jimengTagFromMatchedPreset(styleBible);
  if (presetTag) {
    return ellipsize(presetTag, maxLen);
  }
  return "";
}

function compressProtagonistsDigest(
  protagonists: IllustrationProtagonistsState | null | undefined,
  maxLen: number,
): string {
  if (maxLen <= 0) {
    return "";
  }
  const n = normalizeProtagonistSlotsForImageRequest(protagonists);
  if (!n) {
    return "";
  }
  const bits: string[] = [];
  for (const key of ["slot1", "slot2"] as const) {
    const d = n[key]?.description?.trim();
    if (d) {
      bits.push(d);
    }
  }
  if (!bits.length) {
    return "";
  }
  return ellipsize(bits.join("; "), maxLen);
}

export type CompressedPageIllustrationPromptOptions = {
  styleBible: string;
  /** When set, `style:` uses only this line (capped); ignores bible digest. */
  styleShortTag?: string | null;
  protagonists?: IllustrationProtagonistsState | null;
  pageDirection?: IllustrationPageDirection | null;
  page: PageIllustrationSource;
};

/**
 * Minimal per-page prompt: style digest + optional cast + this-spread scene + camera + emotion + on-page anchor.
 * Does not include global story, book title, or lesson theme (those stay in lesson UI / storage only).
 */
export function buildCompressedPageIllustrationPrompt(
  options: CompressedPageIllustrationPromptOptions,
  maxChars: number = ILLUSTRATION_PROMPT_COMPRESSED_MAX_CHARS,
): string {
  const pageDir = sanitizeIllustrationPageDirection(
    options.pageDirection ?? null,
  );
  /** Only user storyboard "本页剧情与场景" — book JSON `scene_note` is not auto-injected. */
  const directed = pageDir.plotAndScene?.trim();
  const sceneForPrompt = directed ? oneLine(directed) : "";

  const anchorRaw = oneLine(options.page.text.trim());

  let styleMax = 52;
  let charMax = 88;
  let sceneMax = 118;
  let emoMax = 68;
  let anchorMax = 72;

  const bodyBudget = () => Math.max(40, maxChars - FIXED_SUFFIX.length);

  for (let attempt = 0; attempt < 48; attempt++) {
    const style = resolveStyleSegment(
      options.styleBible,
      options.styleShortTag,
      styleMax,
    );
    const character = compressProtagonistsDigest(
      options.protagonists,
      charMax,
    );
    const scene = sceneForPrompt ? ellipsize(sceneForPrompt, sceneMax) : "";
    const camera = cameraEnglishShort(pageDir.cameraAngle);
    const emotion = emotionHintsJoined(
      pageDir.emotionPresets,
      pageDir.emotionCustom,
      emoMax,
    );

    const segments: string[] = [];
    if (style) {
      segments.push(`style: ${style}`);
    }
    if (character) {
      segments.push(`character: ${character}`);
    }
    if (scene) {
      segments.push(`scene: ${scene}`);
    }
    segments.push(`camera: ${camera}`);
    if (emotion) {
      segments.push(`emotion: ${emotion}`);
    }
    if (anchorRaw) {
      segments.push(`anchor: ${ellipsize(anchorRaw, anchorMax)}`);
    }

    const body = segments.join(". ");
    const full = body + FIXED_SUFFIX;
    if (full.length <= maxChars) {
      return full;
    }

    if (styleMax > 28) {
      styleMax -= 14;
    } else if (sceneMax > 28) {
      sceneMax -= 14;
    } else if (charMax > 18) {
      charMax -= 12;
    } else if (anchorMax > 14) {
      anchorMax -= 10;
    } else if (emoMax > 0) {
      emoMax = Math.max(0, emoMax - 12);
    } else if (styleMax > 16) {
      styleMax -= 8;
    } else if (sceneMax > 16) {
      sceneMax -= 8;
    } else {
      break;
    }
  }

  const room = bodyBudget();
  const style = resolveStyleSegment(options.styleBible, options.styleShortTag, 36);
  const camera = cameraEnglishShort(pageDir.cameraAngle);
  const ch = compressProtagonistsDigest(options.protagonists, 40);
  const em = emotionHintsJoined(
    pageDir.emotionPresets,
    pageDir.emotionCustom,
    40,
  );
  const sc = sceneForPrompt ? ellipsize(sceneForPrompt, 80) : "";
  const parts: string[] = [];
  if (style) {
    parts.push(`style: ${style}`);
  }
  if (ch) {
    parts.push(`character: ${ch}`);
  }
  if (sc) {
    parts.push(`scene: ${sc}`);
  }
  parts.push(`camera: ${camera}`);
  if (em) {
    parts.push(`emotion: ${em}`);
  }
  if (anchorRaw) {
    parts.push(`anchor: ${ellipsize(anchorRaw, 48)}`);
  }
  const tiny = parts.join(". ");
  return ellipsize(tiny, room) + FIXED_SUFFIX;
}
