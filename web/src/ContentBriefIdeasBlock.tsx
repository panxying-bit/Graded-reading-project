import { useCallback, useState } from "react";
import { fetchContentBriefIdeas } from "./api/client";

export type ContentBriefIdeasContext = {
  level: string;
  topic: string;
  /** Saved lesson title (绘本) or课纲课文标题 when non-book has outline. */
  lessonTitle: string;
  lesson: number;
  fictionOrNonfiction: "fiction" | "nonfiction";
  structureType: string;
  genreFocus: string;
  tenseFocus: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  context: ContentBriefIdeasContext;
};

/**
 * Text content brief textarea + optional AI-generated outline ideas (pick & fill).
 */
export function ContentBriefIdeasBlock({
  value,
  onChange,
  disabled = false,
  context,
}: Props) {
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((i: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }, []);

  const runGenerate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const lvl = context.level;
      if (
        lvl !== "level1" &&
        lvl !== "level2" &&
        lvl !== "level3" &&
        lvl !== "level4"
      ) {
        setError("请先选择阅读级别。");
        setIdeas(null);
        return;
      }
      const r = await fetchContentBriefIdeas({
        level: lvl,
        topic: context.topic.trim() || undefined,
        lessonTitle: context.lessonTitle.trim() || undefined,
        lesson: context.lesson,
        fictionOrNonfiction: context.fictionOrNonfiction,
        structureType: context.structureType.trim() || undefined,
        genreFocus: context.genreFocus.trim() || undefined,
        tenseFocus: context.tenseFocus.trim() || undefined,
      });
      setIdeas(r.ideas);
      setPicked(new Set());
    } catch (e) {
      setIdeas(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const applyPicked = useCallback(() => {
    if (!ideas?.length || picked.size === 0) {
      return;
    }
    const block = [...picked]
      .sort((a, b) => a - b)
      .map((i) => ideas[i])
      .filter(Boolean)
      .join("\n\n");
    const prev = value.trim();
    onChange(prev ? `${prev}\n\n${block}` : block);
    setPicked(new Set());
  }, [ideas, picked, value, onChange]);

  const closeIdeas = useCallback(() => {
    setIdeas(null);
    setPicked(new Set());
    setError(null);
  }, []);

  return (
    <div className="cbf-wrap">
      <label className="row">
        <span>文本内容构思（选填）</span>
        <textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="用几句话说明本篇大致写什么、关键情节或知识点；可不填。填写后会一并传给生成模型作参考。"
          rows={3}
          autoComplete="off"
          spellCheck={true}
          disabled={disabled}
        />
      </label>
      <div className="cbf-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            void runGenerate();
          }}
          disabled={disabled || loading}
        >
          {loading ? "构思生成中…" : "AI 生成构思选项"}
        </button>
        <span className="cbf-actions-hint">
          根据当前级别、主题、标题与体裁生成多条中文构思，可勾选填入，仍可自行改写。
        </span>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {ideas && ideas.length > 0 ? (
        <div className="cbf-panel">
          <p className="cbf-panel-lead">
            勾选一项或多项，点击「填入构思框」合并到上方文本（已填写内容会追加在后）。
          </p>
          <ul className="cbf-list">
            {ideas.map((idea, i) => (
              <li key={i}>
                <label className="cbf-item">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={() => {
                      toggle(i);
                    }}
                  />
                  <span>{idea}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="cbf-panel-actions">
            <button
              type="button"
              className="btn"
              onClick={applyPicked}
              disabled={picked.size === 0}
            >
              将所选填入构思框
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeIdeas}>
              关闭选项
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
