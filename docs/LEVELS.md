# 级别与 Prompt 配置

核心原则：**一个 `level` id 对应一条（或多条）固定模板**，在生成时由后端拼接，保证“级别 → 专家人设与课标要求”的稳定性，而不是每次由前端传完整大段 Prompt（前端可只传 `topic`、字数等参数）。

## 配置存放位置

- 与后端代码同仓，如 `config/levels.yaml` 或 `config/levels.json`。
- 部署时以**同版本镜像/制品**带上线，或挂载只读卷；这样版本回滚时级别与代码一致。

## 建议的 YAML 结构

以下为**示例**，字段名实现时可保持语义等价。

```yaml
# Example only — adjust copy to your curriculum
levels:
  level1:
    cefr: "Pre-A1"
    name: "Very short lines, high-frequency words"
    system: |
      You are an expert in English as a foreign language for young learners.
      Generate reading text appropriate for CEFR Pre-A1. Use only extremely
      common words, very short sentences, and a clear, concrete situation.
    userTemplate: |
      Topic: {{topic}}.
      Target length: about {{wordCount}} English words. Output plain text only.

  level2:
    cefr: "A1"
    name: "欧框 A1 分级阅读"
    system: |
      你是英语课程设计专家，精通英语课程标准。根据用户给定的主题，生成符合欧洲语言共同参考框架
      (CEFR) A1 水平的英文阅读材料：句式简单、词汇为基础高频词、篇幅可控，适合作为分级阅读单篇使用。
    userTemplate: |
      主题或情境：{{topic}}。
      请生成约 {{wordCount}} 个英文词；仅输出英文正文，不要中译或讲解。
```

说明：

- **`system`**：与级别强绑定的“专家人设 + 课标/欧框要求”，**不宜**让终端用户直接修改。
- **`userTemplate`**：可含占位符；`topic`、`wordCount` 未传时由 `promptResolver` 使用默认值或省略该句（实现时可用简单字符串替换，不必上 Handlebars 除非已有依赖）。
- **`cefr` / `name`**：给 `GET /api/levels` 与 `POST /api/generate` 响应用。

## 占位符约定（建议）

| 占位符 | 含义 | 未提供时的处理 |
|--------|------|----------------|
| `{{topic}}` | 用户输入的主题/题材总线（umbrella topic） | 可替换为默认值或从模板中整句删除。 |
| `{{lessonTitle}}` | 原始课文标题字符串（无额外句式） | 空字符串。 |
| `{{lessonTitleBlock}}` | 当用户提供了 `lessonTitle` 时的一段英文说明；否则空 | 空字符串（不占一行）。 |
| `{{wordCount}}` | 期望词数 | 可默认 `100` 或从 level 中读 `defaultWordCount`。 |

保持占位符在文档与代码中**命名一致**。

## 与 API 的对应

- 客户端发 `level: "level2"`，后端在 `levels.level2` 下取 `system` 与 `userTemplate`。
- 若 `level2` 不存在，返回 400，错误码如 `INVALID_LEVEL`（见 [API.md](./API.md)）。

## 修改流程（运维/教研）

1. 编辑 `config/levels.yaml`（并走代码评审）。
2. 发布后端；若提供 `GET /api/levels`，无需改前端即可更新下拉文案。
3. 重大课标调整建议改 `system` 并**版本化**（例如在配置中加 `version` 字段仅作记录，或 Git tag）。

## Level3：三阶段 `referencePhases` + 按课次 `lesson`

- **level3 当前实现**：输出为**一个 JSON 对象**，内含 `pages` **6～8 项**（第 1 页至末页，页数由模型在 6/7/8 中选取以贴合故事与词数带），每页 `text` 为 **1–2 句** 英文。全书英文总词数按课次分三档，目标约为 **前 48 课 70 词、中 48 课 80 词、后 48 课 90 词**；提示词中会给出可替换的**词数上下限**，模型应把全篇总词数控制在该带内。参考范文在同文件的 **`referencePhases`** 中仍为**纯行文本**（`early` / `mid` / `late`），仅供语气参考，**正式输出须为带 `pages` 的 JSON**，见 `system` 中的 `Output format`。
- 配置中通过 **`referencePhases`** 为每个阶段提供 **虚构（fiction）与非虚构（nonfiction）各一篇**：`early` / `mid` / `late` 对应第 1–48、49–96、97–144 课。后端根据 **`lesson`** 选档，并根据请求中的 **`fictionOrNonfiction`** 选用对应参考文，接在 `system` 后（只学语气与节奏，**禁止**照抄内容）。
- 某级别仍可使用单字段 **`referenceSample`**（与 `referencePhases` 二选一或仅非 level3 使用），作用与旧版「金样例」相同。

## 扩展

- 为同一 `level` 增加多种文体（`genre`）：在请求体中增加 `genre`，在 `userTemplate` 中增加分支；或在配置中设 `level2_narrative` / `level2_dialogue` 等子 id。
- 双语讲解另开接口或第二段 `assistant` 调用，避免与单篇 `text` 混淆；本需求**首期**以纯英文阅读正文为主即可。
