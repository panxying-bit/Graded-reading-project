/** Single-screen workflow regions: only the active tab mounts heavy UI. */

import type { ReactNode } from "react";

export type WorkflowTabId = "compose" | "illustrate" | "language";

const TAB_DEFS: { id: WorkflowTabId; label: string }[] = [
  { id: "compose", label: "生成与课文" },
  { id: "illustrate", label: "绘本配图" },
  { id: "language", label: "句型与词汇" },
];

type TabBarProps = {
  active: WorkflowTabId;
  onChange: (id: WorkflowTabId) => void;
};

export function WorkflowTabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="workflow-tabs" aria-label="工作台分区">
      <div role="tablist" className="workflow-tablist">
        {TAB_DEFS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              id={`workflow-tab-${t.id}`}
              className={`workflow-tab${isActive ? " workflow-tab--active" : ""}`}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="workflow-tab-hint" lang="zh-CN">
        仅当前分区会加载界面，减轻渲染与切换课次时的卡顿。
      </p>
    </nav>
  );
}

type EmptyProps = {
  children: ReactNode;
};

/** Lightweight placeholder when a tab has no heavy panel to mount. */
export function WorkflowTabEmpty({ children }: EmptyProps) {
  return (
    <section
      className="workflow-tab-empty"
      aria-label="分区说明"
    >
      <div className="workflow-tab-empty-inner">{children}</div>
    </section>
  );
}
