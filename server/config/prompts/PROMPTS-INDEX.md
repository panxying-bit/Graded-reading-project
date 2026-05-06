# Prompt inventory（项目内所有 LLM 相关提示与模板）

本文件是**索引用途**：实际正文以各路径下文件为准。更新任一处后请同步本索引的说明行（如有需要）。

## 1. 分级阅读生成（按级别）

| 位置 | 内容 |
|------|------|
| `server/config/levels.yaml` | 每个 `levelX` 的 `system` + `userTemplate`；占位符如 `{{topic}}`、`{{wordCount}}`、`{{structureType}}` 等。 |
| 同上 `level3` | 长篇 `system` + `userTemplate`（6–8 页 JSON 绘本）；`referencePhases.early\|mid\|late` 的 fiction / nonfiction 参考段。 |
| 同上 `level4` | 与 L3 同结构的 JSON 绘本占位；CEFR A2。另见独立短文提示 `prompts/level4-book-generation-prompt.md`（可选叠加/人工参考）。 |
| `server/config/prompts/level4-book-generation-prompt.md` | **Level 4 独立生成说明**（英文）：长度、结构、词汇、语法、虚构/非虚构 engagement、6–8 页等。占位：`{{topic}}`、`{{lessonTitle}}`、`{{fictionOrNonfiction}}`、`{{genre}}`、`{{structureType}}`、`{{tense}}`。尚未自动并入 `buildMessages`；可与 `levels.yaml` 或下游工具链手工合并。 |
| `server/config/prompt-overrides.json` | 运行时覆盖（与 API `PUT /api/prompts/:levelId` 对应），合并规则见 `promptOverrideStore.ts`。 |

## 2. 定稿后：句型与例句

| 位置 | 内容 |
|------|------|
| `server/config/sentence-pattern-prompt.md` | 句型结构、例句、变体、教学重点；占位 `{{cefr}}`、`{{文章}}`。 |
| `server/src/services/sentencePatternLoader.ts` | 在模板外拼接 **re-analysis** 时教师说明（前置/尾段英文说明 + 用户说明原文）。 |

## 3. 定稿后：词汇备选（第一步，候选词库）

| 位置 | 内容 |
|------|------|
| `server/config/prompts/vocab-candidate-prompt.md` | 从选段中筛 **5–7** 个可教词 + 原句；占位 `{{cefr}}`、`{{文章}}`。**API**: `POST /api/learning/vocab-candidates`（返回 `candidates`；**Level 3** 可能返回与 **L0–L2** Mastery 去重；**Level 4** 与 **L0–3** Mastery 去重）。**定表**（第三步）每课仍 **最多 4 个** 词/搭配，与 Level 3 相同。 |
| `server/config/mastery-words-l0-l2.json` | 自 `config/wordlists/Level-0-Level-2_wordlist.xlsx` 的 **l0 / l1 / l2** 表中 **Type = Mastery** 汇总（561 不重复小写词）。**Level 3** 词汇候选用此与 **headword 精确**去重。重生成： `python3 server/scripts/build_mastery_wordlist.py`（需 openpyxl）。 |
| `server/config/mastery-words-l3.json` | **Level 3** 段 Mastery 核心词（小写不重复）。与 `mastery-words-l0-l2.json` **并集** 用于 **Level 4** 词汇候选去重。**可由本机已保存的 L3「定表词」汇总生成**：浏览器复制 Local Storage 键 `graded-reading.lessonLibrary.v1` 到 JSON 文件后执行 `cd server && npm run build:mastery-l3 -- /绝对或相对路径/export.json`（见 `scripts/build-mastery-l3-from-lesson-library.mjs`）。亦可后续接 Excel 正式词表合并到同一文件。 |

## 4. 代码内联（非独立 .md，但影响最终消息）

| 位置 | 内容 |
|------|------|
| `server/src/services/promptResolver.ts` | `buildTenseFocusBlock`、`buildGenreFocusBlock`、`buildLessonTitleBlock`；Level3 **compact** 短 system/user 拼接。 |
| `server/src/index.ts` | 若干路由的 `system` 行（如 `/api/learning/sentence-pattern` 的基础 system；图片生成等）。 |
| `server/src/services/level3WordRepair.ts` | 字数修复时附加的 user 片段（与主 prompt 配合）。 |

## 5. 前端

| 位置 | 内容 |
|------|------|
| `web/src/PromptEditorPanel.tsx` | 编辑/保存覆盖到后端的 `prompt-overrides`，**不**存默认 YAML 全文。 |

---

**建议**：新增「独立一条业务」的完整提示词时，在 `server/config/prompts/` 下增加 `*-prompt.md`，并在本文件第三节（或新小节）登记；服务端用 `resolveServerConfigFile` 或相对 `config` 的固定路径加载。
