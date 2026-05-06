import JSZip from "jszip";
import { buildLessonsHtmlDocument } from "./lessonDownloadHtml";
import { formatSentencePatternBlockPlain } from "./lessonPatternExport";
import { formatVocabFinalTablePlain } from "./lessonVocabExport";
import type { LessonRecord } from "./lessonLibrary";
import {
  getLesson,
  getLessonWordCount,
  resolveLessonTextForExport,
} from "./lessonLibrary";

function pad3(n: number) {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/** Short ASCII-ish token for filenames. */
function safeFileToken(s: string, max: number) {
  const t = s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!t) {
    return "lesson";
  }
  return t.length > max ? t.slice(0, max) : t;
}

export function buildExportFileName(
  levelId: string,
  lessonN: number,
  curriculumTheme?: string,
): string {
  const base = `${levelId}-L${pad3(lessonN)}`;
  if (curriculumTheme?.trim()) {
    return `${base}-${safeFileToken(curriculumTheme, 32)}.txt`;
  }
  return `${base}.txt`;
}

export function buildExportFileBody(
  levelId: string,
  lessonN: number,
  rec: LessonRecord,
  passageText: string,
  passageWordCount: number,
  curriculumTheme?: string,
  curriculumLessonTitle?: string,
) {
  const head = [
    `[Graded reading] level=${levelId} lesson=${lessonN} words=${passageWordCount}`,
  ];
  if (rec.topic) {
    head.push(`topic: ${rec.topic}`);
  }
  if (rec.lessonTitle) {
    head.push(`lessonTitle: ${rec.lessonTitle}`);
  }
  if (rec.contentBrief?.trim()) {
    head.push(`contentBrief: ${rec.contentBrief.trim()}`);
  }
  if (rec.fictionOrNonfiction) {
    head.push(`fictionOrNonfiction: ${rec.fictionOrNonfiction}`);
  }
  if (rec.structureType) {
    head.push(`structureType: ${rec.structureType}`);
  }
  if (rec.tenseFocus) {
    head.push(`tenseFocus: ${rec.tenseFocus}`);
  }
  if (rec.genreFocus) {
    head.push(`genreFocus: ${rec.genreFocus}`);
  }
  if (curriculumTheme?.trim()) {
    head.push(`curriculumTheme: ${curriculumTheme.trim()}`);
  }
  if (curriculumLessonTitle?.trim()) {
    head.push(`curriculumLessonTitle: ${curriculumLessonTitle.trim()}`);
  }
  head.push(`saved: ${rec.updatedAt ?? ""}`);
  head.push("---");
  const sp = rec.sentencePatternSnapshot;
  if (sp?.pattern) {
    head.push(formatSentencePatternBlockPlain(sp));
    head.push("---");
  }
  const vfPlain = formatVocabFinalTablePlain(rec.vocabFinalTable?.items);
  if (vfPlain) {
    head.push(vfPlain);
    head.push("---");
  }
  return head.join("\n") + "\n" + passageText;
}

const HTML_OVERVIEW_NAME = "00-lessons-overview.html";

/**
 * Zips: overview HTML (full text + metadata), then one .txt per lesson (UTF-8, LF).
 */
export async function zipLessonsForLevel(
  levelId: string,
  levelName: string,
  levelOrder: number,
  lessonNumbers: number[],
  themeForLesson: (n: number) => string | undefined,
  planLessonTitleForLesson?: (n: number) => string | undefined,
): Promise<Blob> {
  const zip = new JSZip();
  const html = buildLessonsHtmlDocument({
    levelId,
    levelName,
    levelOrder,
    lessonNumbers,
    themeForLesson,
    planLessonTitleForLesson,
  });
  zip.file(HTML_OVERVIEW_NAME, html);
  for (const n of [...lessonNumbers].sort((a, b) => a - b)) {
    const rec = getLesson(levelId, n);
    const chosenText = resolveLessonTextForExport(levelId, rec);
    if (!rec || !chosenText) {
      continue;
    }
    const chosenWordCount = getLessonWordCount(levelId, n) ?? rec.wordCount;
    const name = buildExportFileName(
      levelId,
      n,
      themeForLesson(n),
    );
    const content = buildExportFileBody(
      levelId,
      n,
      rec,
      chosenText,
      chosenWordCount,
      themeForLesson(n),
      planLessonTitleForLesson?.(n),
    );
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "blob" });
}

export function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function makeZipFilename(levelId: string) {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${levelId}-lessons-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}
