import * as XLSX from "xlsx";
import {
  getLesson,
  getLessonWordCount,
  resolveLessonTextForExport,
} from "./lessonLibrary";
import {
  displayFiction,
  displayGenre,
  displayStructure,
  displayTense,
} from "./exportDisplayLabels";
import { triggerDownloadBlob } from "./lessonDownloadZip";

export function makeExcelFilename(levelId: string) {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${levelId}-lessons-summary-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}

type Row = (string | number)[];

/**
 * One sheet: metadata per lesson. Full passage text is not included (use ZIP for that).
 */
export function buildLessonsSummaryWorkbook(
  levelId: string,
  levelName: string,
  levelOrder: number,
  lessonNumbers: number[],
  themeForLesson: (n: number) => string | undefined,
  planLessonTitleForLesson?: (n: number) => string | undefined,
): Blob {
  const headers: Row = [
    "行号",
    "级别序号",
    "级别ID",
    "级别名称",
    "课序号",
    "虚构/非虚构",
    "主题(保存时)",
    "课文标题(保存时)",
    "课纲主题",
    "课纲课文标题",
    "结构类型",
    "时态重点",
    "体裁/具体形式",
    "总词数",
    "保存时间(本地)",
  ];

  const rows: Row[] = [headers];
  let i = 0;
  for (const n of [...lessonNumbers].sort((a, b) => a - b)) {
    const rec = getLesson(levelId, n);
    if (!rec || !resolveLessonTextForExport(levelId, rec)) {
      continue;
    }
    i += 1;
    const planTheme = themeForLesson(n)?.trim() ?? "";
    const planLt = planLessonTitleForLesson?.(n)?.trim() ?? "";
    const updated = rec.updatedAt
      ? (() => {
          try {
            return new Date(rec.updatedAt).toLocaleString();
          } catch {
            return rec.updatedAt;
          }
        })()
      : "";
    rows.push([
      i,
      levelOrder,
      levelId,
      levelName,
      n,
      displayFiction(rec.fictionOrNonfiction),
      rec.topic?.trim() ?? "",
      rec.lessonTitle?.trim() ?? "",
      planTheme,
      planLt,
      displayStructure(rec.structureType),
      displayTense(rec.tenseFocus),
      displayGenre(rec.genreFocus),
      getLessonWordCount(levelId, n) ?? rec.wordCount,
      updated,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 10 },
    { wch: 20 },
    { wch: 6 },
    { wch: 16 },
    { wch: 32 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 8 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "课文汇总");

  const ab = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  });
  return new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadLessonsExcel(
  levelId: string,
  levelName: string,
  levelOrder: number,
  lessonNumbers: number[],
  themeForLesson: (n: number) => string | undefined,
  planLessonTitleForLesson?: (n: number) => string | undefined,
): void {
  const blob = buildLessonsSummaryWorkbook(
    levelId,
    levelName,
    levelOrder,
    lessonNumbers,
    themeForLesson,
    planLessonTitleForLesson,
  );
  triggerDownloadBlob(blob, makeExcelFilename(levelId));
}
