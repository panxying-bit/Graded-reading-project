import fs from "node:fs";
import path from "node:path";
import type { LevelConfig, ReferencePhaseBand } from "../types/levels.js";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

function overridesPath() {
  return resolveServerConfigFile(import.meta.url, "prompt-overrides.json");
}

type OverrideEntry = Partial<{
  system: string;
  userTemplate: string;
  referenceSample: string;
  referencePhases: {
    early?: Partial<ReferencePhaseBand>;
    mid?: Partial<ReferencePhaseBand>;
    late?: Partial<ReferencePhaseBand>;
  };
}>;

type OverridesFile = Record<string, OverrideEntry>;

let mem: OverridesFile | null = null;

function readFileRaw(): OverridesFile {
  if (!fs.existsSync(overridesPath())) {
    return {};
  }
  try {
    const raw = fs.readFileSync(overridesPath(), "utf8");
    const p = JSON.parse(raw) as OverridesFile;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function readFromDisk(): OverridesFile {
  if (!mem) {
    mem = readFileRaw();
  }
  return mem;
}

export function refreshOverridesFromDisk() {
  mem = readFileRaw();
}

function mergeBand(
  o: Partial<ReferencePhaseBand> | undefined,
  b: ReferencePhaseBand | undefined,
): ReferencePhaseBand {
  return {
    fiction: o?.fiction ?? b?.fiction ?? "",
    nonfiction: o?.nonfiction ?? b?.nonfiction ?? "",
  };
}

/**
 * Merges YAML `base` with optional JSON overrides. Keys in the override file replace base only when present.
 */
export function mergeWithOverrides(
  levelId: string,
  base: LevelConfig,
): LevelConfig {
  const o = readFromDisk()[levelId];
  if (!o) {
    return {
      ...base,
      referencePhases: base.referencePhases
        ? {
            early: { ...base.referencePhases.early },
            mid: { ...base.referencePhases.mid },
            late: { ...base.referencePhases.late },
          }
        : undefined,
    };
  }
  const out: LevelConfig = {
    ...base,
    system: o.system !== undefined ? o.system : base.system,
    userTemplate: o.userTemplate !== undefined ? o.userTemplate : base.userTemplate,
    referenceSample:
      o.referenceSample !== undefined ? o.referenceSample : base.referenceSample,
  };
  if (o.referencePhases && base.referencePhases) {
    out.referencePhases = {
      early: mergeBand(o.referencePhases.early, base.referencePhases.early),
      mid: mergeBand(o.referencePhases.mid, base.referencePhases.mid),
      late: mergeBand(o.referencePhases.late, base.referencePhases.late),
    };
  } else if (base.referencePhases) {
    out.referencePhases = {
      early: { ...base.referencePhases.early },
      mid: { ...base.referencePhases.mid },
      late: { ...base.referencePhases.late },
    };
  }
  return out;
}

export function getOverrideEntryForLevel(levelId: string): OverrideEntry {
  return { ...(readFromDisk()[levelId] ?? {}) };
}

function writeFileAtomic(data: OverridesFile) {
  const text = JSON.stringify(data, null, 2) + "\n";
  const dest = overridesPath();
  const dir = path.dirname(dest);
  const tmp = path.join(dir, `.prompt-overrides.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, dest);
  mem = data;
}

function normalize(
  a: string | undefined,
  b: string | undefined,
): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function sameBand(
  a: ReferencePhaseBand,
  b: ReferencePhaseBand,
): boolean {
  return normalize(a.fiction, b.fiction) && normalize(a.nonfiction, b.nonfiction);
}

/**
 * Update overrides: for each key in `patch`, if it matches `base` remove from file; else store.
 */
export function saveOverrideForLevel(
  levelId: string,
  base: LevelConfig,
  patch: {
    system?: string;
    userTemplate?: string;
    referencePhases?: {
      early: ReferencePhaseBand;
      mid: ReferencePhaseBand;
      late: ReferencePhaseBand;
    };
  },
) {
  const all = { ...readFromDisk() };
  const cur: OverrideEntry = { ...all[levelId] };

  if (patch.system !== undefined) {
    if (normalize(patch.system, base.system)) {
      delete cur.system;
    } else {
      cur.system = patch.system;
    }
  }
  if (patch.userTemplate !== undefined) {
    if (normalize(patch.userTemplate, base.userTemplate)) {
      delete cur.userTemplate;
    } else {
      cur.userTemplate = patch.userTemplate;
    }
  }
  if (patch.referencePhases !== undefined && base.referencePhases) {
    const b = base.referencePhases;
    const p = patch.referencePhases;
    const sameAsBase =
      sameBand(p.early, b.early) && sameBand(p.mid, b.mid) && sameBand(p.late, b.late);
    if (sameAsBase) {
      delete cur.referencePhases;
    } else {
      cur.referencePhases = { ...patch.referencePhases };
    }
  }

  const keysLeft = Object.keys(cur).length;
  if (keysLeft === 0) {
    delete all[levelId];
  } else {
    all[levelId] = cur;
  }
  writeFileAtomic(all);
}

export function clearOverrideForLevel(levelId: string) {
  const all = { ...readFromDisk() };
  delete all[levelId];
  writeFileAtomic(all);
}
