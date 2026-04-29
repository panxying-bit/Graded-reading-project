import { ReadingOutput } from "./ReadingOutput";
import type { SentencePatternResponse } from "./api/client";

type Props = {
  /** e.g. level name from config, for display next to CEFR from API. */
  levelName: string;
  outText: string;
  pattern: SentencePatternResponse | null;
  patternError: string | null;
  patternLoading: boolean;
  patternNotes: string;
  onPatternNotesChange: (v: string) => void;
  onAnalyze: () => void;
  disableAnalyze: boolean;
};

/**
 * Shown after 定稿: teachable pattern, exemplar highlight in the text, 3 same-level variations.
 */
export function SentencePatternBlock({
  levelName,
  outText,
  pattern,
  patternError,
  patternLoading,
  patternNotes,
  onPatternNotesChange,
  onAnalyze,
  disableAnalyze,
}: Props) {
  const hasNotes = patternNotes.trim().length > 0;
  const reanalyzeLabel = hasNotes ? "按说明重新分析" : "重新分析句型";
  return (
    <section className="out sp-block" aria-label="句型与例句">
      <div className="out-head sp-block-head">
        <h2>本课句型与例句</h2>
        <p className="sp-block-lead">
          在定稿正文中选出一个核心可替换句型、对应例句，并生成 3
          条同难度变体，便于学生操练。分析依据见服务端{" "}
          <code className="sp-code">config/sentence-pattern-prompt.md</code>。
        </p>
      </div>
      {patternError && (
        <p className="err" role="alert">
          {patternError}
        </p>
      )}
      {!pattern && (
        <div className="out-actions sp-block-actions sp-block-actions--first">
          <button
            className="btn"
            type="button"
            onClick={onAnalyze}
            disabled={disableAnalyze || patternLoading}
            title="从定稿中首次抽取句型与变体"
          >
            {patternLoading ? "分析中…" : "分析句型与例句"}
          </button>
        </div>
      )}
      {pattern && (
        <div className="sp-result">
          <div className="sp-card">
            <h3 className="sp-h3">句型结构（Pattern）</h3>
            <p className="sp-pattern" lang="en">
              {pattern.pattern}
            </p>
            <p className="sp-meta">
              级别 <strong>{levelName}</strong>（API: <strong>{pattern.cefr}</strong>
              ）· 变体须与例句难度相当、不得超出本带要求。
            </p>
          </div>
          <div className="sp-card sp-card-passage">
            <h3 className="sp-h3">文中原句（高亮）</h3>
            {!pattern.exampleMatchedInText && (
              <p className="sp-warn" role="status">
                未在正文中精确定位到模型返回的例句（可能断句/标点与原文略有出入）。定稿区仍显示全文；请核对例句：{" "}
                <em lang="en">{pattern.exampleSentence}</em>
              </p>
            )}
            <div className="text-block sp-reread">
              <ReadingOutput
                text={outText}
                highlightPhrase={
                  pattern.exampleMatchedInText
                    ? pattern.exampleSentence
                    : null
                }
              />
            </div>
          </div>
          <div className="sp-card">
            <h3 className="sp-h3">句型变体（同难度 · 3 句）</h3>
            <ol className="sp-var-list" lang="en">
              {pattern.variations.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="sp-card">
            <h3 className="sp-h3">为何选这一句型</h3>
            <p className="sp-why" lang="en">
              {pattern.whyPattern}
            </p>
          </div>
          <div className="sp-card">
            <h3 className="sp-h3">教学重点</h3>
            <p className="sp-focus" lang="en">
              {pattern.teachingFocus}
            </p>
          </div>
        </div>
      )}
      {pattern && (
        <>
          <div className="sp-notes-wrap sp-notes-wrap--after-result">
            <label className="sp-notes-label" htmlFor="sp-revision-notes">
              句型修改说明（选填）
            </label>
            <p className="sp-notes-hint" id="sp-revision-hint">
              在查看上方 AI
              给出的句型、例句与变体后，若需要换一句或换一类句型，请写清问题或希望的方向，再点下方按钮；不填则按同一套规则从定稿中重新挑选（可与上次不同）。
            </p>
            <textarea
              id="sp-revision-notes"
              className="sp-notes-ta"
              value={patternNotes}
              onChange={(e) => {
                onPatternNotesChange(e.target.value);
              }}
              rows={3}
              placeholder="例：更想练询问感受的句型，不要一般现在时第三人称单数；或例句请换到第二页里关于朋友的那句。"
              spellCheck={true}
              disabled={disableAnalyze || patternLoading}
              aria-describedby="sp-revision-hint"
            />
          </div>
          <div className="out-actions sp-block-actions sp-block-actions--reanalyze">
            <button
              className="btn"
              type="button"
              onClick={onAnalyze}
              disabled={disableAnalyze || patternLoading}
              title="按说明重新挑选句型；不填说明则仅按默认标准再分析一次"
            >
              {patternLoading ? "分析中…" : reanalyzeLabel}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
