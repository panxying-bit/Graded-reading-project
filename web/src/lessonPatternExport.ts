import type { SentencePatternSnapshot } from "./lessonLibrary";

/** Plain section for .txt and ZIP / per-lesson export. */
export function formatSentencePatternBlockPlain(
  sp: SentencePatternSnapshot,
): string {
  const vars = sp.variations.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  const lines = [
    "【句型与教学】 (Sentence pattern & teaching notes)",
    `CEFR: ${sp.cefr}  |  level: ${sp.level}`,
    "",
    "句型 / Pattern:",
    sp.pattern,
    "",
    "文中原句 (例) / Example from text:",
    sp.exampleSentence,
    `（与正文可精确定位: ${sp.exampleMatchedInText ? "是" : "否"})`,
    "",
    "为何选此句型 / Why this pattern:",
    sp.whyPattern,
    "",
    "同难度变体 (3) / Variations (same level):",
    vars,
    "",
    "教学重点 / Teaching focus:",
    sp.teachingFocus,
  ];
  return lines.join("\n");
}

export function buildSentencePatternHtmlSection(
  sp: SentencePatternSnapshot,
  escapeHtml: (s: string) => string,
): string {
  const v = sp.variations
    .map((s, i) => `<li lang="en">${escapeHtml(s)}</li>`)
    .join("");
  return `<section class="sp-export" lang="zh-Hans">
<h3>句型与教学</h3>
<p class="sp-meta">CEFR <strong>${escapeHtml(
    sp.cefr,
  )}</strong> · level <code>${escapeHtml(sp.level)}</code></p>
<h4>句型 (Pattern)</h4>
<p class="en" lang="en">${escapeHtml(sp.pattern)}</p>
<h4>文中原句 (Example)</h4>
<p class="en ex" lang="en">${escapeHtml(sp.exampleSentence)}</p>
<p class="sp-note">与正文可定位一致：${sp.exampleMatchedInText ? "是" : "否（仍以模型返回为准）"}</p>
<h4>为何选此句型</h4>
<p class="en" lang="en">${escapeHtml(sp.whyPattern)}</p>
<h4>同难度变体 (3 句)</h4>
<ol class="en" lang="en">${v}</ol>
<h4>教学重点</h4>
<p class="en" lang="en">${escapeHtml(sp.teachingFocus)}</p>
</section>`;
}
