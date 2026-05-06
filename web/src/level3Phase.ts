/**
 * Level3 curriculum: re-export shared paged-book band helpers (70/80/90 words).
 */

import {
  getPagedBookBand,
  getPagedBookWordCountBounds,
  getPagedBookWordCountBoundsForTarget,
  type PagedBookBand,
} from "./bookPhase";

export type Level3PhaseInfo = PagedBookBand;

export function getLevel3Phase(lesson: number | undefined): Level3PhaseInfo {
  return getPagedBookBand("level3", lesson);
}

export function getLevel3WordCountBoundsForTarget(targetWords: number): {
  target: number;
  min: number;
  max: number;
} {
  return getPagedBookWordCountBoundsForTarget(targetWords);
}

export function getLevel3WordCountBounds(lesson: number | undefined): {
  target: number;
  min: number;
  max: number;
} {
  return getPagedBookWordCountBounds("level3", lesson);
}
