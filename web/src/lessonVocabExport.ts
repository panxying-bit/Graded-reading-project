import { cefrLabelText, lookupCefrWord } from "./cefrLookup";
import { cambridgeLabelText, lookupCambridgeWord } from "./cambridgeLookup";
import type { VocabFinalRow } from "./lessonLibrary";

/** Plain block for .txt / ZIP per-lesson export (after metadata & optional 句型). */
export function formatVocabFinalTablePlain(
  items: VocabFinalRow[] | undefined | null,
): string {
  const rows =
    items?.filter((r) => (r.word ?? "").trim() || (r.sentence ?? "").trim()) ??
    [];
  if (rows.length === 0) {
    return "";
  }
  const body = rows
    .map((r, i) => {
      const w = (r.word ?? "").trim();
      const s = (r.sentence ?? "").trim();
      const cefr = cefrLabelText(w);
      const cam = cambridgeLabelText(w);
      return `${i + 1}. ${w}  | 欧框: ${cefr}  | 剑桥级别: ${cam}\n   ${s}`;
    })
    .join("\n\n");
  return [
    "【本课定表词 · 含 CEFR 欧框 + 剑桥级别】",
    "",
    body,
  ].join("\n");
}

export function buildVocabFinalHtmlSection(
  items: VocabFinalRow[],
  escapeHtml: (s: string) => string,
): string {
  const rows = items.filter(
    (r) => (r.word ?? "").trim() || (r.sentence ?? "").trim(),
  );
  if (rows.length === 0) {
    return "";
  }
  const cefrBadgeHtml = (w: string) => {
    const t = cefrLabelText(w);
    const band = lookupCefrWord(w);
    const cls =
      band === "A1"
        ? "vf-cefr vf-cefr-a1"
        : band === "A2"
          ? "vf-cefr vf-cefr-a2"
          : band === "B1"
            ? "vf-cefr vf-cefr-b1"
            : "vf-cefr vf-cefr-na";
    return `<span class="${cls}" title="CEFR 欧框">${escapeHtml(t)}</span>`;
  };
  const cambridgeBadgeHtml = (w: string) => {
    const t = cambridgeLabelText(w);
    const band = lookupCambridgeWord(w);
    const cls =
      band === "Movers"
        ? "vf-cam vf-cam-movers"
        : band === "KET"
          ? "vf-cam vf-cam-ket"
          : band === "PET"
            ? "vf-cam vf-cam-pet"
            : "vf-cam vf-cam-na";
    return `<span class="${cls}" title="剑桥级别">${escapeHtml(t)}</span>`;
  };
  const list = rows
    .map(
      (r, i) => {
        const w = (r.word ?? "").trim();
        return `<tr><th scope="row">${i + 1}</th><td lang="en">${escapeHtml(
          w,
        )}</td><td class="vf-td-cefr">${cefrBadgeHtml(
          w,
        )}</td><td class="vf-td-cam">${cambridgeBadgeHtml(
          w,
        )}</td><td lang="en">${escapeHtml(
          (r.sentence ?? "").trim(),
        )}</td></tr>`;
      },
    )
    .join("");
  return `<section class="vf-export" lang="zh-Hans">
<h3>本课定表词 <span class="vf-sub">（含 CEFR 欧框 + 剑桥级别）</span></h3>
<table class="vf-table" aria-label="定表词，含欧框与剑桥级别">
<thead><tr><th scope="col">#</th><th scope="col">词</th><th scope="col">CEFR(欧框)</th><th scope="col">剑桥级别</th><th scope="col">原句</th></tr></thead>
<tbody>${list}</tbody>
</table>
</section>`;
}
