import type { BookOutput, BookPage } from "./parseBookOutput";
import { DEFAULT_STYLE_BIBLE_PROMPT } from "./data/styleBiblePresets";
import {
  cameraPromptLine,
  emotionPromptLine,
  ILLUSTRATION_CAMERA_OPTIONS,
  ILLUSTRATION_EMOTION_PRESETS,
  type IllustrationCameraAngleId,
  type IllustrationEmotionPresetId,
} from "./data/illustrationStoryboardPresets";

/** Default style guide when the user leaves style bible empty (Step 1; Cute Cartoon preset). */
export const DEFAULT_ILLUSTRATION_STYLE_BIBLE = DEFAULT_STYLE_BIBLE_PROMPT;

export type PageIllustrationSource = {
  pageNumber: number;
  text: string;
  sceneNote?: string;
};

/** One protagonist slot: text brief and/or uploaded ref image (data URL). */
export type IllustrationProtagonistSlot = {
  /** Name, gender, age, hair, glasses, clothes, or "like … character" (any language). */
  description?: string;
  /** data:image/*;base64,... from browser upload */
  referenceImageDataUrl?: string;
};

/** Up to two protagonists for consistent cast across pages. */
export type IllustrationProtagonistsState = {
  slot1?: IllustrationProtagonistSlot;
  slot2?: IllustrationProtagonistSlot;
};

/** Drop accidental megabyte data URLs (stale lesson JSON / chain base64). */
export const ILLUSTRATION_MAX_REFERENCE_DATA_URL_CHARS = 1_800_000;

/** Per-page storyboard for illustration (stored on lesson, keyed by page number string). */
export type IllustrationPageDirection = {
  /** This spread's story beat + setting (director note; overrides book scene_note when set). */
  plotAndScene?: string;
  cameraAngle?: IllustrationCameraAngleId;
  emotionPresets?: IllustrationEmotionPresetId[];
  emotionCustom?: string;
};

export type IllustrationPageDirectionsMap = Record<
  string,
  IllustrationPageDirection
>;

export type { IllustrationCameraAngleId, IllustrationEmotionPresetId };

export function getDefaultIllustrationPageDirection(): IllustrationPageDirection {
  return {
    cameraAngle: "wide_shot",
    emotionPresets: [],
    plotAndScene: "",
    emotionCustom: "",
  };
}

/** Coerce bad ids from old localStorage (or hand-edited JSON) so camera/emotion lines stay valid. */
export function sanitizeIllustrationPageDirection(
  d: IllustrationPageDirection | null | undefined,
): IllustrationPageDirection {
  const base = getDefaultIllustrationPageDirection();
  if (!d) {
    return base;
  }
  const cam = d.cameraAngle;
  const cameraAngle: IllustrationCameraAngleId =
    cam && ILLUSTRATION_CAMERA_OPTIONS.some((c) => c.id === cam)
      ? cam
      : base.cameraAngle;
  const emotionPresets = (d.emotionPresets ?? []).filter((id) =>
    ILLUSTRATION_EMOTION_PRESETS.some((e) => e.id === id),
  );
  return {
    ...base,
    ...d,
    cameraAngle,
    emotionPresets,
  };
}

/**
 * Normalize saved protagonist slots before prompt + /api/images/generate refs.
 * - Image without any description: dropped (common stale localStorage after UI clear).
 * - Oversized data URL: dropped from slot, description kept.
 */
export function normalizeProtagonistSlotsForImageRequest(
  protagonists: IllustrationProtagonistsState | null | undefined,
): IllustrationProtagonistsState | null {
  if (!protagonists) {
    return null;
  }
  const out: IllustrationProtagonistsState = {};
  for (const key of ["slot1", "slot2"] as const) {
    const slot = protagonists[key];
    if (!slot) {
      continue;
    }
    const desc = slot.description?.trim() ?? "";
    const img = slot.referenceImageDataUrl?.trim() ?? "";
    if (!desc && !img) {
      continue;
    }
    if (!desc && img) {
      console.warn(
        `[illustration] ${key}: omitted protagonist ref (image present but description empty — re-save 准备区 or add a short look line to send ref).`,
      );
      continue;
    }
    if (
      img &&
      img.length > ILLUSTRATION_MAX_REFERENCE_DATA_URL_CHARS
    ) {
      console.warn(
        `[illustration] ${key}: omitted oversized ref (${img.length} chars > cap); kept text only.`,
      );
      out[key] = { description: slot.description };
      continue;
    }
    out[key] = { ...slot };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function appendProtagonistPromptParts(
  parts: string[],
  protagonists?: IllustrationProtagonistsState | null,
): void {
  if (!protagonists) {
    return;
  }
  const slots: Array<{
    key: keyof IllustrationProtagonistsState;
    label: string;
  }> = [
    { key: "slot1", label: "主人公一 (Protagonist 1)" },
    { key: "slot2", label: "主人公二 (Protagonist 2)" },
  ];
  for (const { key, label } of slots) {
    const slot = protagonists[key];
    if (!slot) {
      continue;
    }
    const desc = slot.description?.trim();
    const hasImg = Boolean(slot.referenceImageDataUrl?.trim());
    if (!desc && !hasImg) {
      continue;
    }
    const lines: string[] = [];
    if (desc) {
      lines.push(desc);
    }
    if (hasImg) {
      lines.push(
        "A reference image is attached for this protagonist: match face shape, hairstyle, glasses if any, body proportions, and clothing silhouette while following the illustration style guide (do not copy logos or text from the photo).",
      );
    }
    parts.push(`[${label}]\n${lines.join("\n\n")}`);
  }
}

/**
 * Merge protagonist ref images (first) with optional chained previous-page image.
 * Provider limit: 10 URLs; extras are dropped from the end.
 */
export function collectIllustrationReferenceUrls(options: {
  protagonists?: IllustrationProtagonistsState | null;
  chainUrls?: string[] | undefined;
}): string[] | undefined {
  const urls: string[] = [];
  const pro = normalizeProtagonistSlotsForImageRequest(
    options.protagonists ?? null,
  );
  const pushCapped = (raw: string, label: string) => {
    const t = raw.trim();
    if (!t) {
      return;
    }
    if (t.length > ILLUSTRATION_MAX_REFERENCE_DATA_URL_CHARS) {
      console.warn(
        `[illustration] skipped ${label}: URL/data length ${t.length} > ${ILLUSTRATION_MAX_REFERENCE_DATA_URL_CHARS} (turn off 链上一页 or re-export smaller refs).`,
      );
      return;
    }
    urls.push(t);
  };
  const p1 = pro?.slot1?.referenceImageDataUrl?.trim();
  const p2 = pro?.slot2?.referenceImageDataUrl?.trim();
  if (p1) {
    pushCapped(p1, "protagonist slot1 ref");
  }
  if (p2) {
    pushCapped(p2, "protagonist slot2 ref");
  }
  if (options.chainUrls?.length) {
    let ci = 0;
    for (const u of options.chainUrls) {
      ci += 1;
      pushCapped(u, `chain ref #${ci}`);
    }
  }
  if (urls.length === 0) {
    return undefined;
  }
  if (urls.length > 10) {
    return urls.slice(0, 10);
  }
  return urls;
}

/**
 * Step 0: final on-screen JSON only — caller ensures `book` came from saved / locked 定稿.
 */
export function listBookPagesForIllustration(book: BookOutput): PageIllustrationSource[] {
  return [...book.pages]
    .sort((a, b) => a.page - b.page)
    .map((p: BookPage) => ({
      pageNumber: p.page,
      text: typeof p.text === "string" ? p.text : "",
      sceneNote:
        typeof p.scene_note === "string" && p.scene_note.trim()
          ? p.scene_note.trim()
          : undefined,
    }));
}

/**
 * Verbose prompt (long-form sections). The generate flow uses compressed tag prompts
 * (`illustrationPromptCompress.ts`, ~500 chars) instead.
 */
export function buildPageIllustrationPrompt(options: {
  styleBible: string;
  bookTitle?: string;
  lessonTheme?: string;
  /** Optional recurring cast / look references for all pages. */
  protagonists?: IllustrationProtagonistsState | null;
  /** Whole-book plot / progression / recurring settings for consistent illustration. */
  globalStoryScene?: string | null;
  /** Per-page director notes: plot+scene, camera, emotion. */
  pageDirection?: IllustrationPageDirection | null;
  page: PageIllustrationSource;
}): string {
  const pageDir = sanitizeIllustrationPageDirection(
    options.pageDirection ?? null,
  );
  const bible =
    options.styleBible.trim() || DEFAULT_ILLUSTRATION_STYLE_BIBLE;
  const parts: string[] = [];
  parts.push(`[Illustration style guide]\n${bible}`);
  appendProtagonistPromptParts(
    parts,
    normalizeProtagonistSlotsForImageRequest(options.protagonists ?? null),
  );
  const gs = options.globalStoryScene?.trim();
  if (gs) {
    parts.push(
      `[Full story — plot, progression, and key scenes for illustration]\n${gs}`,
    );
  }
  if (options.bookTitle?.trim()) {
    parts.push(`[Book title]\n${options.bookTitle.trim()}`);
  }
  if (options.lessonTheme?.trim()) {
    parts.push(`[Lesson theme]\n${options.lessonTheme.trim()}`);
  }
  parts.push(`[Spread / page number]\n${options.page.pageNumber}`);
  const directed = pageDir.plotAndScene?.trim();
  const fromBook = options.page.sceneNote?.trim();
  const scenePrimary = directed || fromBook;
  if (scenePrimary) {
    parts.push(
      `[This spread — story, action, and setting]\n${scenePrimary}`,
    );
  }
  if (directed && fromBook && directed !== fromBook) {
    parts.push(
      `[Additional scene_note from book JSON]\n${fromBook}`,
    );
  }
  const camLine = cameraPromptLine(pageDir.cameraAngle);
  if (camLine) {
    parts.push(`[Camera / lens]\n${camLine}`);
  }
  const emLine = emotionPromptLine(
    pageDir.emotionPresets,
    pageDir.emotionCustom,
  );
  if (emLine) {
    parts.push(`[Character emotion]\n${emLine}`);
  }
  parts.push(
    `[On-page phrase / subject anchor]\n${options.page.text.trim() || "(empty)"}`,
  );
  parts.push(
    "Create a single children's picture-book illustration that follows the style guide. " +
      "Prioritize the scene direction when present; use the on-page phrase to anchor subject matter. " +
      "Do not render any readable text, letters, typography, or logos in the artwork.",
  );
  return parts.join("\n\n");
}
