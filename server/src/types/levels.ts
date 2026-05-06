/** One curriculum band: paired fiction / nonfiction reference samples (Level3). */
export type ReferencePhaseBand = {
  fiction: string;
  nonfiction: string;
};

/** Level 1: one reference sample per band (no fiction vs nonfiction split). */
export type ReferencePhasesUnified = {
  early: string;
  mid: string;
  late: string;
};

export type LevelConfig = {
  cefr: string;
  name: string;
  system: string;
  userTemplate: string;
  defaultWordCount: number;
  /** Override `defaults.lessonsPerLevel` for this level when set. */
  lessonsPerLevel?: number;
  /**
   * Gold example text (e.g. full level3 JSON) appended to system prompt so the
   * model can match form and style. Supports same placeholders as `system` where useful.
   */
  referenceSample?: string;
  /**
   * Level3: per band, separate fiction and nonfiction reference passages; picked by
   * `getLevel3Phase(lesson)` + user fiction/nonfiction choice.
   */
  referencePhases?: {
    early: ReferencePhaseBand;
    mid: ReferencePhaseBand;
    late: ReferencePhaseBand;
  };
  /** Level 1: unified reference text per band (early/mid/late). */
  referencePhasesUnified?: ReferencePhasesUnified;
};

export type LevelsData = {
  /** Shared defaults for all levels (e.g. curriculum size). */
  defaults?: { lessonsPerLevel?: number };
  levels: Record<string, LevelConfig>;
};
