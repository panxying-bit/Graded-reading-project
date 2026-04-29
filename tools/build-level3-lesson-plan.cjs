/**
 * Rebuilds server/config/lessons/level3.json from
 * sheet "level 3 topics 大主题匹配" in level3 大纲-topic and lessons.xlsx
 *
 * 48 outline rows map to curriculum lessons:
 *   rows 0–15   -> lessons 1–16   (band 1)
 *   rows 16–31  -> lessons 49–64  (band 2)
 *   rows 32–47  -> lessons 97–112 (band 3)
 * Remaining 1..144 slots have empty theme and title (user can edit in UI).
 *
 * Run: node tools/build-level3-lesson-plan.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const XLSX = require(path.join(__dirname, "../web/node_modules/xlsx"));

const XLSX_PATH = path.join(
  __dirname,
  "..",
  "..",
  "level3 大纲-topic and lessons.xlsx",
);
const OUT_PATH = path.join(
  __dirname,
  "../server/config/lessons/level3.json",
);

const SHEET = "level 3 topics 大主题匹配";

/** Each segment: [curriculumFirstLesson, count, firstRowIndex in Excel array (0-based) */
const SEGMENTS = [
  { curriculumStart: 1, count: 16, excelStart: 0 },
  { curriculumStart: 49, count: 16, excelStart: 16 },
  { curriculumStart: 97, count: 16, excelStart: 32 },
];

function rowToEntry(r) {
  const theme = String(r["LC Topic"] ?? "").trim() || "—";
  const f = String(r["Fiction Title"] ?? "").trim();
  const nf = String(r["Non-fiction Title"] ?? "").trim();
  let lessonTitle = "";
  let suggestedFictionOrNonfiction = "fiction";
  if (f && nf) {
    lessonTitle = f;
    suggestedFictionOrNonfiction = "fiction";
  } else if (f) {
    lessonTitle = f;
    suggestedFictionOrNonfiction = "fiction";
  } else if (nf) {
    lessonTitle = nf;
    suggestedFictionOrNonfiction = "nonfiction";
  }
  return { theme, lessonTitle, suggestedFictionOrNonfiction };
}

function parseOutlineRows() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`Excel not found: ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const sh = wb.Sheets[SHEET];
  if (!sh) {
    throw new Error(`Sheet "${SHEET}" not found`);
  }
  const rows = XLSX.utils.sheet_to_json(sh, { defval: "" });
  return rows.filter((r) => {
    const t = String(r["LC Topic"] ?? "").trim();
    const f = String(r["Fiction Title"] ?? "").trim();
    const nf = String(r["Non-fiction Title"] ?? "").trim();
    return t || f || nf;
  });
}

function buildLessonMap(outline) {
  /** @type {Map<number, ReturnType<typeof rowToEntry>>} */
  const m = new Map();
  for (const seg of SEGMENTS) {
    for (let i = 0; i < seg.count; i++) {
      const lessonNum = seg.curriculumStart + i;
      const excelIdx = seg.excelStart + i;
      if (excelIdx >= outline.length) {
        throw new Error(
          `Need row ${excelIdx} in outline (have ${outline.length} rows)`,
        );
      }
      m.set(lessonNum, rowToEntry(outline[excelIdx]));
    }
  }
  return m;
}

function main() {
  const outline = parseOutlineRows();
  if (outline.length < 48) {
    throw new Error(
      `Expected at least 48 content rows, got ${outline.length}`,
    );
  }
  const byLesson = buildLessonMap(outline);
  const lessons = [];
  for (let n = 1; n <= 144; n++) {
    if (byLesson.has(n)) {
      const e = byLesson.get(n);
      lessons.push({
        lesson: n,
        theme: e.theme,
        lessonTitle: e.lessonTitle,
        suggestedFictionOrNonfiction: e.suggestedFictionOrNonfiction,
      });
    } else {
      lessons.push({
        lesson: n,
        theme: "",
        lessonTitle: "",
        suggestedFictionOrNonfiction: "fiction",
      });
    }
  }
  const doc = {
    level: "level3",
    description:
      '48 rows from sheet "level 3 topics 大主题匹配": lessons 1–16, 49–64, 97–112. Other slots have empty theme/title until you edit in the UI.',
    themeCycle: [],
    lessons,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(
    "Wrote",
    OUT_PATH,
    "mapped 48 slots; empty defaults for other lesson numbers.",
  );
}

main();
