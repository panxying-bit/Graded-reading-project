import { useCallback, useEffect, useMemo, useState } from "react";
import { listFilledLessonIndices } from "./lessonLibrary";
import { downloadLessonsExcel } from "./lessonDownloadExcel";
import { buildLessonsHtmlDocument, makeHtmlFilename } from "./lessonDownloadHtml";
import {
  makeZipFilename,
  triggerDownloadBlob,
  zipLessonsForLevel,
} from "./lessonDownloadZip";

type Props = {
  levelId: string;
  /** 1-based index in the loaded levels list (for the summary sheet). */
  levelOrder: number;
  levelName: string;
  lessonsPerLevel: number;
  /** Bumps when localStorage changes. */
  version: number;
  /** Optional, e.g. from level3 lesson plan. */
  themeForLesson: (n: number) => string | undefined;
  /** Optional outline lesson title per slot. */
  planLessonTitleForLesson?: (n: number) => string | undefined;
};

export function LessonDownloadPanel({
  levelId,
  levelOrder,
  levelName,
  lessonsPerLevel,
  version,
  themeForLesson,
  planLessonTitleForLesson,
}: Props) {
  const total = Math.max(1, Math.min(1000, lessonsPerLevel));
  const filled = useMemo(
    () => listFilledLessonIndices(levelId, total),
    [levelId, total, version],
  );

  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [levelId]);

  const allSelected =
    filled.length > 0 && filled.every((n) => selected.has(n));
  const selectedCount = filled.filter((n) => selected.has(n)).length;

  const selectAll = useCallback(() => {
    setSelected(new Set(filled));
  }, [filled]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const toggle = useCallback((n: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else {
        next.add(n);
      }
      return next;
    });
  }, []);

  const [zipping, setZipping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = useCallback(async () => {
    if (selectedCount === 0) {
      return;
    }
    setErr(null);
    setZipping(true);
    try {
      const nums = filled.filter((n) => selected.has(n));
      const blob = await zipLessonsForLevel(
        levelId,
        levelName,
        levelOrder,
        nums,
        themeForLesson,
        planLessonTitleForLesson,
      );
      triggerDownloadBlob(blob, makeZipFilename(levelId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setZipping(false);
    }
  }, [
    levelId,
    levelName,
    levelOrder,
    filled,
    selected,
    selectedCount,
    themeForLesson,
    planLessonTitleForLesson,
  ]);

  const downloadHtml = useCallback(() => {
    if (selectedCount === 0) {
      return;
    }
    setErr(null);
    setZipping(true);
    try {
      const nums = filled.filter((n) => selected.has(n));
      const html = buildLessonsHtmlDocument({
        levelId,
        levelName,
        levelOrder,
        lessonNumbers: nums,
        themeForLesson,
        planLessonTitleForLesson,
      });
      const blob = new Blob([html], {
        type: "text/html;charset=utf-8",
      });
      triggerDownloadBlob(blob, makeHtmlFilename(levelId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setZipping(false);
    }
  }, [
    levelId,
    levelName,
    levelOrder,
    filled,
    selected,
    selectedCount,
    themeForLesson,
    planLessonTitleForLesson,
  ]);

  const downloadExcel = useCallback(() => {
    if (selectedCount === 0) {
      return;
    }
    setErr(null);
    setZipping(true);
    try {
      const nums = filled.filter((n) => selected.has(n));
      downloadLessonsExcel(
        levelId,
        levelName,
        levelOrder,
        nums,
        themeForLesson,
        planLessonTitleForLesson,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setZipping(false);
    }
  }, [
    levelId,
    levelName,
    levelOrder,
    filled,
    selected,
    selectedCount,
    themeForLesson,
    planLessonTitleForLesson,
  ]);

  if (filled.length === 0) {
    return (
      <details
        className="dl-panel prompt-panel"
        aria-label="本级别下载"
      >
        <summary className="dl-title">本级别下载</summary>
        <div className="dl-panel-inner prompt-panel-inner">
          <p className="dl-hint">当前级别下还没有已保存的课文，生成并保存后便可打包下载。</p>
        </div>
      </details>
    );
  }

  return (
    <details
      className="dl-panel prompt-panel"
      aria-label="本级别下载"
    >
      <summary className="dl-title">本级别下载</summary>
      <div className="dl-panel-inner prompt-panel-inner">
        <p className="dl-hint">
        勾选要导出的课次。<strong>ZIP</strong> 内除每课一个 <code>.txt</code>（元数据后、课文前会附「句型与教学」全文，仅当该课在页面成功做过句型分析并写回本机）外，另有{" "}
        <code>00-lessons-overview.html</code>：在浏览器中打开可查看
        <strong>元数据、句型与例句区（若有）与完整课文</strong>（无 Excel
        单元格长度限制，适合通读、打印、另存 PDF）。也可单独点「HTML
        全文总览」只下这一份。
        <strong>Excel 汇总</strong>含与句型相关的多列，正文长文仍不放入。均在本地生成，不经服务器。
        </p>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      <div className="dl-toolbar">
        <button
          className="btn sec"
          type="button"
          onClick={allSelected ? clearAll : selectAll}
        >
          {allSelected ? "全不选" : "全选已生成"}
        </button>
        <span className="dl-stat" role="status">
          已选 {selectedCount} / 已保存 {filled.length} 课
        </span>
        <button
          className="btn"
          type="button"
          onClick={() => {
            void download();
          }}
          disabled={zipping || selectedCount === 0}
        >
          {zipping ? "处理中…" : "下载选中的课文 (ZIP)"}
        </button>
        <button
          className="btn sec"
          type="button"
          onClick={() => {
            downloadHtml();
          }}
          disabled={zipping || selectedCount === 0}
        >
          下载 HTML 全文总览
        </button>
        <button
          className="btn sec"
          type="button"
          onClick={() => {
            downloadExcel();
          }}
          disabled={zipping || selectedCount === 0}
        >
          下载 Excel 汇总表
        </button>
      </div>
      <div className="dl-list" role="group" aria-label="已生成课次，可多选">
        {filled.map((n) => {
          const th = themeForLesson(n);
          const plt = planLessonTitleForLesson?.(n);
          return (
            <label key={n} className="dl-item">
              <input
                type="checkbox"
                checked={selected.has(n)}
                onChange={() => toggle(n)}
                disabled={zipping}
              />
              <span className="dl-item-txt">
                第 {n} 课
                {th ? <span className="dl-th"> · {th}</span> : null}
                {plt ? <span className="dl-th"> — {plt}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      </div>
    </details>
  );
}
