import fs from "node:fs";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

export type LessonPlanRow = {
  lesson: number;
  /** Umbrella / thematic line (e.g. topic + subtopic). */
  theme: string;
  /** Specific lesson title for this slot (from curriculum outline). */
  lessonTitle?: string;
  /** When set, UI can default the fiction vs nonfiction control. */
  suggestedFictionOrNonfiction?: "fiction" | "nonfiction";
};
export type LessonPlanFile = {
  level: string;
  description?: string;
  themeCycle?: string[];
  lessons: LessonPlanRow[];
};

const cache = new Map<string, LessonPlanFile | null>();

function lessonPlanFile(levelId: string) {
  return resolveServerConfigFile(
    import.meta.url,
    "lessons",
    `${levelId}.json`,
  );
}

export function getLessonPlan(levelId: string): LessonPlanFile | null {
  if (cache.has(levelId)) {
    return cache.get(levelId) ?? null;
  }
  let p: string;
  try {
    p = lessonPlanFile(levelId);
  } catch {
    cache.set(levelId, null);
    return null;
  }
  if (!fs.existsSync(p)) {
    cache.set(levelId, null);
    return null;
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw) as LessonPlanFile;
    if (!Array.isArray(data.lessons) || !data.lessons.length) {
      cache.set(levelId, null);
      return null;
    }
    cache.set(levelId, data);
    return data;
  } catch {
    cache.set(levelId, null);
    return null;
  }
}

export function clearLessonPlanCache() {
  cache.clear();
}
