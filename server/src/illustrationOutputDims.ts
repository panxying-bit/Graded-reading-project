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

// Vendor accepts 2K presets like 2304×1728 (4:3), 2560×1440 (16:9), etc.
// Do not send any side below 1024 — short edges caused API rejections.
// Standard 4:3 / 3:4: smallest k with min(3k,4k)>=1024 is k=342 → 1368×1026 / 1026×1368.

const DIMS: Record<
  IllustrationLayoutId,
  { standard: { w: number; h: number }; high: { w: number; h: number } }
> = {
  landscape_43: {
    standard: { w: 1368, h: 1026 },
    high: { w: 2304, h: 1728 },
  },
  portrait_34: {
    standard: { w: 1026, h: 1368 },
    high: { w: 1728, h: 2304 },
  },
  widescreen_169: {
    standard: { w: 1920, h: 1080 },
    high: { w: 2560, h: 1440 },
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
