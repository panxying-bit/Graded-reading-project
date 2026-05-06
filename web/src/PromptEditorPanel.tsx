import { useEffect, useState } from "react";
import {
  clearPromptSettings,
  fetchPromptSettings,
  savePromptSettings,
  type ReferencePhaseBand,
} from "./api/client";

type Props = {
  levelIds: string[];
};

const emptyBand = (): ReferencePhaseBand => ({ fiction: "", nonfiction: "" });

export function PromptEditorPanel({ levelIds }: Props) {
  const [levelId, setLevelId] = useState("level3");
  const [system, setSystem] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [early, setEarly] = useState<ReferencePhaseBand>(emptyBand);
  const [mid, setMid] = useState<ReferencePhaseBand>(emptyBand);
  const [late, setLate] = useState<ReferencePhaseBand>(emptyBand);
  const [hasOverride, setHasOverride] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const hasPagedBookPrompt =
    levelId === "level3" || levelId === "level4";

  useEffect(() => {
    if (!levelIds.length) {
      return;
    }
    if (!levelIds.includes(levelId)) {
      setLevelId(levelIds[0]!);
      return;
    }
    setLoadError(null);
    setHint(null);
    void fetchPromptSettings(levelId)
      .then((d) => {
        setSystem(d.effective.system);
        setUserTemplate(d.effective.userTemplate);
        const rp = d.effective.referencePhases;
        setEarly(rp?.early ?? emptyBand());
        setMid(rp?.mid ?? emptyBand());
        setLate(rp?.late ?? emptyBand());
        setHasOverride(d.hasOverride);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [levelId, levelIds]);

  async function save() {
    setSaving(true);
    setLoadError(null);
    setHint(null);
    try {
      await savePromptSettings(levelId, {
        system,
        userTemplate,
        ...(hasPagedBookPrompt
          ? { referencePhases: { early, mid, late } }
          : {}),
      });
      setHasOverride(true);
      setHint("已保存到后端的 config/prompt-overrides.json，下次生成立即生效。");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("确定删除本级别覆盖，恢复为 levels.yaml 中的默认吗？")
    ) {
      return;
    }
    setSaving(true);
    setLoadError(null);
    setHint(null);
    try {
      await clearPromptSettings(levelId);
      setHasOverride(false);
      const d = await fetchPromptSettings(levelId);
      setSystem(d.effective.system);
      setUserTemplate(d.effective.userTemplate);
      const rp = d.effective.referencePhases;
      setEarly(rp?.early ?? emptyBand());
      setMid(rp?.mid ?? emptyBand());
      setLate(rp?.late ?? emptyBand());
      setHint("已恢复为 YAML 中的默认。");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!levelIds.length) {
    return null;
  }

  return (
    <details className="prompt-panel">
      <summary>高级：编辑 Prompt（保存到服务器）</summary>
      <div className="prompt-panel-inner">
        <p className="prompt-panel-note">
          将写入{" "}
          <code>server/config/prompt-overrides.json</code>，在{" "}
          <code>levels.yaml</code> 默认之上做覆盖。部署到公网时应对该接口加鉴权。
        </p>
        {loadError && (
          <p className="err" role="alert">
            {loadError}
          </p>
        )}
        {hint && <p className="prompt-ok" role="status">{hint}</p>}

        <div className="row prompt-level-row">
          <label>
            级别
            <select
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              disabled={saving}
            >
              {levelIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          {hasOverride && (
            <span className="override-badge" title="存在 override 文件">
              已覆盖
            </span>
          )}
        </div>

        <p className="field-label">System</p>
        <textarea
          className="prompt-ta"
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          disabled={saving}
          spellCheck={false}
        />

        <p className="field-label">User 模板 (userTemplate)</p>
        <textarea
          className="prompt-ta"
          value={userTemplate}
          onChange={(e) => setUserTemplate(e.target.value)}
          disabled={saving}
          spellCheck={false}
        />

        {hasPagedBookPrompt && (
          <>
            <p className="field-label">三阶段参考文 · early (课 1–48) · 虚构</p>
            <textarea
              className="prompt-ta"
              value={early.fiction}
              onChange={(e) =>
                setEarly((b) => ({ ...b, fiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
            <p className="field-label">三阶段参考文 · early (课 1–48) · 非虚构</p>
            <textarea
              className="prompt-ta"
              value={early.nonfiction}
              onChange={(e) =>
                setEarly((b) => ({ ...b, nonfiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
            <p className="field-label">三阶段参考文 · mid (课 49–96) · 虚构</p>
            <textarea
              className="prompt-ta"
              value={mid.fiction}
              onChange={(e) =>
                setMid((b) => ({ ...b, fiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
            <p className="field-label">三阶段参考文 · mid (课 49–96) · 非虚构</p>
            <textarea
              className="prompt-ta"
              value={mid.nonfiction}
              onChange={(e) =>
                setMid((b) => ({ ...b, nonfiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
            <p className="field-label">三阶段参考文 · late (课 97–144) · 虚构</p>
            <textarea
              className="prompt-ta"
              value={late.fiction}
              onChange={(e) =>
                setLate((b) => ({ ...b, fiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
            <p className="field-label">三阶段参考文 · late (课 97–144) · 非虚构</p>
            <textarea
              className="prompt-ta"
              value={late.nonfiction}
              onChange={(e) =>
                setLate((b) => ({ ...b, nonfiction: e.target.value }))
              }
              disabled={saving}
              spellCheck={false}
            />
          </>
        )}

        <div className="prompt-actions">
          <button
            className="btn"
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存到 prompt-overrides.json"}
          </button>
          <button
            className="btn sec"
            type="button"
            onClick={() => void reset()}
            disabled={saving}
          >
            恢复为 YAML 默认
          </button>
        </div>
      </div>
    </details>
  );
}
