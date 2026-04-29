import { useCallback, useMemo, useState } from "react";
import {
  tryParseBookOutput,
  type BookOutput,
  type BookPage,
} from "./parseBookOutput";

type Props = {
  /** Raw model JSON (book object). */
  value: string;
  onChange: (nextJsonString: string) => void;
  /**
   * `draft` = 初稿；`refined` = 精修；`final` = 语言校对后的定稿（提示文案不同）。
   */
  variant?: "draft" | "refined" | "final";
};

/** Level3 final book is 6–8 pages; editor allows 1–8 for draft flexibility. */
const PAGE_COUNT_MIN = 1;
const PAGE_COUNT_MAX = 8;

function serializeBook(b: BookOutput): string {
  const obj: Record<string, unknown> = { pages: b.pages };
  if (b.title?.trim()) {
    obj.title = b.title.trim();
  }
  if (b.level) {
    obj.level = b.level;
  }
  if (b.structure_type) {
    obj.structure_type = b.structure_type;
  }
  return JSON.stringify(obj, null, 2);
}

/** Consecutive page numbers 1..N in reading order. */
function renumberPages(pages: BookPage[]): BookPage[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  return sorted.map((p, i) => ({ ...p, page: i + 1 }));
}

/** Keep current array order and only rewrite page numbers to 1..N. */
function renumberPagesInCurrentOrder(pages: BookPage[]): BookPage[] {
  return pages.map((p, i) => ({ ...p, page: i + 1 }));
}

/**
 * Form-based editor for level3 book JSON (title + per-page text), with optional raw JSON mode.
 */
export function BookDraftEditor({
  value,
  onChange,
  variant = "draft",
}: Props) {
  const [rawMode, setRawMode] = useState(false);
  const isRefined = variant === "refined";
  const isFinal = variant === "final";

  const parsed = useMemo(() => tryParseBookOutput(value), [value]);
  const sortedPages = useMemo(() => {
    if (!parsed) {
      return [];
    }
    return [...parsed.pages].sort((a, b) => a.page - b.page);
  }, [parsed]);

  const setBook = useCallback(
    (next: BookOutput) => {
      onChange(serializeBook(next));
    },
    [onChange],
  );

  const updateTitle = useCallback(
    (title: string) => {
      if (!parsed) {
        return;
      }
      setBook({ ...parsed, title: title || undefined });
    },
    [parsed, setBook],
  );

  const updatePage = useCallback(
    (pageNum: number, patch: Partial<Pick<BookPage, "text" | "scene_note">>) => {
      if (!parsed) {
        return;
      }
      const newPages = parsed.pages.map((p) =>
        p.page === pageNum ? { ...p, ...patch } : p,
      );
      setBook({ ...parsed, pages: newPages });
    },
    [parsed, setBook],
  );

  const addPage = useCallback(() => {
    if (!parsed) {
      return;
    }
    const sorted = [...parsed.pages].sort((a, b) => a.page - b.page);
    if (sorted.length >= PAGE_COUNT_MAX) {
      return;
    }
    const last = sorted[sorted.length - 1];
    const nextNum = last ? last.page + 1 : 1;
    // Append new page; renumberPages() then makes page ids 1..N in order.
    const nextPages = renumberPages([
      ...parsed.pages,
      { page: nextNum, text: "" },
    ]);
    setBook({ ...parsed, pages: nextPages });
  }, [parsed, setBook]);

  /** Insert an empty page immediately after the given page number; renumbers 1..N. */
  const insertBlankPageAfter = useCallback(
    (afterPageNum: number) => {
      if (!parsed) {
        return;
      }
      const sorted = [...parsed.pages].sort((a, b) => a.page - b.page);
      if (sorted.length >= PAGE_COUNT_MAX) {
        return;
      }
      const idx = sorted.findIndex((p) => p.page === afterPageNum);
      if (idx === -1) {
        return;
      }
      const inserted: BookPage[] = [
        ...sorted.slice(0, idx + 1),
        { page: 0, text: "" },
        ...sorted.slice(idx + 1),
      ];
      // For "insert after", preserve current order; do not sort by page value.
      setBook({ ...parsed, pages: renumberPagesInCurrentOrder(inserted) });
    },
    [parsed, setBook],
  );

  const removePage = useCallback(
    (pageNum: number) => {
      if (!parsed) {
        return;
      }
      const sorted = [...parsed.pages].sort((a, b) => a.page - b.page);
      if (sorted.length <= PAGE_COUNT_MIN) {
        return;
      }
      const nextPages = renumberPages(
        parsed.pages.filter((p) => p.page !== pageNum),
      );
      setBook({ ...parsed, pages: nextPages });
    },
    [parsed, setBook],
  );

  if (rawMode) {
    return (
      <div className="book-draft-editor book-draft-editor--raw">
        <p className="book-draft-hint book-draft-hint--strong">
          当前为 <strong>JSON 源码</strong> 视图，不显示每页的「后加空白页」按钮。需要加页/删页时，请先点下方
          <strong>「返回表单编辑」</strong>，在表单中每页右侧可「后加空白页」，底部可「在末尾加一页」。
        </p>
        <p className="book-draft-hint">
          正在编辑 JSON 源码。若格式错误，确认保存会失败，请改回有效绘本结构。
        </p>
        <textarea
          className="out-edit-ta"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          lang="en"
        />
        <button
          type="button"
          className="btn sec book-draft-toggle"
          onClick={() => {
            if (tryParseBookOutput(value)) {
              setRawMode(false);
            } else {
              window.alert("当前 JSON 无法解析为绘本格式，请修正后再返回表单。");
            }
          }}
        >
          返回表单编辑
        </button>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="book-draft-editor book-draft-editor--raw">
        <p className="book-draft-warn" role="alert">
          无法将
          {isFinal ? "定稿" : isRefined ? "精修稿" : "初稿"}
          识别为绘本 JSON（需为含 <code>pages</code> 数组的对象，且每页有合法的 <code>page</code> 与正文字段
          <code>text</code>）。修正并保存为可解析 JSON 后，将恢复表单视图与「后加空白页」等按钮。
        </p>
        <textarea
          className="out-edit-ta"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          lang="en"
        />
      </div>
    );
  }

  return (
    <div className="book-draft-editor">
      <p className="book-draft-hint">
        {isFinal ? (
          <>
            <strong>第三阶段 · 定稿</strong>：为语言校对后的正文，可直接修改标题、每页英文；每页可「后加空白页」或在末尾加页，亦可删页；版式以
            JSON 为准。若需大段改内容或重控词数，请回到<strong>精修</strong>阶段。
          </>
        ) : isRefined ? (
          <>
            <strong>第二阶段 · 精修</strong>：在初稿上已做页数/词数带处理，可改标题、每页英文；每页可「后加空白页」以便在中间加句。完成后请用
            <strong>「语言校核」</strong> 生成<strong>定稿</strong>（仅纠错，不改情节）。
          </>
        ) : (
          <>
            下面直接改<strong>标题</strong>和<strong>每页英文</strong>即可；每页可「后加空白页」或在书末加页，亦可「删本页」；页码会自动重排。课规定稿为
            6–8 页，此处初稿可编辑 {PAGE_COUNT_MIN}–{PAGE_COUNT_MAX} 页。
          </>
        )}
      </p>
      <label className="book-draft-title-label">
        <span className="book-draft-label-text">标题 Title（选填）</span>
        <input
          type="text"
          className="book-draft-title-input"
          value={parsed.title ?? ""}
          onChange={(e) => {
            updateTitle(e.target.value);
          }}
          placeholder="e.g. Mia and the Seven-Day Plan"
          spellCheck={true}
          lang="en"
          autoComplete="off"
        />
      </label>
      <div className="book-draft-pages" role="list">
        {sortedPages.map((pg) => (
          <div key={pg.page} className="book-draft-page" role="listitem">
            <div className="book-draft-page-head">
              <span className="book-draft-page-badge">第 {pg.page} 页</span>
              <div className="book-draft-page-actions">
                {sortedPages.length < PAGE_COUNT_MAX && (
                  <button
                    type="button"
                    className="btn-ghost book-draft-page-insert"
                    onClick={() => {
                      insertBlankPageAfter(pg.page);
                    }}
                    title="在本页之后插入一页空白英文（方便中间加句；页码自动重排，全书最多 8 页）"
                  >
                    后加空白页
                  </button>
                )}
                {sortedPages.length > PAGE_COUNT_MIN && (
                  <button
                    type="button"
                    className="btn-ghost book-draft-page-remove"
                    onClick={() => {
                      removePage(pg.page);
                    }}
                    title="删除本页（删除后页码会重新从 1 连号）"
                  >
                    删除本页
                  </button>
                )}
              </div>
            </div>
            <label className="book-draft-page-label">
              <textarea
                className="book-draft-page-ta"
                value={pg.text}
                onChange={(e) => {
                  updatePage(pg.page, { text: e.target.value });
                }}
                rows={3}
                spellCheck={true}
                lang="en"
                aria-label={`第 ${pg.page} 页英文正文`}
              />
            </label>
            {pg.scene_note != null && pg.scene_note !== "" && (
              <label className="book-draft-scene-label">
                <span className="book-draft-label-text">场景说明（选填）</span>
                <input
                  type="text"
                  className="book-draft-scene-input"
                  value={pg.scene_note ?? ""}
                  onChange={(e) => {
                    updatePage(pg.page, { scene_note: e.target.value });
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
      {sortedPages.length >= PAGE_COUNT_MAX ? (
        <p className="book-draft-limit-note" role="note">
          已达到 {PAGE_COUNT_MAX}{" "}
          页上限，无法再加页；若需插入内容，请先删除某一页或使用「删除本页」腾出空位。
        </p>
      ) : (
        <div className="book-draft-add-row">
          <button
            type="button"
            className="btn sec"
            onClick={addPage}
            title="在书末加一页空白英文（全书最多 8 页；中间插入请用每页的「后加空白页」）"
          >
            在末尾加一页
          </button>
        </div>
      )}
      <button
        type="button"
        className="btn sec book-draft-toggle"
        onClick={() => {
          setRawMode(true);
        }}
      >
        切换为 JSON 源码编辑
      </button>
    </div>
  );
}
