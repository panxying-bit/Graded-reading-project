/**
 * Output width/height for picture-book illustration APIs (Volc + getimg).
 * Keep in sync with web `data/illustrationOutputPresets.ts` labels.
 */

export const ILLUSTRATION_LAYOUT_IDS = [
  "landscape_43",
  "portrait_34",
  "widescreen_169",
] as const;

export type IllustrationLayoutId = (typeof ILLUSTRATION_LAYOUT_IDS)[number];

export const ILLUSTRATION_QUALITY_TIERS = ["standard", "high"] as const;

export type IllustrationQualityTier =
  (typeof ILLUSTRATION_QUALITY_TIERS)[number];

const DIMS: Record<
  IllustrationLayoutId,
  { standard: { w: number; h: number }; high: { w: number; h: number } }
> = {
  landscape_43: {
    standard: { w: 1024, h: 768 },
    high: { w: 2048, h: 1536 },
  },
  portrait_34: {
    standard: { w: 768, h: 1024 },
    high: { w: 1536, h: 2048 },
  },
  widescreen_169: {
    standard: { w: 1280, h: 720 },
    high: { w: 1920, h: 1080 },
  },
};

export function resolveIllustrationDimensions(
  layout: IllustrationLayoutId | undefined,
  quality: IllustrationQualityTier | undefined,
): { width: number; height: number } {
  const lid = layout ?? "landscape_43";
  const q = quality ?? "standard";
  const row = DIMS[lid] ?? DIMS.landscape_43;
  const box = q === "high" ? row.high : row.standard;
  return { width: box.w, height: box.h };
}

/** getimg-style aspect_ratio string from layout. */
export function layoutToAspectRatio(
  layout: IllustrationLayoutId | undefined,
): string {
  switch (layout ?? "landscape_43") {
    case "portrait_34":
      return "3:4";
    case "widescreen_169":
      return "16:9";
    default:
      return "4:3";
  }
}

/** Rough resolution label for getimg-style APIs. */
export function qualityToImageResolution(
  quality: IllustrationQualityTier | undefined,
): string {
  return quality === "high" ? "2K" : "1K";
}
