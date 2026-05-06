# Changelog

## 5.1.0 — 2026-05-06

**存档点：在 5.0 生图稳定基线上的观测与工程化改进（便于回退与后续拆页优化）。**

- **火山即梦**：`CVSync2AsyncGetResult` 对信封 **50500（ECInternal）** 的连续轮询与上限、超时后的明确报错（含 `task_id` / `request_id`）；与 AI 中台公用错误码「提工单」建议一致；`VOLC_GETRESULT_50500_MAX_CONSECUTIVE` 可配。
- **范围**：自 5.0 起积累的绘本配图准备/生成、TTS、词汇候选与定表、多级别课纲与导出等，一并纳入本标签快照。

若使用 Git：`git tag -a v5.1.0 -m "5.1.0 release snapshot"`。

### 版本号位置

- 根目录 `package.json`、`server/package.json`、`web/package.json`：**5.1.0**
- `web/src/appVersion.ts`：与上同步

## 4.0.0 — 2026-04-30

**里程碑：Level 2（CEFR A1）短文绘本管线稳定输出。**

- **生成链路**：Level 2 纳入 **`BOOK_PIPELINE_LEVEL_IDS`**，走初稿 → 精修 → 语言校核；输出 **JSON 绘本**（页数与词数带按课次三段：**early / mid / late**，对标教研参考表；中段仍有模型词数带，课纲主题主要在首尾两段）。
- **提示与参考**：`levels.yaml` 中 Level 2 **英文**系统提示（structure：pattern / concept / question_answer / action_sequence；句长与共现句式规则）；**`referencePhases`** 三段 × fiction/nonfiction，与 `level2 参考文章` 工作表一致。
- **课纲**：`server/config/lessons/level2.json`，**17** 个大主题各 **1 fiction + 1 nonfiction**，于 **第 1–34 课**与 **第 97–130 课**预填（共 **68** 本书位）；**35–48、49–96、131–144** 无预填；前端 **`levelHasLessonPlan`** 含 Level 2，同步主题、课文标题与建议体裁。
- **定表**：Level 2 与 Level 1 相同，**最多 6** 条定表词；Excel/HTML/ZIP 导出列已扩展到 **6** 档（L3/L4 仍为 4，余列空）。
- **延续**：Level 1 / L3 / L4 行为保持 3.0.0 / 2.x 基线；用户数据仍以浏览器 **`localStorage`** 为主，请定期用应用内导出备份。

若使用 Git，可打标签：`git tag -a v4.0.0 -m "Level 2 stable pipeline"`。

### 版本号位置

- 根目录 `package.json`、`server/package.json`、`web/package.json`：**4.0.0**

## 3.0.0 — 2026-04-30

**里程碑：Level 1 短语书管线稳定输出。**

- **生成链路**：Level 1 走初稿 → 精修 → 语言校核（与 L3/L4 同款书流程入口）；词数带按课次三段 **12 / 18 / 24**（各段 48 课），6 页 JSON、定表最多 **6** 词、`referencePhasesUnified` 参考阶段与结构选项（labeling / pattern）等与当前实现对齐。
- **课纲**：`server/config/lessons/level1.json`，**24** 个大主题在三段课次各轮转一遍；每主题每段占连续 **两课**（两个短语书槽位），共 **144** 槽位、**72** 个「主题×阶段」书位；前端通过 `levelHasLessonPlan` 加载课纲并同步主题 / 课文标题。
- **延续**：不改动 2.1.0 起 L3/L4 定表剑桥标注等行为；用户课文与定表仍主要存浏览器 `localStorage`，重要内容请用应用内导出备份。

若使用 Git，可打标签：`git tag -a v3.0.0 -m "Level 1 stable pipeline"`。

### 版本号位置

- 根目录 `package.json`、`server/package.json`、`web/package.json`：**3.0.0**

## 2.1.0 — 2026-04-30

**里程碑：L3 / L4 定表词增加「剑桥级别」标注（Movers / KET / PET）。**

- 词表来源：内置 `cambridge-movers-ket-pet.json`（由 `剑桥-movers-ket-pet wordlist.xlsx` 规范化生成）。
- 重叠词优先级（首次出现级别）：**Movers > KET > PET**；未命中显示「未收录」。
- 不改已有定表 `word` / `sentence` 内容，仅增加展示与导出列：定表 UI、HTML 汇总、ZIP 单课文本、Excel 汇总均含「剑桥级别」。
- 与 2.0.0 的 L3/L4 流程与课纲基线兼容。

若使用 Git，可打标签：`git tag -a v2.1.0 -m "Cambridge band labels for L3/L4 vocab"`。

## 2.0.0 — 2026-04-29

**里程碑：Level 3 与 Level 4 生成与词汇流程稳定。**

本版本将代码库与 `package.json` 统一标为 **2.0.0**，作为可长期参照的基线；与此前仅标 Git 标签的 v1 / v3.1 等记录互补。

### 范围摘要

- **L3 / L4 绘本流程**：三阶段（初稿 → 精修 → 语言校核）、词数带与参考范文、JSON 定稿与编辑链路稳定。
- **课纲数据**：`level4.json` 为 12 单元 × 2 课（fiction / nonfiction），分三段课次；`level3.json` 保持既有 144 槽位课纲。
- **表单**：全级别支持可选「文本内容构思」进提示词；Level 4 课纲预填段提示为 1–8、49–56、97–104。
- **词汇（L4）**：优先 A2/B1 教词带、A1 非核心展示与候选排序等策略已落地（见当期提交历史）。
- **注意**：用户课文与定表等仍存浏览器 `localStorage`，重要内容请用应用内导出或自行备份。

### 版本号位置

- 根目录 `package.json`：`2.0.0`
- `server/package.json`、`web/package.json`：`2.0.0`

若使用 Git，可在此提交上打标签，例如：`git tag -a v2.0.0 -m "L3/L4 stable"`。

## 较早版本

- **1.2.1**（及此前）：未单独保留 CHANGELOG；可参考仓库 Git 历史或用户记忆中的标签说明。
