import {
  bookToPlainText,
  tryParseBookOutput,
} from "./parseBookOutput";
import {
  displayFiction,
  displayGenre,
  displayStructure,
  displayTense,
} from "./exportDisplayLabels";
import { buildSentencePatternHtmlSection } from "./lessonPatternExport";
import { buildVocabFinalHtmlSection } from "./lessonVocabExport";
import {
  getLesson,
  getLessonWordCount,
  resolveLessonTextForExport,
} from "./lessonLibrary";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSavedAt(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Plain or level3 book JSON → readable text for export. */
function passageForDisplay(raw: string): string {
  const book = tryParseBookOutput(raw);
  return book ? bookToPlainText(book) : raw;
}

export function makeHtmlFilename(levelId: string) {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${levelId}-lessons-full-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.html`;
}

export function buildLessonsHtmlDocument(options: {
  levelId: string;
  levelName: string;
  levelOrder: number;
  lessonNumbers: number[];
  themeForLesson: (n: number) => string | undefined;
  planLessonTitleForLesson?: (n: number) => string | undefined;
}): string {
  const { levelId, levelName, levelOrder, themeForLesson, planLessonTitleForLesson } =
    options;
  const sorted = [...options.lessonNumbers].sort((a, b) => a - b);
  const sections: string[] = [];

  for (const n of sorted) {
    const rec = getLesson(levelId, n);
    const chosenText = resolveLessonTextForExport(levelId, rec);
    if (!rec || !chosenText) {
      continue;
    }
    const planTheme = themeForLesson(n)?.trim() ?? "";
    const planLt = planLessonTitleForLesson?.(n)?.trim() ?? "";
    const id = `lesson-${String(n).padStart(3, "0")}`;
    const body = escapeHtml(passageForDisplay(chosenText));
    const effectiveWords = getLessonWordCount(levelId, n) ?? rec.wordCount;
    const metaRows = [
      ["级别序号", String(levelOrder)],
      ["级别ID", levelId],
      ["级别名称", levelName],
      ["课序号", String(n)],
      [
        "虚构/非虚构",
        displayFiction(rec.fictionOrNonfiction) || "—",
      ],
      ["主题(保存时)", rec.topic?.trim() ?? "—"],
      ["课文标题(保存时)", rec.lessonTitle?.trim() ?? "—"],
      ["文本内容构思(保存时)", rec.contentBrief?.trim() ?? "—"],
      ["课纲主题", planTheme || "—"],
      ["课纲课文标题", planLt || "—"],
      ["结构类型", displayStructure(rec.structureType) || "—"],
      ["时态重点", displayTense(rec.tenseFocus) || "—"],
      ["体裁/具体形式", displayGenre(rec.genreFocus) || "—"],
      ["总词数", String(effectiveWords)],
      ["保存时间", formatSavedAt(rec.updatedAt) || "—"],
    ]
      .map(
        ([k, v]) =>
          `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(
            v,
          )}</td></tr>`,
      )
      .join("");

    const sp = rec.sentencePatternSnapshot;
    const patternHtml =
      sp?.pattern && sp.exampleSentence
        ? buildSentencePatternHtmlSection(sp, escapeHtml)
        : "";
    const patternSep = patternHtml
      ? `<hr class="sp-sep" />${patternHtml}`
      : "";
    const vfItems = rec.vocabFinalTable?.items;
    const vocabHtml =
      vfItems && vfItems.length > 0
        ? buildVocabFinalHtmlSection(vfItems, escapeHtml)
        : "";
    const vocabSep = vocabHtml ? `<hr class="sp-sep" />${vocabHtml}` : "";

    sections.push(`<section class="card" id="${id}">
<header class="card-h"><h2>第 ${n} 课</h2></header>
<table class="meta" aria-label="第 ${n} 课元数据">${metaRows}</table>
${patternSep}
${vocabSep}
<h3 class="body-h">课文正文</h3>
<pre class="body" lang="en">${body}</pre>
</section>`);
  }

  const title = `Graded reading · ${levelName} (${levelId})`;
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg: #f8f9fa; --card: #fff; --bd: #dee2e6; --text: #212529; }
  body { font-family: system-ui, "Segoe UI", "PingFang SC", sans-serif; line-height: 1.5; color: var(--text); max-width: 48rem; margin: 0 auto; padding: 1.25rem; background: var(--bg); }
  h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  .intro { font-size: 0.9rem; color: #495057; margin: 0 0 1.5rem; }
  .card { background: var(--card); border: 1px solid var(--bd); border-radius: 6px; padding: 1rem 1.1rem; margin-bottom: 1.5rem; page-break-inside: avoid; }
  .card-h { border-bottom: 1px solid var(--bd); padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
  .card-h h2 { margin: 0; font-size: 1.1rem; }
  table.meta { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .meta th { text-align: left; font-weight: 600; width: 9.5rem; padding: 0.2rem 0.5rem 0.2rem 0; vertical-align: top; }
  .meta td { padding: 0.2rem 0; }
  .body-h { font-size: 0.95rem; margin: 0.9rem 0 0.4rem; }
  .body { margin: 0; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.88rem; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto; }
  .sp-export h3 { font-size: 1rem; margin: 0.5rem 0 0.35rem; }
  .sp-export h4 { font-size: 0.88rem; margin: 0.5rem 0 0.2rem; color: #374151; }
  .sp-export .en, .sp-export p { margin: 0.2rem 0; font-size: 0.9rem; white-space: pre-wrap; }
  .sp-export .ex { background: #fff9db; padding: 0.35rem 0.5rem; border-radius: 4px; }
  .sp-export .sp-meta, .sp-export .sp-note { font-size: 0.8rem; color: #4b5563; }
  .sp-export ol { margin: 0.2rem 0 0.4rem 1.1rem; padding: 0; }
  .sp-sep { border: none; border-top: 1px dashed #dee2e6; margin: 0.75rem 0; }
  .vf-export h3 { font-size: 1rem; margin: 0.5rem 0 0.35rem; }
  .vf-sub { font-size: 0.82rem; font-weight: 500; color: #5a6b75; }
  .vf-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin: 0.25rem 0 0.5rem; }
  .vf-table th, .vf-table td { border: 1px solid var(--bd); padding: 0.35rem 0.5rem; vertical-align: top; }
  .vf-table th[scope="row"] { width: 2rem; text-align: center; color: #5a6b75; }
  .vf-table th[scope="col"] { text-align: left; background: #f1f3f5; }
  .vf-td-cefr { text-align: center; white-space: nowrap; width: 5.5rem; vertical-align: middle; }
  .vf-td-cam { text-align: center; white-space: nowrap; width: 6.5rem; vertical-align: middle; }
  .vf-cefr { display: inline-block; padding: 0.12rem 0.45rem; border-radius: 0.3rem; font-size: 0.85rem; font-weight: 600; }
  .vf-cefr-a1 { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
  .vf-cefr-a2 { background: #f3e5f5; color: #4a148c; border: 1px solid #ce93d8; }
  .vf-cefr-b1 { background: #e0f2f1; color: #004d40; border: 1px solid #26a69a; }
  .vf-cefr-na { background: #eceff1; color: #455a64; border: 1px solid #b0bec5; font-weight: 500; }
  .vf-cam { display: inline-block; padding: 0.12rem 0.45rem; border-radius: 0.3rem; font-size: 0.82rem; font-weight: 600; }
  .vf-cam-movers { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
  .vf-cam-ket { background: #ede7f6; color: #4527a0; border: 1px solid #b39ddb; }
  .vf-cam-pet { background: #e8f5e9; color: #1b5e20; border: 1px solid #81c784; }
  .vf-cam-na { background: #eceff1; color: #455a64; border: 1px solid #b0bec5; font-weight: 500; }
  @media print { body { background: #fff; } .card { border-color: #ccc; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="intro">本页由分级阅读平台在本机生成，含所选课次的元数据、在页内已做的「句型与例句」分析（若有）、「本课定表词」表（若有，含<strong> CEFR 欧框</strong> 与 <strong>剑桥级别</strong> 列；Level 1、2 每课至多 6 条，Level 3、4 每课至多 4 条）与课文正文。可用浏览器「打印」另存为 PDF。课文与 <code>ZIP</code> 内单课 <code>.txt</code> 中定表段、欧框/剑桥标记为同一套规则；若为 JSON 绘本数据，已展开为可读的按页纯文本。</p>
${sections.join("\n")}
</body>
</html>
`;
}
