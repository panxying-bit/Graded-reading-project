import { countGeneratedInLevel, getLessonWordCount } from "./lessonLibrary";

type Props = {
  levelId: string;
  /** From GET /api/levels (e.g. 144). */
  lessonsPerLevel: number;
  currentLesson: number;
  onSelectLesson: (n: number) => void;
  /** Bump when localStorage changes to refresh counts. */
  version: number;
  /** When the level has a lesson curriculum JSON, show the theme for this slot. */
  curriculumTheme?: string | null;
  /** Outline lesson title for this slot (e.g. level3). */
  curriculumLessonTitle?: string | null;
};

export function LessonPanel({
  levelId,
  lessonsPerLevel,
  currentLesson,
  onSelectLesson,
  version,
  curriculumTheme,
  curriculumLessonTitle,
}: Props) {
  const total = Math.max(1, Math.min(1000, lessonsPerLevel));
  const done = countGeneratedInLevel(levelId, total);

  function clampLesson(n: number): number {
    if (!Number.isFinite(n)) {
      return 1;
    }
    return Math.max(1, Math.min(total, Math.floor(n)));
  }

  const items = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <section
      className="lesson-panel"
      aria-labelledby="lesson-panel-title"
      data-lib-version={version}
    >
      <h2 id="lesson-panel-title" className="lesson-panel-title">
        课文进度
        <span className="lesson-panel-stat" title="本级别已保存的生成篇数">
          已保存 {done}/{total} 课
        </span>
      </h2>
      <p className="lesson-panel-hint">
        每课对应一个 lesson 槽位；生成结果会保存到「当前第几课」。点击格子可切换、查看或覆盖该课内容。
      </p>
      {curriculumTheme || curriculumLessonTitle ? (
        <p className="lesson-panel-curriculum" role="status">
          {curriculumTheme ? (
            <>
              本课课纲主题：<strong>{curriculumTheme}</strong>
            </>
          ) : null}
          {curriculumTheme && curriculumLessonTitle ? " · " : null}
          {curriculumLessonTitle ? (
            <>
              Lesson title：<strong>{curriculumLessonTitle}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="lesson-nav">
        <button
          type="button"
          className="btn sec lesson-step"
          onClick={() => onSelectLesson(clampLesson(currentLesson - 1))}
          disabled={currentLesson <= 1}
        >
          上一课
        </button>
        <label className="lesson-pick">
          当前
          <input
            type="number"
            min={1}
            max={total}
            value={currentLesson}
            onChange={(e) => onSelectLesson(clampLesson(Number(e.target.value)))}
            aria-label="当前课文序号"
          />
          <span className="lesson-pick-suffix">/ {total}</span>
        </label>
        <button
          type="button"
          className="btn sec lesson-step"
          onClick={() => onSelectLesson(clampLesson(currentLesson + 1))}
          disabled={currentLesson >= total}
        >
          下一课
        </button>
      </div>

      <div className="lesson-grid-wrap" role="grid" aria-label="各课保存状态：灰格未保存，绿格已保存，描边为当前课">
        <ol className="lesson-grid" style={{ ["--cols" as string]: "12" }}>
          {items.map((n) => {
            const isCurrent = n === currentLesson;
            const wc = getLessonWordCount(levelId, n);
            const isFilled = wc != null;
            const title = isFilled
              ? `第${n}课 已保存 · ${wc} 词${isCurrent ? " · 当前" : ""}`
              : isCurrent
                ? `第${n}课 未保存（当前）`
                : `第${n}课 未保存`;
            return (
              <li key={n}>
                <button
                  type="button"
                  role="gridcell"
                  className={`lesson-cell${isFilled ? " filled" : ""}${isCurrent ? " current" : ""}`}
                  title={title}
                  onClick={() => onSelectLesson(n)}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={title}
                >
                  {n}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
