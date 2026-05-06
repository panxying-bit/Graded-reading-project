/**
 * UI labels for illustration output layout + quality (per-lesson).
 * Pixel sizes must match server `illustrationOutputDims.ts`.
 */

export type IllustrationLayoutId =
  | "landscape_43"
  | "portrait_34"
  | "widescreen_169";

export type IllustrationQualityTier = "standard" | "high";

export const DEFAULT_ILLUSTRATION_LAYOUT_ID: IllustrationLayoutId =
  "landscape_43";

export const DEFAULT_ILLUSTRATION_QUALITY_TIER: IllustrationQualityTier =
  "standard";

export type IllustrationLayoutOption = {
  id: IllustrationLayoutId;
  /** Short button title (includes A/B/C). */
  title: string;
  ratioLabel: string;
  /** Standard clarity pixel string for teachers. */
  standardPixels: string;
};

/** High-tier pixel labels (must match server `illustrationOutputDims.ts`). */
export const ILLUSTRATION_HIGH_PIXEL_LABEL: Record<
  IllustrationLayoutId,
  string
> = {
  landscape_43: "2048 × 1536",
  portrait_34: "1536 × 2048",
  widescreen_169: "1920 × 1080",
};

export const ILLUSTRATION_LAYOUT_OPTIONS: IllustrationLayoutOption[] = [
  {
    id: "landscape_43",
    title: "A · 横版绘本",
    ratioLabel: "4:3",
    standardPixels: "1024 × 768",
  },
  {
    id: "portrait_34",
    title: "B · 竖版绘本",
    ratioLabel: "3:4",
    standardPixels: "768 × 1024",
  },
  {
    id: "widescreen_169",
    title: "C · 高清宽屏",
    ratioLabel: "16:9",
    standardPixels: "1280 × 720",
  },
];
