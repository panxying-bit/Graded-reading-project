import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ILLUSTRATION_STYLE_BIBLE,
  getDefaultIllustrationPageDirection,
  listBookPagesForIllustration,
  type IllustrationPageDirection,
  type IllustrationProtagonistsState,
} from "./bookIllustration";
import { buildCompressedPageIllustrationPrompt } from "./illustrationPromptCompress";
import {
  matchStylePresetId,
  STYLE_BIBLE_PRESETS,
  type StyleBiblePresetId,
} from "./data/styleBiblePresets";
import {
  DEFAULT_ILLUSTRATION_LAYOUT_ID,
  DEFAULT_ILLUSTRATION_QUALITY_TIER,
  ILLUSTRATION_LAYOUT_OPTIONS,
  type IllustrationLayoutId,
  type IllustrationQualityTier,
} from "./data/illustrationOutputPresets";
import { tryParseBookOutput } from "./parseBookOutput";
import {
  getLesson,
  saveLesson,
} from "./lessonLibrary";

/** Ignore whitespace / key-order drift between saved JSON and on-screen 定稿. */
function bookJsonCanonicallyEqual(a: string, b: string): boolean {
  if (a.trim() === b.trim()) {
    return true;
  }
  const ba = tryParseBookOutput(a);
  const bb = tryParseBookOutput(b);
  if (ba && bb) {
    return JSON.stringify(ba) === JSON.stringify(bb);
  }
  return false;
}

const MAX_PROTAGONIST_REF_BYTES = 8 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const v = r.result;
      if (typeof v === "string") {
        resolve(v);
      } else {
        reject(new Error("Unexpected read result"));
      }
    };
    r.onerror = () => reject(new Error("FileReader failed"));
    r.readAsDataURL(file);
  });
}

function serializeProtagonistsForSave(
  p1Desc: string,
  p1Img: string | null,
  p2Desc: string,
  p2Img: string | null,
): IllustrationProtagonistsState | null {
  const trimSlot = (
    desc: string,
    img: string | null,
  ): { description?: string; referenceImageDataUrl?: string } | undefined => {
    const d = desc.trim();
    const i = img?.trim();
    if (!d && !i) {
      return undefined;
    }
    const o: { description?: string; referenceImageDataUrl?: string } = {};
    if (d) {
      o.description = d;
    }
    if (i) {
      o.referenceImageDataUrl = i;
    }
    return o;
  };
  const s1 = trimSlot(p1Desc, p1Img);
  const s2 = trimSlot(p2Desc, p2Img);
  const out: IllustrationProtagonistsState = {};
  if (s1) {
    out.slot1 = s1;
  }
  if (s2) {
    out.slot2 = s2;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type ProtagonistSlotFormProps = {
  title: string;
  description: string;
  onDescriptionChange: (v: string) => void;
  imageDataUrl: string | null;
  onImageChange: (v: string | null) => void;
  fileInputId: string;
  onFileError: (message: string) => void;
};

function ProtagonistSlotForm({
  title,
  description,
  onDescriptionChange,
  imageDataUrl,
  onImageChange,
  fileInputId,
  onFileError,
}: ProtagonistSlotFormProps) {
  return (
    <div className="illustration-protagonist-card">
      <h5 className="illustration-protagonist-card-h">{title}</h5>
      <label className="illustration-prep-label" htmlFor={`${fileInputId}-ta`}>
        外貌与设定（可选，中英皆可）
      </label>
      <textarea
        id={`${fileInputId}-ta`}
        className="illustration-prep-ta illustration-protagonist-ta"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={4}
        spellCheck={true}
        placeholder="例如：姓名/昵称、性别、年龄、发型发色、是否戴眼镜、常穿衣物；或「整体气质参考某动画角色」等（勿写侵权临摹指令，仅作外形气质参考）。"
      />
      <div className="illustration-protagonist-upload-row">
        <input
          id={fileInputId}
          type="file"
          accept="image/*"
          className="illustration-file-input-hidden"
          onChange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            input.value = "";
            if (!file) {
              return;
            }
            void (async () => {
              if (!file.type.startsWith("image/")) {
                onFileError("请选择图片文件（image/*）。");
                return;
              }
              if (file.size > MAX_PROTAGONIST_REF_BYTES) {
                onFileError("参考图请勿超过 8MB。");
                return;
              }
              try {
                onImageChange(await readFileAsDataUrl(file));
              } catch {
                onFileError("读取图片失败，请重试。");
              }
            })();
          }}
        />
        <label htmlFor={fileInputId} className="btn sec illustration-protagonist-file-label">
          上传参考图
        </label>
        {imageDataUrl ? (
          <>
            <img
              className="illustration-protagonist-thumb"
              src={imageDataUrl}
              alt=""
            />
            <button
              type="button"
              className="btn sec"
              onClick={() => onImageChange(null)}
            >
              清除参考图
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  levelId: string;
  lessonSlot: number;
  /** Current finalized book JSON shown in 定稿 (must match lesson save for Step 0). */
  finalBookText: string;
  libVersion: number;
  onSaved: () => void;
  /**
   * Live per-page storyboard from Generate (unsaved edits). When set for a page, wins over
   * `illustrationPageDirections` on disk for synthesis preview only.
   */
  illustrationPageDirectionsLive?: Record<number, IllustrationPageDirection>;
};

export function BookIllustrationPrepPanel({
  levelId,
  lessonSlot,
  finalBookText,
  libVersion,
  onSaved,
  illustrationPageDirectionsLive,
}: Props) {
  const book = useMemo(
    () => tryParseBookOutput(finalBookText),
    [finalBookText],
  );
  const pages = useMemo(
    () => (book ? listBookPagesForIllustration(book) : []),
    [book],
  );

  const [styleBible, setStyleBible] = useState("");
  /** Optional single line sent as `style:` only (overrides bible digest). */
  const [styleShortTag, setStyleShortTag] = useState("");
  /** Which built-in preset is active, or custom / empty. */
  const [stylePresetKey, setStylePresetKey] = useState<
    StyleBiblePresetId | "custom" | null
  >(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [previewPageIdx, setPreviewPageIdx] = useState(0);
  const [layoutId, setLayoutId] = useState<IllustrationLayoutId>(
    DEFAULT_ILLUSTRATION_LAYOUT_ID,
  );
  const [qualityTier, setQualityTier] = useState<IllustrationQualityTier>(
    DEFAULT_ILLUSTRATION_QUALITY_TIER,
  );
  const [p1Desc, setP1Desc] = useState("");
  const [p1Img, setP1Img] = useState<string | null>(null);
  const [p2Desc, setP2Desc] = useState("");
  const [p2Img, setP2Img] = useState<string | null>(null);
  const [globalStoryScene, setGlobalStoryScene] = useState("");

  /** Reload style bible when lesson slot / storage bumps; do NOT clear saveHint here — clearing on libVersion made success/error messages disappear immediately after save. */
  useEffect(() => {
    const rec = getLesson(levelId, lessonSlot);
    const raw = rec?.illustrationStyleBible ?? "";
    const trimmed = raw.trim();
    setStyleBible(raw);
    const byText = matchStylePresetId(trimmed);
    setStylePresetKey(
      byText ?? (trimmed.length > 0 ? "custom" : null),
    );
    setLayoutId(rec?.illustrationLayoutId ?? DEFAULT_ILLUSTRATION_LAYOUT_ID);
    setQualityTier(
      rec?.illustrationQualityTier ?? DEFAULT_ILLUSTRATION_QUALITY_TIER,
    );
    setP1Desc(rec?.illustrationProtagonists?.slot1?.description ?? "");
    setP1Img(rec?.illustrationProtagonists?.slot1?.referenceImageDataUrl ?? null);
    setP2Desc(rec?.illustrationProtagonists?.slot2?.description ?? "");
    setP2Img(rec?.illustrationProtagonists?.slot2?.referenceImageDataUrl ?? null);
    setGlobalStoryScene(rec?.illustrationGlobalStoryScene ?? "");
    setStyleShortTag(rec?.illustrationStyleShortTag ?? "");
  }, [levelId, lessonSlot, libVersion]);

  useEffect(() => {
    setSaveHint(null);
  }, [levelId, lessonSlot]);

  useEffect(() => {
    setPreviewPageIdx(0);
  }, [finalBookText, pages.length]);

  const previewPage = pages[previewPageIdx] ?? pages[0];
  const protagonistsPreview = useMemo(
    () => serializeProtagonistsForSave(p1Desc, p1Img, p2Desc, p2Img),
    [p1Desc, p1Img, p2Desc, p2Img],
  );
  const previewPageDirection = useMemo(() => {
    if (!previewPage) {
      return getDefaultIllustrationPageDirection();
    }
    const pn = previewPage.pageNumber;
    const live = illustrationPageDirectionsLive?.[pn];
    if (live != null) {
      return {
        ...getDefaultIllustrationPageDirection(),
        ...live,
      };
    }
    const rec = getLesson(levelId, lessonSlot);
    const k = String(pn);
    return {
      ...getDefaultIllustrationPageDirection(),
      ...(rec?.illustrationPageDirections?.[k] ?? {}),
    };
  }, [
    levelId,
    lessonSlot,
    libVersion,
    previewPage?.pageNumber,
    illustrationPageDirectionsLive,
  ]);
  const previewPrompt =
    book && previewPage
      ? buildCompressedPageIllustrationPrompt({
          styleBible,
          styleShortTag: styleShortTag.trim() || null,
          protagonists: protagonistsPreview,
          pageDirection: previewPageDirection,
          page: previewPage,
        })
      : "";

  const persistStyleBible = useCallback(() => {
    const rec = getLesson(levelId, lessonSlot);
    if (!rec) {
      setSaveHint("本课尚无本地保存记录；请先在上方保存课文后再配置画风、尺寸与主人公。");
      return;
    }
    const storedExport = rec.text?.trim() ?? "";
    const screenTrim = finalBookText.trim();
    const textsMatch =
      !storedExport ||
      !screenTrim ||
      bookJsonCanonicallyEqual(storedExport, screenTrim);
    if (!textsMatch) {
      setSaveHint(
        "当前定稿与本地保存的正文不一致。请先点「确认保存」同步课文，再保存配图准备项，避免配图与错误版本绑定。",
      );
      return;
    }
    const trimmed = styleBible.trim();
    const matchedPreset = matchStylePresetId(trimmed);
    const proto = serializeProtagonistsForSave(p1Desc, p1Img, p2Desc, p2Img);
    const ok = saveLesson(levelId, lessonSlot, {
      text: rec.text,
      wordCount: rec.wordCount,
      topic: rec.topic,
      lessonTitle: rec.lessonTitle,
      contentBrief: rec.contentBrief,
      fictionOrNonfiction: rec.fictionOrNonfiction,
      structureType: rec.structureType,
      tenseFocus: rec.tenseFocus,
      genreFocus: rec.genreFocus,
      illustrationStyleBible: trimmed,
      illustrationStyleShortTag: styleShortTag.trim()
        ? styleShortTag.trim()
        : null,
      illustrationStylePresetId: matchedPreset ?? null,
      illustrationLayoutId: layoutId,
      illustrationQualityTier: qualityTier,
      illustrationProtagonists: proto,
      illustrationGlobalStoryScene: globalStoryScene.trim() || null,
    });
    if (ok) {
      setSaveHint("已保存到本课（本地）。");
      onSaved();
    } else {
      setSaveHint("保存失败（如存储已满）。请检查浏览器是否允许本站写入本地存储。");
    }
  }, [
    levelId,
    lessonSlot,
    finalBookText,
    styleBible,
    styleShortTag,
    layoutId,
    qualityTier,
    p1Desc,
    p1Img,
    p2Desc,
    p2Img,
    globalStoryScene,
    onSaved,
  ]);

  if (!book || pages.length === 0) {
    return null;
  }

  return (
    <section
      className="illustration-prep prompt-panel"
      aria-label="绘本配图准备"
    >
      <div className="illustration-prep-inner prompt-panel-inner">
        <h2 className="illustration-prep-h2">绘本配图 · 准备（第 0–1 步）</h2>
        <div className="illustration-prep-step">
          <h3 className="illustration-prep-h3">第 0 步 · 正文来源</h3>
          <p className="sp-block-lead">
            配图仅以当前<strong>已定稿</strong>的 JSON 绘本为准（共{" "}
            <strong>{pages.length}</strong> 页）。请先完成语言校核或编辑定稿并
            <strong>确认保存到本课</strong>；若上方正文正在编辑，请先保存后再配置画风。
          </p>
        </div>
        <div className="illustration-prep-step">
          <h3 className="illustration-prep-h3">第 1 步 · 配图设定（存档 vs 发包）</h3>
          <p className="sp-block-lead">
            参数分两类：<strong>存在本课本地</strong>供备课与复用；<strong>每次点击「生成」</strong>只会向即梦发送一小段压缩英文 +
            接口参数 +（可选）参考图。长篇画风、全书剧情<strong>默认不整段</strong>塞进模型；连贯靠参考图与本页分镜。
          </p>
          <ul className="illustration-prep-param-table" aria-label="参数去向说明">
            <li>
              <strong>存库 + 发包（仅非空）</strong>：风格短标签或匹配预设的画风、主人公摘要与参考图、分镜里<strong>手写的</strong>剧情场景与镜头 /
              表情、课文当页 <code>text</code>（作 anchor）。课文 <code>scene_note</code> 不会自动进压缩 prompt。
            </li>
            <li>
              <strong>仅存库（不发全文）</strong>：长篇 Style Bible、全书剧情概述。
            </li>
            <li>
              <strong>存库 + 接口参数（不写进英文 prompt）</strong>：画面比例与清晰度 → 服务端转成宽高像素。
            </li>
          </ul>

          <div className="illustration-prep-band illustration-prep-band--model">
            <h4 className="illustration-prep-h4">① 每次发包会使用（尽量精简）</h4>
            <p className="sp-block-lead illustration-prep-sublead">
              下列内容决定<strong>本次调用即梦</strong>的风格摘要入口与出图尺寸。若未填短标签，且长篇画风与<strong>画风库卡片全文一致</strong>，则{" "}
              <code>style:</code> 会自动用对应短语（如 <code>cute cartoon</code>、<code>clay toy</code>
              ）；否则会退回摘第一句。也可在下方输入框<strong>强制</strong>指定短语。
            </p>
            <label className="illustration-prep-label" htmlFor="style-short-tag-input">
              风格短标签（发给即梦的 <code>style:</code>，可选）
            </label>
            <input
              id="style-short-tag-input"
              type="text"
              className="illustration-prep-short-tag"
              value={styleShortTag}
              onChange={(e) => {
                setStyleShortTag(e.target.value);
                setSaveHint(null);
              }}
              placeholder="例：soft watercolor, cute kids book — 填写则只用这一行作为 style"
              spellCheck={false}
              lang="en"
            />
            <h4 className="illustration-prep-h4 illustration-prep-h4--minor">
              尺寸与清晰度（Volc 使用 width/height，不写进 prompt 正文）
            </h4>
            <p className="sp-block-lead illustration-prep-sublead">
              默认<strong>标准清晰度</strong>即可；高清晰度像素更大，耗时与计费通常更高。
            </p>
            <div
              className="illustration-quality-row"
              role="radiogroup"
              aria-label="清晰度"
            >
              <button
                type="button"
                className={
                  "illustration-quality-btn" +
                  (qualityTier === "standard"
                    ? " illustration-quality-btn--selected"
                    : "")
                }
                aria-pressed={qualityTier === "standard"}
                onClick={() => {
                  setQualityTier("standard");
                  setSaveHint(null);
                }}
              >
                标准清晰度（推荐）
              </button>
              <button
                type="button"
                className={
                  "illustration-quality-btn" +
                  (qualityTier === "high"
                    ? " illustration-quality-btn--selected"
                    : "")
                }
                aria-pressed={qualityTier === "high"}
                onClick={() => {
                  setQualityTier("high");
                  setSaveHint(null);
                }}
              >
                高清晰度（少用）
              </button>
            </div>
            <p className="illustration-prep-preset-intro">画面比例（标准清晰度下的像素）</p>
            <div
              className="illustration-layout-row"
              role="group"
              aria-label="画面比例"
            >
              {ILLUSTRATION_LAYOUT_OPTIONS.map((opt) => {
                const selected = layoutId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={
                      "illustration-layout-btn" +
                      (selected ? " illustration-layout-btn--selected" : "")
                    }
                    aria-pressed={selected}
                    onClick={() => {
                      setLayoutId(opt.id);
                      setSaveHint(null);
                    }}
                  >
                    <span className="illustration-layout-btn-title">{opt.title}</span>
                    <span className="illustration-layout-btn-meta">
                      {opt.ratioLabel} · 标准 {opt.standardPixels}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="illustration-prep-band illustration-prep-band--archive">
            <h4 className="illustration-prep-h4">② 仅保存在本课（长篇备课 · 默认不整段发往即梦）</h4>
            <p className="sp-block-lead illustration-prep-sublead">
              画风预设与下方长文用于你备课与团队对齐；生成时只会<strong>压缩一句</strong>进模型（除非上面已填风格短标签）。全书剧情栏<strong>从不</strong>进入当前压缩 prompt。
            </p>
            <p className="illustration-prep-preset-intro">画风库（点击填入长篇 Style Bible）</p>
            <div
              className="illustration-preset-grid"
              role="group"
              aria-label="画风预设库"
            >
              {STYLE_BIBLE_PRESETS.map((p) => {
                const selected = stylePresetKey === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      "illustration-preset-card" +
                      (selected ? " illustration-preset-card--selected" : "")
                    }
                    aria-pressed={selected}
                    onClick={() => {
                      setStyleBible(p.prompt);
                      setStylePresetKey(p.id);
                      setSaveHint(null);
                    }}
                  >
                    <span className="illustration-preset-card-title">
                      {p.titleEn}
                      <span className="illustration-preset-card-zh">
                        （{p.titleZh}）
                      </span>
                    </span>
                    <span className="illustration-preset-card-audience">
                      适合：{p.audienceZh}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="illustration-prep-label" htmlFor="style-bible-ta">
              长篇画风说明 Style Bible（可编辑）
            </label>
            <textarea
              id="style-bible-ta"
              className="illustration-prep-ta"
              value={styleBible}
              onChange={(e) => {
                const v = e.target.value;
                setStyleBible(v);
                const t = v.trim();
                const m = matchStylePresetId(t);
                setStylePresetKey(m ?? (t.length > 0 ? "custom" : null));
                setSaveHint(null);
              }}
              rows={10}
              spellCheck={true}
              lang="en"
              placeholder={DEFAULT_ILLUSTRATION_STYLE_BIBLE}
            />
            <h4 className="illustration-prep-h4 illustration-prep-h4--minor">
              全书剧情与场景 Overall scene（可选 · 不发往即梦正文）
            </h4>
            <p className="sp-block-lead illustration-prep-sublead">
              仅供你把握故事走向与重复场景；跨页连贯请用<strong>主人公参考图</strong>、必要时「链上一页」与<strong>逐页分镜</strong>里的本页场景。
            </p>
            <label className="illustration-prep-label" htmlFor="global-story-scene-ta">
              全故事剧情 / 场景描述
            </label>
            <textarea
              id="global-story-scene-ta"
              className="illustration-prep-ta"
              value={globalStoryScene}
              onChange={(e) => {
                setGlobalStoryScene(e.target.value);
                setSaveHint(null);
              }}
              rows={5}
              spellCheck={true}
              placeholder="例如：故事从主人公害怕上学开始……（仅存档，不进入当前压缩 prompt）"
            />
          </div>

          <div className="illustration-prep-band illustration-prep-band--cast">
            <h4 className="illustration-prep-h4">③ 主人公 Character（存档；发包时传摘要 + 参考图）</h4>
            <p className="sp-block-lead illustration-prep-sublead">
              文字会压缩进 <code>character:</code>；参考图作为 <code>image_urls</code> 传入（排在「链上一页」参考之前，合计最多 10 张）。仅图无文字时不会发参考图（与原有规则一致）。
            </p>
            <div className="illustration-protagonist-grid">
              <ProtagonistSlotForm
                title="主人公一"
                description={p1Desc}
                onDescriptionChange={(v) => {
                  setP1Desc(v);
                  setSaveHint(null);
                }}
                imageDataUrl={p1Img}
                onImageChange={(v) => {
                  setP1Img(v);
                  setSaveHint(null);
                }}
                fileInputId="protagonist-1-file"
                onFileError={(msg) => setSaveHint(msg)}
              />
              <ProtagonistSlotForm
                title="主人公二"
                description={p2Desc}
                onDescriptionChange={(v) => {
                  setP2Desc(v);
                  setSaveHint(null);
                }}
                imageDataUrl={p2Img}
                onImageChange={(v) => {
                  setP2Img(v);
                  setSaveHint(null);
                }}
                fileInputId="protagonist-2-file"
                onFileError={(msg) => setSaveHint(msg)}
              />
            </div>
          </div>

          <div className="illustration-prep-actions">
            <button type="button" className="btn" onClick={persistStyleBible}>
              保存本课配图设定（存档字段 + 发包摘要）
            </button>
            <button
              type="button"
              className="btn sec"
              onClick={() => {
                setStyleBible(DEFAULT_ILLUSTRATION_STYLE_BIBLE);
                setStylePresetKey(STYLE_BIBLE_PRESETS[0].id);
                setSaveHint(null);
              }}
            >
              重置为 Cute Cartoon 默认
            </button>
          </div>
          {saveHint ? (
            <p
              className="illustration-prep-hint"
              role="status"
              aria-live="polite"
            >
              {saveHint}
            </p>
          ) : null}
        </div>
        <div className="illustration-prep-step">
          <h3 className="illustration-prep-h3">合成预览（仅拼 prompt，尚未生图）</h3>
          <p className="sp-block-lead">
            下方为<strong>实际发往即梦的压缩英文</strong>（总长约 500 字以内）：只含<strong>有填写或点选</strong>的字段。
            <code>scene</code> 仅来自逐页里的「本页剧情与场景」；<code>scene_note</code> 不会自动并入。
            <code>camera</code> 每页一行；其余标签与上文一致。此为只读预览——修改分镜或准备区后请<strong>保存</strong>。
          </p>
          {pages.length > 1 ? (
            <div className="illustration-prep-preview-row">
              <label htmlFor="ill-prev-page">预览页</label>
              <select
                id="ill-prev-page"
                value={previewPageIdx}
                onChange={(e) =>
                  setPreviewPageIdx(Number(e.target.value))
                }
              >
                {pages.map((p, i) => (
                  <option key={p.pageNumber} value={i}>
                    第 {p.pageNumber} 页
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <textarea
            className="illustration-prep-preview-ta"
            readOnly
            value={previewPrompt}
            rows={14}
            spellCheck={false}
            aria-label="单页配图 prompt 预览"
          />
        </div>
      </div>
    </section>
  );
}
