import { useMemo } from "react";
import type { VocabCandidateItem } from "./api/client";
import { CefrWordBadge } from "./CefrWordBadge";
import { cefrRankForL4Teaching } from "./cefrLookup";

type Props = {
  levelName: string;
  cefrLabel: string;
  /** Current level id; Level 4 uses L0–L3 Mastery union in copy and table captions. */
  levelId?: string;
  /** When true (Level 3 / 4 paged book), show note about Mastery de-duplication. */
  isLevel3: boolean;
  items: VocabCandidateItem[] | null;
  error: string | null;
  loading: boolean;
  onRun: () => void;
  disableRun: boolean;
  /** Level 3: words removed as duplicates of L0–L2 Mastery list. */
  excludedByPriorMastery: VocabCandidateItem[] | null;
  priorMasteryFilterNote: string | null;
  /** Same level, other lessons' 定表 (headword match). */
  excludedByOtherLessons: VocabCandidateItem[] | null;
  otherLessonsFilterNote: string | null;
};

/**
 * LLM vocabulary candidates; Level 3 may use single words or short fixed phrases; also Mastery filter.
 */
export function VocabCandidateBlock({
  levelName,
  cefrLabel,
  levelId = "",
  isLevel3,
  items,
  error,
  loading,
  onRun,
  disableRun,
  excludedByPriorMastery,
  priorMasteryFilterNote,
  excludedByOtherLessons,
  otherLessonsFilterNote,
}: Props) {
  const isL4Mastery = levelId === "level4";
  const sortedItems = useMemo(() => {
    if (!items?.length) {
      return items;
    }
    if (!isL4Mastery) {
      return items;
    }
    return [...items].sort((a, b) => {
      const d =
        cefrRankForL4Teaching(a.word) - cefrRankForL4Teaching(b.word);
      if (d !== 0) {
        return d;
      }
      return a.word.localeCompare(b.word, "en");
    });
  }, [items, isL4Mastery]);
  return (
    <section className="out vc-block" aria-label="词汇候选">
      <div className="out-head sp-block-head">
        <h2>本课词汇·候选（第一、二步）</h2>
        <p className="sp-block-lead">
          根据定稿正文，从当前课中筛出 5–7 个可教词
          {isLevel3 ? "或固定搭配短语" : ""}及原句。提示词由服务端{" "}
          <code className="sp-code">config/prompts/vocab-candidate-prompt.md</code>{" "}
          管理。
          {isLevel3 ? (
            isL4Mastery ? (
              <>
                {" "}
                <strong>Level 4</strong> 会在筛选后自动剔除与{" "}
                <strong>Level 0–3 词表（Mastery 核心词）</strong>重名的项：即{" "}
                <code className="sp-code">config/mastery-words-l0-l2.json</code>{" "}
                与 <code className="sp-code">config/mastery-words-l3.json</code>{" "}
                的并集（与低段及 Level 3 已锁核心词去重）。
              </>
            ) : (
              <>
                {" "}
                <strong>Level 3</strong> 会在筛选后
                自动剔除与{" "}
                <code className="sp-code">
                  config/mastery-words-l0-l2.json
                </code>{" "}
                中 <strong>Level 0–2 词表（Mastery 核心词）</strong>
                重名的词，避免与低段核心词重复。
              </>
            )
          ) : (
            <>
              {" "}
              （Level 1–2 不应用上述词表去重。）
            </>
          )}{" "}
          本级别 <strong>其他课次</strong>若已保存「定表词」，其词头会随请求作为忌用名单，并在结果中<strong>硬性剔除</strong>（与
          {isL4Mastery
            ? " Level 4 的 L0–L3 Mastery"
            : " Level 3 的 L0–L2 Mastery"}{" "}
          去重并行，互不替代；整词或整段固定搭配都按全串匹配）。同一次「筛选候选词」中由提示词 + 规则双保险，无需再拆成第二步。
          {isLevel3 ? (
            <>
              {" "}
              <strong>Level 3/4</strong>：以<strong>单词</strong>为主；若文中有
              <code className="sp-code">go to bed</code>、
              <code className="sp-code">take a shower</code>{" "}
              等适合整教的固定搭配，可整条写入「词」字段，不必为拆而拆；无短语句条数要求。
            </>
          ) : null}{" "}
          当前级别 <strong>{levelName}</strong>（{formatCefr(cefrLabel)}）。
          {isL4Mastery ? (
            <>
              {" "}
              <strong>Level 4</strong>：提示词会<strong>优先筛 A2 / B1</strong>
              难度词；A1 基础词不作为本级别核心教词目标。下表按欧框排序（B1→A2→A1）。
            </>
          ) : null}
        </p>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="out-actions sp-block-actions sp-block-actions--first">
        <button
          className="btn"
          type="button"
          onClick={onRun}
          disabled={disableRun}
          title="用当前定稿请求 LLM 生成词汇候选"
        >
          {loading ? "筛选中…" : "筛选候选词"}
        </button>
      </div>
      {priorMasteryFilterNote && (
        <p className="vc-note" role="status">
          {priorMasteryFilterNote}
        </p>
      )}
      {otherLessonsFilterNote && (
        <p className="vc-note" role="status">
          {otherLessonsFilterNote}
        </p>
      )}
      {excludedByPriorMastery && excludedByPriorMastery.length > 0 && (
        <div className="vc-table-wrap vc-excluded">
          <table className="vc-table" lang="en">
            <caption className="vc-caption">
              已剔除（与{" "}
              {isL4Mastery ? "L0–L3 Mastery" : "L0–L2 Mastery"} 重名）
            </caption>
            <thead>
              <tr>
                <th scope="col">词</th>
                <th scope="col">原句</th>
              </tr>
            </thead>
            <tbody>
              {excludedByPriorMastery.map((row, i) => (
                <tr key={`ex-${row.word}-${i}`}>
                  <td className="vc-word">{row.word}</td>
                  <td className="vc-sentence">{row.sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {excludedByOtherLessons && excludedByOtherLessons.length > 0 && (
        <div className="vc-table-wrap vc-excluded vc-excluded--other">
          <table className="vc-table" lang="en">
            <caption className="vc-caption">
              已剔除（与本级别其他课定表重名）
            </caption>
            <thead>
              <tr>
                <th scope="col">词</th>
                <th scope="col">原句</th>
              </tr>
            </thead>
            <tbody>
              {excludedByOtherLessons.map((row, i) => (
                <tr key={`ex-ol-${row.word}-${i}`}>
                  <td className="vc-word">{row.word}</td>
                  <td className="vc-sentence">{row.sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sortedItems && sortedItems.length > 0 && (
        <div className="vc-table-wrap">
          <table className="vc-table" lang="en">
            <caption className="vc-caption">
              保留的候选，共 {sortedItems.length} 项
              {isL4Mastery ? "（Level 4：欧框列 · B1/A2 优先）" : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">词</th>
                {isL4Mastery ? (
                  <th className="vc-col-cefr" scope="col">
                    欧框
                  </th>
                ) : null}
                <th scope="col">原句</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((row, i) => (
                <tr key={`${row.word}-${i}`}>
                  <td className="vc-word">{row.word}</td>
                  {isL4Mastery ? (
                    <td className="vc-col-cefr">
                      <CefrWordBadge word={row.word} levelId="level4" />
                    </td>
                  ) : null}
                  <td className="vc-sentence">{row.sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading &&
        sortedItems &&
        sortedItems.length === 0 &&
        ((excludedByPriorMastery?.length ?? 0) > 0 ||
          (excludedByOtherLessons?.length ?? 0) > 0) && (
          <p className="vc-empty" role="status">
            去重后无剩余候选项。若仅因 Mastery
            核心词（含 Level 4 时 L0–L3）被剔光，可调整定稿后重试。若因与其他课定表全冲突，可更换正文或减少重复主题词。
          </p>
        )}
    </section>
  );
}

function formatCefr(s: string): string {
  const t = s.trim();
  return t || "—";
}
