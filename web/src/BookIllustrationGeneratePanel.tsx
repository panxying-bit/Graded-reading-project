import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateLessonImage,
  getImageGenStatus,
  invalidateImageGenStatusCache,
  type ImageGenBackendStatus,
} from "./api/client";
import {
  collectIllustrationReferenceUrls,
  getDefaultIllustrationPageDirection,
  listBookPagesForIllustration,
  type IllustrationEmotionPresetId,
  type IllustrationPageDirection,
} from "./bookIllustration";
import {
  buildCompressedPageIllustrationPrompt,
  ILLUSTRATION_PROMPT_COMPRESSED_MAX_CHARS,
} from "./illustrationPromptCompress";
import { tryParseBookOutput } from "./parseBookOutput";
import {
  getLesson,
  mergeLessonBookIllustrations,
  mergeLessonIllustrationPageDirection,
} from "./lessonLibrary";
import {
  ILLUSTRATION_CAMERA_OPTIONS,
  ILLUSTRATION_EMOTION_PRESETS,
} from "./data/illustrationStoryboardPresets";
import {
  DEFAULT_ILLUSTRATION_LAYOUT_ID,
  DEFAULT_ILLUSTRATION_QUALITY_TIER,
  ILLUSTRATION_HIGH_PIXEL_LABEL,
  ILLUSTRATION_LAYOUT_OPTIONS,
} from "./data/illustrationOutputPresets";

function resolveGeneratedImageSrc(res: {
  imageUrl?: string;
  b64Json?: string;
}): string {
  const u = res.imageUrl?.trim();
  if (u) {
    return u;
  }
  const b64 = res.b64Json?.trim();
  if (b64) {
    return `data:image/jpeg;base64,${b64}`;
  }
  throw new Error("API 未返回 imageUrl 或 b64Json");
}

type StoryboardFieldsProps = {
  pageNumber: number;
  direction: IllustrationPageDirection;
  onPatch: (patch: Partial<IllustrationPageDirection>) => void;
  onSaveSnapshot: () => void;
  disabled: boolean;
};

function IllustrationPageStoryboardFields({
  pageNumber,
  direction,
  onPatch,
  onSaveSnapshot,
  disabled,
}: StoryboardFieldsProps) {
  const cam =
    direction.cameraAngle ?? ("wide_shot" as const);
  const presets = direction.emotionPresets ?? [];
  const toggleEmotion = (id: IllustrationEmotionPresetId) => {
    const set = new Set(presets);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    onPatch({ emotionPresets: [...set] });
  };
  return (
    <div className="illustration-gen-storyboard">
      <label className="illustration-gen-sb-label" htmlFor={`plot-scene-${pageNumber}`}>
        本页剧情与场景
      </label>
      <textarea
        id={`plot-scene-${pageNumber}`}
        className="illustration-gen-sb-ta"
        rows={3}
        disabled={disabled}
        value={direction.plotAndScene ?? ""}
        onChange={(e) => onPatch({ plotAndScene: e.target.value })}
        placeholder="只有填写的内容才会进入压缩 prompt 的 scene。课文 scene_note 不会自动并入——需要时请粘贴或改写到此。"
      />
      <p className="illustration-gen-sb-sub">镜头 Camera</p>
      <div className="illustration-gen-camera-row" role="group" aria-label="镜头">
        {ILLUSTRATION_CAMERA_OPTIONS.map((c) => {
          const selected = cam === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={
                "illustration-gen-camera-btn" +
                (selected ? " illustration-gen-camera-btn--on" : "")
              }
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onPatch({ cameraAngle: c.id })}
            >
              {c.zh}
              <span className="illustration-gen-camera-en"> {c.en}</span>
            </button>
          );
        })}
      </div>
      <p className="illustration-gen-sb-sub">表情 Character emotion</p>
      <div className="illustration-gen-emotion-row" role="group" aria-label="表情预设">
        {ILLUSTRATION_EMOTION_PRESETS.map((em) => {
          const on = presets.includes(em.id);
          return (
            <button
              key={em.id}
              type="button"
              className={
                "illustration-gen-emotion-chip" +
                (on ? " illustration-gen-emotion-chip--on" : "")
              }
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggleEmotion(em.id)}
            >
              {em.label}
            </button>
          );
        })}
      </div>
      <label className="illustration-gen-sb-label" htmlFor={`emotion-custom-${pageNumber}`}>
        自定义表情 / 神态补充（可选）
      </label>
      <input
        id={`emotion-custom-${pageNumber}`}
        type="text"
        className="illustration-gen-sb-input"
        disabled={disabled}
        value={direction.emotionCustom ?? ""}
        onChange={(e) => onPatch({ emotionCustom: e.target.value })}
        placeholder="例如：害羞地低头、握紧拳头、眼睛发亮…"
      />
      <button
        type="button"
        className="btn sec illustration-gen-sb-save"
        disabled={disabled}
        onClick={onSaveSnapshot}
      >
        保存本页分镜
      </button>
    </div>
  );
}

type Props = {
  levelId: string;
  lessonSlot: number;
  finalBookText: string;
  libVersion: number;
  onSaved: () => void;
  /** Push current in-memory page storyboard so Prep synthesis preview stays in sync. */
  onIllustrationPageDirectionsLive?: (
    dirs: Record<number, IllustrationPageDirection>,
  ) => void;
};

export function BookIllustrationGeneratePanel({
  levelId,
  lessonSlot,
  finalBookText,
  libVersion,
  onSaved,
  onIllustrationPageDirectionsLive,
}: Props) {
  const book = useMemo(
    () => tryParseBookOutput(finalBookText),
    [finalBookText],
  );
  const pages = useMemo(
    () => (book ? listBookPagesForIllustration(book) : []),
    [book],
  );
  const pageKey = useMemo(
    () => pages.map((p) => p.pageNumber).join(","),
    [pages],
  );

  const [apiStatus, setApiStatus] = useState<ImageGenBackendStatus | null>(
    null,
  );
  /** Default off: chaining sends previous page as ref (often huge base64) and can trigger Volc failures. */
  const [chainPrevRef, setChainPrevRef] = useState(false);
  const [busyPage, setBusyPage] = useState<number | null>(null);
  const [banner, setBanner] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [pageErr, setPageErr] = useState<Record<number, string>>({});
  const [localPageDirs, setLocalPageDirs] = useState<
    Record<number, IllustrationPageDirection>
  >({});

  const illustrations = useMemo(() => {
    const rec = getLesson(levelId, lessonSlot);
    return rec?.bookIllustrations ?? {};
  }, [levelId, lessonSlot, libVersion]);

  const lessonSaved = useMemo(
    () => Boolean(getLesson(levelId, lessonSlot)),
    [levelId, lessonSlot, libVersion],
  );

  useEffect(() => {
    let cancelled = false;
    invalidateImageGenStatusCache();
    void getImageGenStatus().then((s) => {
      if (!cancelled) {
        setApiStatus(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [levelId, lessonSlot]);

  useEffect(() => {
    const rec = getLesson(levelId, lessonSlot);
    const m = rec?.illustrationPageDirections ?? {};
    const next: Record<number, IllustrationPageDirection> = {};
    for (const p of pages) {
      next[p.pageNumber] = {
        ...getDefaultIllustrationPageDirection(),
        ...m[String(p.pageNumber)],
      };
    }
    setLocalPageDirs(next);
  }, [levelId, lessonSlot, pageKey]);

  /** Debounce: pushing live dirs to App on every keystroke re-renders the whole page and feels laggy. */
  useEffect(() => {
    if (!onIllustrationPageDirectionsLive) {
      return;
    }
    const t = window.setTimeout(() => {
      onIllustrationPageDirectionsLive(localPageDirs);
    }, 400);
    return () => window.clearTimeout(t);
  }, [localPageDirs, onIllustrationPageDirectionsLive]);

  const patchPageDir = useCallback(
    (pageNum: number, patch: Partial<IllustrationPageDirection>) => {
      setLocalPageDirs((prev) => ({
        ...prev,
        [pageNum]: {
          ...getDefaultIllustrationPageDirection(),
          ...(prev[pageNum] ?? {}),
          ...patch,
        },
      }));
    },
    [],
  );

  const styleBibleForPrompt = useMemo(() => {
    const rec = getLesson(levelId, lessonSlot);
    return rec?.illustrationStyleBible?.trim() ?? "";
  }, [levelId, lessonSlot, libVersion]);

  const styleShortTagForPrompt = useMemo(() => {
    const rec = getLesson(levelId, lessonSlot);
    const t = rec?.illustrationStyleShortTag?.trim();
    return t ? t : null;
  }, [levelId, lessonSlot, libVersion]);

  const illustrationGenParams = useMemo(() => {
    const rec = getLesson(levelId, lessonSlot);
    return {
      layoutPreset:
        rec?.illustrationLayoutId ?? DEFAULT_ILLUSTRATION_LAYOUT_ID,
      qualityTier:
        rec?.illustrationQualityTier ?? DEFAULT_ILLUSTRATION_QUALITY_TIER,
    };
  }, [levelId, lessonSlot, libVersion]);

  const illustrationSizeSummary = useMemo(() => {
    const { layoutPreset, qualityTier } = illustrationGenParams;
    const opt = ILLUSTRATION_LAYOUT_OPTIONS.find((o) => o.id === layoutPreset);
    const qZh = qualityTier === "high" ? "高清晰度" : "标准清晰度";
    const px =
      qualityTier === "high"
        ? ILLUSTRATION_HIGH_PIXEL_LABEL[layoutPreset]
        : opt?.standardPixels ?? "";
    return `${opt?.title ?? layoutPreset} · ${opt?.ratioLabel ?? ""} · ${qZh} · ${px}`;
  }, [illustrationGenParams]);

  const protagonistsForPrompt = useMemo(() => {
    const rec = getLesson(levelId, lessonSlot);
    return rec?.illustrationProtagonists ?? null;
  }, [levelId, lessonSlot, libVersion]);

  const chainUrlsForPage = useCallback(
    (pageNum: number): string[] | undefined => {
      if (!chainPrevRef) {
        return undefined;
      }
      const idx = pages.findIndex((p) => p.pageNumber === pageNum);
      if (idx <= 0) {
        return undefined;
      }
      const prevPn = pages[idx - 1].pageNumber;
      const url = illustrations[String(prevPn)];
      if (!url?.trim()) {
        return undefined;
      }
      return [url.trim()];
    },
    [chainPrevRef, pages, illustrations],
  );

  const referenceUrlsForPage = useCallback(
    (pageNum: number): string[] | undefined => {
      return collectIllustrationReferenceUrls({
        protagonists: protagonistsForPrompt,
        chainUrls: chainUrlsForPage(pageNum),
      });
    },
    [protagonistsForPrompt, chainUrlsForPage],
  );

  const generateOne = useCallback(
    async (pageNum: number) => {
      if (!book) {
        return;
      }
      const pageSrc = pages.find((p) => p.pageNumber === pageNum);
      if (!pageSrc) {
        return;
      }
      const wallStart = performance.now();
      setBusyPage(pageNum);
      setPageErr((e) => {
        const next = { ...e };
        delete next[pageNum];
        return next;
      });
      setBanner(null);
      try {
        if (!getLesson(levelId, lessonSlot)) {
          const msg =
            "本课尚未保存到书库：请先用上方「保存到第 … 课」保存课文，再生成插图。";
          setPageErr((e) => ({ ...e, [pageNum]: msg }));
          setBanner({ text: msg, error: true });
          return;
        }
        const tPrep0 = performance.now();
        const pageDir =
          localPageDirs[pageNum] ?? getDefaultIllustrationPageDirection();
        const prompt = buildCompressedPageIllustrationPrompt({
          styleBible: styleBibleForPrompt,
          styleShortTag: styleShortTagForPrompt,
          protagonists: protagonistsForPrompt,
          pageDirection: pageDir,
          page: pageSrc,
        });
        const refs = referenceUrlsForPage(pageNum);
        const promptPrepMs = performance.now() - tPrep0;
        const refLens = refs?.map((r) => r.length) ?? [];
        if (prompt.length > ILLUSTRATION_PROMPT_COMPRESSED_MAX_CHARS) {
          console.warn(
            `[illustration client] compressed prompt length ${prompt.length} > ${ILLUSTRATION_PROMPT_COMPRESSED_MAX_CHARS} — compressor bug; report.`,
          );
        }
        console.info(
          "[illustration client]",
          JSON.stringify({
            page: pageNum,
            promptLen: prompt.length,
            refCount: refLens.length,
            refCharCounts: refLens,
          }),
        );

        const tFetch0 = performance.now();
        const out = await generateLessonImage({
          prompt,
          layoutPreset: illustrationGenParams.layoutPreset,
          qualityTier: illustrationGenParams.qualityTier,
          ...(refs ? { referenceImageUrls: refs } : {}),
        });
        const fetchWallMs = performance.now() - tFetch0;

        const tPersist0 = performance.now();
        const src = resolveGeneratedImageSrc(out);
        const ok = mergeLessonBookIllustrations(levelId, lessonSlot, {
          [String(pageNum)]: src,
        });
        if (!ok) {
          throw new Error("无法写入本地存储，请确认本课已保存课文。");
        }
        void mergeLessonIllustrationPageDirection(
          levelId,
          lessonSlot,
          pageNum,
          pageDir,
        );
        const persistMs = performance.now() - tPersist0;

        const tPaint0 = performance.now();
        onSaved();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
        const paintMs = performance.now() - tPaint0;

        const totalMs = performance.now() - wallStart;
        const totalSec = totalMs / 1000;
        const st = out.timings;
        const logPayload = {
          page: pageNum,
          totalMs,
          totalSec: Math.round(totalSec * 1000) / 1000,
          client: {
            promptPrepMs,
            /** Browser → server → browser wall clock (Volc work runs inside this on the server). */
            fetchWallMs,
            /** mergeLessonBookIllustrations + resolve URL/base64 string (no remote download for http URL). */
            persistMs,
            /** After onSaved: two rAF frames as rough paint settle. */
            paintMs,
            clientOverheadMs:
              st && fetchWallMs >= st.serverTotalMs
                ? Math.round(fetchWallMs - st.serverTotalMs)
                : undefined,
          },
          server: st
            ? {
                provider: st.provider,
                serverTotalMs: st.serverTotalMs,
                volcSubmitMs: st.volcSubmitMs,
                volcPollHttpMs: st.volcPollHttpMs,
                volcPollSleepMs: st.volcPollSleepMs,
                volcPollAttempts: st.volcPollAttempts,
                getimgUpstreamMs: st.getimgUpstreamMs,
              }
            : null,
        };
        console.info("[illustration timing]", JSON.stringify(logPayload, null, 2));

        const isFirstBookPage = pages[0]?.pageNumber === pageNum;
        setBanner({
          text: isFirstBookPage
            ? `第 ${pageNum} 页已生成并保存。总耗时约 ${(Math.round(totalSec * 1000) / 1000).toFixed(2)} 秒（明细见浏览器控制台 [illustration timing]）。`
            : `第 ${pageNum} 页已生成并保存。`,
        });
      } catch (err) {
        setPageErr((e) => ({
          ...e,
          [pageNum]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setBusyPage(null);
      }
    },
    [
      book,
      pages,
      styleBibleForPrompt,
      styleShortTagForPrompt,
      illustrationGenParams,
      protagonistsForPrompt,
      localPageDirs,
      referenceUrlsForPage,
      levelId,
      lessonSlot,
      onSaved,
    ],
  );

  if (!book || pages.length === 0) {
    return null;
  }

  const disabled =
    apiStatus?.enabled !== true || busyPage !== null || !lessonSaved;

  return (
    <section
      className="illustration-gen prompt-panel"
      aria-label="绘本配图生图"
    >
      <div className="illustration-gen-inner prompt-panel-inner">
        <h2 className="illustration-gen-h2">绘本配图 · 第 2 步 · 逐页生图</h2>
        <p className="sp-block-lead">
          压缩 prompt <strong>只含你有填写或点选的内容</strong>：未填的风格短标签、画风正文若未匹配预设库则不带{" "}
          <code>style:</code>；未写主人公、未填「本页剧情与场景」、未选表情，则不带对应字段。
          课文里的 <code>scene_note</code> <strong>不会自动</strong>进 prompt——需要时请复制到下方「本页剧情与场景」。每页必有{" "}
          <code>camera:</code>（当前镜头）。宽高走接口参数；参考图另传。调用 <code>/api/images/generate</code>。
        </p>
        <p className="illustration-gen-muted illustration-gen-size-line">
          当前尺寸与清晰度（在「准备」第 1 步保存）：<strong>{illustrationSizeSummary}</strong>
        </p>

        {book && !lessonSaved ? (
          <p className="err" role="alert">
            课文已在屏幕上，但<strong>尚未保存到当前课</strong>，插图无法写入本地。
            请先点击上方「保存到第 … 课」，再点各页「生成」。
          </p>
        ) : null}

        {apiStatus && !apiStatus.enabled ? (
          <p className="err" role="alert">
            生图 API 未配置：请在 <code>server/.env</code>{" "}
            <strong>任选一种</strong>——火山即梦：
            <code>VOLC_ACCESS_KEY</code> 与 <code>VOLC_SECRET_KEY</code>
            （可选 <code>VOLC_VISUAL_REQ_KEY</code>）；或兼容接口（如 getimg）：
            <code>IMAGE_API_BASE_URL</code>（无末尾斜杠）与{" "}
            <code>IMAGE_API_KEY</code>。配置后请<strong>重启后端</strong>并<strong>刷新本页</strong>（或切换课次）以重新检测。
          </p>
        ) : null}

        {apiStatus?.enabled && apiStatus.provider === "volc" ? (
          <p className="illustration-gen-muted">
            当前生图后端：<strong>火山即梦</strong>（Visual 异步，
            <code>req_key</code> 见环境变量）。
          </p>
        ) : null}

        {apiStatus?.enabled && apiStatus.debugMinimalPromptActive ? (
          <p className="err" role="status">
            <strong>调试模式</strong>：服务端已设置{" "}
            <code>ILLUSTRATION_DEBUG_MINIMAL_PROMPT</code>
            ，每次生图将<strong>忽略</strong>前端拼好的 prompt 与<strong>所有参考图</strong>，只发送环境变量里的最短文案（用于逐级排查）。排查结束后请从{" "}
            <code>server/.env</code>{" "}
            <strong>删除该行并重启后端</strong>。
          </p>
        ) : null}

        {apiStatus?.enabled && apiStatus.provider === "getimg" ? (
          <p className="illustration-gen-muted">
            当前生图后端：<strong>兼容接口</strong>（如 getimg / SeeDream，
            <code>IMAGE_API_*</code>）。
          </p>
        ) : null}

        {apiStatus === null ? (
          <p className="illustration-gen-muted">正在检查生图服务…</p>
        ) : null}

        {banner ? (
          <p
            className={
              banner.error ? "err" : "illustration-prep-hint"
            }
            role="status"
            aria-live="polite"
          >
            {banner.text}
          </p>
        ) : null}

        <div className="illustration-gen-toolbar">
          <label className="illustration-gen-check">
            <input
              type="checkbox"
              checked={chainPrevRef}
              onChange={(e) => setChainPrevRef(e.target.checked)}
              disabled={busyPage !== null}
            />
            链式参考（上一页成图作参考；默认关闭——大图 base64 易增大请求、触发即梦报错；需要一致性时再勾选）
          </label>
        </div>

        <div className="illustration-gen-grid" role="list">
          {pages.map((p) => {
            const url = illustrations[String(p.pageNumber)];
            const err = pageErr[p.pageNumber];
            const rowBusy = busyPage === p.pageNumber;
            return (
              <div
                key={p.pageNumber}
                className="illustration-gen-card"
                role="listitem"
              >
                <div className="illustration-gen-card-head">
                  <span className="illustration-gen-page-label">
                    第 {p.pageNumber} 页
                  </span>
                  <button
                    type="button"
                    className="btn sec illustration-gen-card-btn"
                    onClick={() => void generateOne(p.pageNumber)}
                    disabled={disabled || rowBusy}
                  >
                    {url ? "重生成" : "生成"}
                  </button>
                </div>
                <IllustrationPageStoryboardFields
                  pageNumber={p.pageNumber}
                  direction={
                    localPageDirs[p.pageNumber] ??
                    getDefaultIllustrationPageDirection()
                  }
                  onPatch={(patch) => patchPageDir(p.pageNumber, patch)}
                  onSaveSnapshot={() => {
                    const d =
                      localPageDirs[p.pageNumber] ??
                      getDefaultIllustrationPageDirection();
                    if (
                      mergeLessonIllustrationPageDirection(
                        levelId,
                        lessonSlot,
                        p.pageNumber,
                        d,
                      )
                    ) {
                      onSaved();
                    }
                  }}
                  disabled={disabled || rowBusy}
                />
                <div className="illustration-gen-thumb-wrap">
                  {url ? (
                    <img
                      className="illustration-gen-thumb"
                      src={url}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="illustration-gen-thumb-ph" aria-hidden>
                      暂无插图
                    </div>
                  )}
                </div>
                {err ? (
                  <p className="illustration-gen-page-err" role="alert">
                    {err}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
