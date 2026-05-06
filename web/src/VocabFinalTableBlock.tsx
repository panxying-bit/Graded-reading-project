import { useMemo, useState } from "react";
import type { VocabCandidateItem } from "./api/client";
import { CambridgeWordBadge } from "./CambridgeWordBadge";
import { CefrWordBadge } from "./CefrWordBadge";
import { cefrRankForL4Teaching, lookupCefrWord } from "./cefrLookup";
import {
  confirmMasteryDuplicate,
  isMasteryWordInScope,
  type MasteryScope,
} from "./masteryWordlist";
import type { VocabFinalRow } from "./lessonLibrary";
import { TtsPlayButton } from "./TtsPlayButton";

const DEFAULT_MAX_ROWS = 4;

type Props = {
  /** After step 1+2: kept pool (may be null/empty; user can still add manually). */
  pool: VocabCandidateItem[] | null;
  value: VocabFinalRow[];
  onChange: (rows: VocabFinalRow[]) => void;
  disabled: boolean;
  /**
   * Paged book levels: compare hand-filled / inline-edited headwords against
   * Mastery lists (same as server 筛选候选词 de-dupe).
   */
  enableMasteryWordlistCheck?: boolean;
  /** Level 3: L0–L2 only; Level 4: L0–L3 (union with mastery-words-l3.json). */
  masteryScope?: MasteryScope;
  /** Level 3 / 4: 定表「词」可偶尔为多词固定搭配。 */
  isLevel3?: boolean;
  /** Override max rows (Level 1 / Level 2 allow up to 6). */
  maxRows?: number;
  /** When level4, sort candidate pool A2/B1 first and badge A1 as non-core. */
  levelId?: string;
};

function normWord(w: string): string {
  return w.trim().toLowerCase();
}

function hasDuplicate(
  items: VocabFinalRow[],
  word: string,
  skipIndex?: number,
): boolean {
  const n = normWord(word);
  if (!n) {
    return false;
  }
  return items.some(
    (it, i) => i !== skipIndex && normWord(it.word) === n,
  );
}

/**
 * Step 3: pick final words (checkboxes from pool, manual add, inline edit).
 */
export function VocabFinalTableBlock({
  pool,
  value,
  onChange,
  disabled,
  enableMasteryWordlistCheck = false,
  masteryScope = "l0-l2",
  isLevel3 = false,
  maxRows,
  levelId,
}: Props) {
  const maxFinal = Math.min(20, Math.max(1, maxRows ?? DEFAULT_MAX_ROWS));
  const [manWord, setManWord] = useState("");
  const [manSentence, setManSentence] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [eWord, setEWord] = useState("");
  const [eSent, setESent] = useState("");

  const poolList = pool ?? [];
  const sortedPoolList = useMemo(() => {
    if (levelId !== "level4") {
      return poolList;
    }
    return [...poolList].sort((a, b) => {
      const d =
        cefrRankForL4Teaching(a.word) - cefrRankForL4Teaching(b.word);
      if (d !== 0) {
        return d;
      }
      return a.word.localeCompare(b.word, "en");
    });
  }, [poolList, levelId]);
  const inFinal = (row: VocabCandidateItem) =>
    value.some(
      (f) =>
        normWord(f.word) === normWord(row.word) &&
        f.sentence.trim() === row.sentence.trim(),
    );

  function setRows(next: VocabFinalRow[]) {
    onChange(next.slice(0, maxFinal));
    setErr(null);
  }

  function togglePool(row: VocabCandidateItem) {
    if (disabled) {
      return;
    }
    if (inFinal(row)) {
      setRows(
        value.filter(
          (f) =>
            !(
              normWord(f.word) === normWord(row.word) &&
              f.sentence.trim() === row.sentence.trim()
            ),
        ),
      );
      return;
    }
    if (value.length >= maxFinal) {
      setErr(`定表最多 ${maxFinal} 个，请先取消一项或移除再添加。`);
      return;
    }
    if (hasDuplicate(value, row.word)) {
      setErr("该词已在定表中（按词形），请勿重复。");
      return;
    }
    setRows([...value, { word: row.word.trim(), sentence: row.sentence }]);
  }

  function addManual() {
    const w = manWord.trim();
    const s = manSentence.trim();
    if (!w || !s) {
      setErr("请填写词和原句。");
      return;
    }
    if (value.length >= maxFinal) {
      setErr(`定表最多 ${maxFinal} 个。`);
      return;
    }
    if (hasDuplicate(value, w)) {
      setErr("该词已在定表中，请勿重复。");
      return;
    }
    if (
      enableMasteryWordlistCheck &&
      !confirmMasteryDuplicate(w, masteryScope)
    ) {
      return;
    }
    setRows([...value, { word: w, sentence: s }]);
    setManWord("");
    setManSentence("");
  }

  function removeAt(i: number) {
    setRows(value.filter((_, j) => j !== i));
    if (editing === i) {
      setEditing(null);
    }
  }

  function startEdit(i: number) {
    setEditing(i);
    setEWord(value[i]!.word);
    setESent(value[i]!.sentence);
    setErr(null);
  }

  function saveEdit() {
    if (editing == null) {
      return;
    }
    const w = eWord.trim();
    const s = eSent.trim();
    if (!w || !s) {
      setErr("词与原句均不能为空。");
      return;
    }
    if (hasDuplicate(value, w, editing)) {
      setErr("与其他行词形重复。");
      return;
    }
    if (
      enableMasteryWordlistCheck &&
      !confirmMasteryDuplicate(w, masteryScope)
    ) {
      return;
    }
    const next = value.map((r, j) =>
      j === editing ? { word: w, sentence: s } : r,
    );
    setRows(next);
    setEditing(null);
  }

  return (
    <section
      className="out vfinal-block"
      aria-label="本课定表词"
    >
      <div className="out-head sp-block-head">
        <h2>本课定表词（第三步 · 最多 {maxFinal} 个）</h2>
        <p className="sp-block-lead">
          从上方「保留的候选」中勾选，或在此<strong>手动添加/编辑</strong>。
          {isLevel3 ? (
            <>
              {" "}
              <strong>Level 3 与 Level 4</strong> 每课定表目标相同：最多{" "}
              <strong>{maxFinal} 个</strong>可教词/搭配，形态一致。
            </>
          ) : null}{" "}
          <strong>每次勾选、编辑、移除或加入后都会自动保存到本机当前课</strong>，不需要再点「保存」或「确定」。
          切换课次或重新生成定稿时，定表会按与句型相同的规则清空。
          <strong>欧框</strong>列按内置 CEFR A1、A2、B1
          词表自动匹配（小写、去首尾空格；词组须与表中整段一致）。
          {isLevel3 ? (
            <>
              {" "}
              同时增加<strong>剑桥级别</strong>列（Movers / KET / PET / 未收录），重叠词按“首次出现级别”优先：Movers
              &gt; KET &gt; PET。
            </>
          ) : null}
          {levelId === "level4" ? (
            <>
              {" "}
              <strong>Level 4</strong> 以 <strong>A2、B1</strong> 为
              <strong>核心教词带</strong>（标签加亮）；<strong>A1</strong>{" "}
              标为已掌握基础词，不作为本课核心学习目标。
            </>
          ) : (
            <>
              {" "}
              同一词命中多档时优先标 A1，其次 A2，再 B1。
            </>
          )}
        </p>
        {isLevel3 && (
          <p className="sp-block-lead vfinal-chunk-lead">
            <strong>
              {levelId === "level1" || levelId === "level2"
                ? "Level 1 / 2"
                : "Level 3 / 4"}
            </strong>
            ：「词」以单词为主；适合整教时（如
            <code>go to bed</code>）可填<strong>2–4 个词的固定搭配</strong>。Mastery
            / 欧框 / 他课去重均按<strong>整段字串</strong>（小写、去首尾空格）完全匹配。
          </p>
        )}
        {enableMasteryWordlistCheck && (
          <p className="sp-block-lead vfinal-mastery-lead">
            {masteryScope === "l0-l3" ? (
              <>
                <strong>Level 4</strong>
                ：手填或编辑定表中的「词」时，会与 <strong>Level 0–3</strong>{" "}
                核心词（Mastery，含 <code className="sp-code">mastery-words-l0-l2.json</code>{" "}
                与 <code className="sp-code">mastery-words-l3.json</code>）比对重名；若重合将提示确认，规则与「筛选候选词」剔除重名项一致。
              </>
            ) : (
              <>
                <strong>Level 1、Level 2、Level 3</strong>
                ：手填或编辑定表中的「词」时，会与 L0–L2
                核心词（Mastery）词库比对重名；若重合将提示确认，规则与「筛选候选词」剔除重名项一致。
              </>
            )}
          </p>
        )}
      </div>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}

      <div className="vfinal-pool">
        <h3 className="vfinal-h3">从候选池加入定表</h3>
        {poolList.length === 0 ? (
          <p className="vfinal-hint">暂无候选。可先点「筛选候选词」，或仅用下方手动添加。</p>
        ) : (
          <div className="vc-table-wrap">
            <table className="vc-table" lang="en">
              <caption className="vc-caption">
                候选池 · 已选 {value.length}/{maxFinal}
                {levelId === "level4"
                  ? "（Level 4：已按 B1→A2→A1 优先排序；核心教词带为 A2 / B1）"
                  : ""}
              </caption>
              <thead>
                <tr>
                  <th className="vfinal-col-pick" scope="col">定表</th>
                  <th scope="col">词</th>
                  <th className="vfinal-col-cefr" scope="col">
                    欧框
                  </th>
                  {isLevel3 ? (
                    <th className="vfinal-col-cam" scope="col">
                      剑桥级别
                    </th>
                  ) : null}
                  <th scope="col">原句</th>
                </tr>
              </thead>
              <tbody>
                {sortedPoolList.map((row, i) => {
                  const on = inFinal(row);
                  const atCap = !on && value.length >= maxFinal;
                  return (
                    <tr key={`pool-${i}-${row.word}`}>
                      <td className="vfinal-col-pick">
                        <button
                          type="button"
                          className={`vfinal-pick${on ? " is-on" : ""}`}
                          onClick={() => togglePool(row)}
                          disabled={disabled || atCap}
                          title={on ? "从定表移除" : "加入定表"}
                        >
                          {on ? "✓" : "＋"}
                        </button>
                      </td>
                      <td className="vc-word">
                        <span className="word-with-tts">
                          {row.word}
                          <TtsPlayButton text={row.word} disabled={disabled} />
                        </span>
                      </td>
                      <td className="vfinal-col-cefr">
                        <CefrWordBadge word={row.word} levelId={levelId} />
                      </td>
                      {isLevel3 ? (
                        <td className="vfinal-col-cam">
                          <CambridgeWordBadge word={row.word} />
                        </td>
                      ) : null}
                      <td className="vc-sentence">{row.sentence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="vfinal-final">
        <h3 className="vfinal-h3">定表（当前 {value.length}/{maxFinal}）</h3>
        {value.length === 0 ? (
          <p className="vfinal-hint">定表为空。</p>
        ) : (
          <div className="vc-table-wrap">
            <table className="vc-table vfinal-final-table" lang="en">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">词</th>
                  <th className="vfinal-col-cefr" scope="col">
                    欧框
                  </th>
                  {isLevel3 ? (
                    <th className="vfinal-col-cam" scope="col">
                      剑桥级别
                    </th>
                  ) : null}
                  <th scope="col">原句</th>
                  <th className="vfinal-col-ops" scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {value.map((row, i) => (
                  <tr key={`f-${i}-${row.word}`}>
                    <td className="vfinal-idx">{i + 1}</td>
                    <td className="vc-word">
                      {editing === i ? (
                        <div className="vfinal-edit-word">
                          <div className="word-with-tts word-with-tts--edit">
                            <input
                              className="vfinal-input"
                              value={eWord}
                              onChange={(e) => setEWord(e.target.value)}
                              disabled={disabled}
                              lang="en"
                              autoComplete="off"
                            />
                            <TtsPlayButton text={eWord} disabled={disabled} />
                          </div>
                          {enableMasteryWordlistCheck &&
                            isMasteryWordInScope(eWord, masteryScope) && (
                              <p
                                className="vfinal-mastery-flag"
                                role="status"
                              >
                                与 Mastery 核心词词库重名；点「保存」时将确认是否保留。
                              </p>
                            )}
                        </div>
                      ) : (
                        <span className="word-with-tts">
                          {row.word}
                          <TtsPlayButton text={row.word} disabled={disabled} />
                        </span>
                      )}
                    </td>
                    <td className="vfinal-col-cefr">
                      <CefrWordBadge
                        word={editing === i ? eWord : row.word}
                        levelId={levelId}
                      />
                    </td>
                    {isLevel3 ? (
                      <td className="vfinal-col-cam">
                        <CambridgeWordBadge word={editing === i ? eWord : row.word} />
                      </td>
                    ) : null}
                    <td className="vc-sentence">
                      {editing === i ? (
                        <textarea
                          className="vfinal-ta"
                          value={eSent}
                          onChange={(e) => setESent(e.target.value)}
                          disabled={disabled}
                          rows={2}
                          spellCheck={true}
                          lang="en"
                        />
                      ) : (
                        row.sentence
                      )}
                    </td>
                    <td className="vfinal-ops">
                      {editing === i ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={saveEdit}
                            disabled={disabled}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="btn sec"
                            onClick={() => setEditing(null)}
                            disabled={disabled}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn sec"
                            onClick={() => startEdit(i)}
                            disabled={disabled}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn sec"
                            onClick={() => removeAt(i)}
                            disabled={disabled}
                          >
                            移除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {value.length > 0 && (
          <p className="vfinal-saved" role="status">
            ✓ 定表已自动保存到本机（当前课）
          </p>
        )}
      </div>

      <div className="vfinal-manual">
        <h3 className="vfinal-h3">手动添加（可选）</h3>
        <p className="vfinal-hint">
          此处用于<strong>手填</strong>词和原句，再点「加入定表」。与上方从候选池勾选是两条路径；<strong>不是</strong>整步定表的「保存」键。
        </p>
        {value.length >= maxFinal ? (
          <p className="vfinal-manual-cap" role="note">
            定表已满 {maxFinal} 个，故「加入定表」已关闭。定表在每次改动时已自动保存。若还要用手动添加，请先在定表中「移除」至少一项。
          </p>
        ) : (
          <>
            <p className="vfinal-hint">
              词形以你教学为准；原句建议与定稿一致便于课堂定位。
            </p>
            <div className="vfinal-manual-grid">
              <label>
                词
                <input
                  className="vfinal-input vfinal-input-wide"
                  value={manWord}
                  onChange={(e) => setManWord(e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. echo"
                  autoComplete="off"
                  lang="en"
                />
                {manWord.trim() && (
                  <div className="vfinal-manual-wl" role="status">
                    {lookupCefrWord(manWord) ? (
                      <p className="vfinal-wl-line vfinal-wl--cef-in">
                        <strong>欧框 A1/A2/B1 词表：</strong>
                        已收录该词形（
                        <CefrWordBadge word={manWord} levelId={levelId} />
                        ）。你输入的「词」与内置表一致（小写、去首尾空格；多词需整段一致）即视为命中。
                      </p>
                    ) : (
                      <p className="vfinal-wl-line vfinal-wl--cef-miss">
                        <strong>欧框 A1/A2/B1 词表：</strong>
                        未与当前「词」完全同形匹配。欧框显示
                        <CefrWordBadge word={manWord} levelId={levelId} />
                        ；可正常加入定表。
                      </p>
                    )}
                    {isLevel3 ? (
                      <p className="vfinal-wl-line vfinal-wl--cam">
                        <strong>剑桥级别词表：</strong>
                        <CambridgeWordBadge word={manWord} />
                        （重叠词按首次出现级别：Movers &gt; KET &gt; PET）
                      </p>
                    ) : null}
                    {enableMasteryWordlistCheck &&
                      isMasteryWordInScope(manWord, masteryScope) && (
                        <p
                          className="vfinal-wl-line vfinal-wl--mastery"
                          role="alert"
                        >
                          <strong>Mastery 核心词词表：</strong>
                          已收录该词。与「筛选候选词」去重规则一致，点「加入定表」时会弹窗确认是否仍加入。
                        </p>
                      )}
                  </div>
                )}
              </label>
              <label className="vfinal-label-ta">
                原句
                <textarea
                  className="vfinal-ta"
                  value={manSentence}
                  onChange={(e) => setManSentence(e.target.value)}
                  disabled={disabled}
                  rows={2}
                  placeholder="从定稿中复制的原句"
                  spellCheck={true}
                  lang="en"
                />
              </label>
            </div>
            <div className="out-actions vfinal-actions">
              <button
                type="button"
                className="btn"
                onClick={addManual}
                disabled={disabled}
                title={`将下方手填的「词+原句」加入定表（未满 ${maxFinal} 个时可用）`}
              >
                加入定表
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
