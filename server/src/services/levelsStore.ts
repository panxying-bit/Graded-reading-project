import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import type { LevelsData } from "../types/levels.js";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";
import { mergeWithOverrides } from "./promptOverrideStore.js";

function levelsYamlPath() {
  return resolveServerConfigFile(import.meta.url, "levels.yaml");
}

let cache: LevelsData | null = null;

export function getLevelsData(): LevelsData {
  if (cache) {
    return cache;
  }
  const configPath = levelsYamlPath();
  const raw = fs.readFileSync(configPath, "utf8");
  const data = parseYaml(raw) as LevelsData;
  if (!data?.levels || typeof data.levels !== "object") {
    throw new Error("Invalid levels.yaml: expected top-level `levels` object");
  }
  cache = data;
  return data;
}

/** Config from `levels.yaml` only (no prompt-overrides.json). */
export function getLevelBaseFromYaml(id: string) {
  const d = getLevelsData();
  return d.levels[id] ?? null;
}

export function getLevel(id: string) {
  const base = getLevelBaseFromYaml(id);
  if (!base) {
    return null;
  }
  return mergeWithOverrides(id, { ...base });
}
