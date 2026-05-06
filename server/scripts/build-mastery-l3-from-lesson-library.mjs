/**
 * Merge Level 3 定表词 (vocabFinalTable) from a browser localStorage export into
 * config/mastery-words-l3.json for Level 4 Mastery de-dupe.
 *
 * How to export:
 * 1. Open the app (Vite dev or built site) → DevTools → Application → Local Storage.
 * 2. Copy the value of key `graded-reading.lessonLibrary.v1` (full JSON string).
 * 3. Save as a file, e.g. server/config/lesson-library-export.json (gitignored if you prefer).
 *
 * Usage:
 *   cd server && node scripts/build-mastery-l3-from-lesson-library.mjs /path/to/export.json
 *
 * The script unions headwords with existing mastery-words-l3.json, dedupes case-insensitively,
 * sorts, and rewrites the config file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.join(_dir, "..", "config");
const outPath = path.join(configDir, "mastery-words-l3.json");

function normWord(w) {
  return String(w ?? "")
    .trim()
    .toLowerCase();
}

function collectL3FinalWords(store) {
  const set = new Set();
  if (!store || typeof store !== "object") {
    return set;
  }
  const byLevel = store.byLevel;
  if (!byLevel || typeof byLevel !== "object") {
    return set;
  }
  const l3 = byLevel.level3;
  if (!l3 || typeof l3 !== "object") {
    return set;
  }
  for (const key of Object.keys(l3)) {
    const rec = l3[key];
    if (!rec || typeof rec !== "object") {
      continue;
    }
    const items = rec.vocabFinalTable?.items;
    if (!Array.isArray(items)) {
      continue;
    }
    for (const row of items) {
      const nw = normWord(row?.word);
      if (nw) {
        set.add(nw);
      }
    }
  }
  return set;
}

function main() {
  const exportPath = process.argv[2];
  if (!exportPath || exportPath === "-h" || exportPath === "--help") {
    console.error(
      "Usage: node scripts/build-mastery-l3-from-lesson-library.mjs <export.json>\n" +
        "  export.json = localStorage value for key graded-reading.lessonLibrary.v1 (saved as file).",
    );
    process.exit(1);
  }
  const abs = path.isAbsolute(exportPath)
    ? exportPath
    : path.join(process.cwd(), exportPath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  let store;
  try {
    store = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  if (store.v !== 1 || !store.byLevel) {
    console.error(
      "Expected shape: { v: 1, byLevel: { level3: { ... } } } (graded-reading.lessonLibrary.v1).",
    );
    process.exit(1);
  }

  const fromLessons = collectL3FinalWords(store);

  let existing = { words: [] };
  if (fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch {
      // ignore
    }
  }
  const prev = Array.isArray(existing.words)
    ? existing.words.map((w) => normWord(w)).filter(Boolean)
    : [];
  const merged = new Set([...prev, ...fromLessons]);
  const words = [...merged].sort((a, b) => a.localeCompare(b));

  const next = {
    version: existing.version ?? 1,
    sourceFile:
      existing.sourceFile ??
      "config/wordlists/Level-3_wordlist.xlsx (when available; sheet l3, Type = Mastery)",
    sheets: existing.sheets ?? ["l3"],
    tag: "Mastery",
    rowCountsMastery: {
      ...(existing.rowCountsMastery && typeof existing.rowCountsMastery === "object"
        ? existing.rowCountsMastery
        : {}),
      l3: words.length,
    },
    uniqueLowercaseCount: words.length,
    words,
    sourceNote:
      "Union of (optional) Level-3 sheet Mastery words and headwords from L3 lesson 定表词 exports. Level 4 dedupes against Union(this, mastery-words-l0-l2.json).",
    lastLessonExportBuild: new Date().toISOString(),
    lastLessonExportWordsAdded: fromLessons.size,
  };

  fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  const prevSet = new Set(prev);
  let newlyAdded = 0;
  for (const w of fromLessons) {
    if (!prevSet.has(w)) {
      newlyAdded++;
    }
  }
  console.log(`Wrote ${outPath}`);
  console.log(
    `  L3 定表词（本导出中去重后）: ${fromLessons.size}；合并前文件已有: ${prev.length}；合并后总计: ${words.length}（本次新增约 ${newlyAdded} 条）。`,
  );
}

main();
