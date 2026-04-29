# HTTP API 约定

后端对外提供 **JSON** 接口。Base URL 由部署决定，开发环境可为 `http://localhost:3000`（具体端口以 `PORT` 环境变量为准）。路径前缀使用 `/api` 以区分于静态资源。

所有请求与响应的 `Content-Type` 为 `application/json; charset=utf-8`（`GET` 无 body 时除外）。

## 1. 健康检查

`GET /health` 或 `GET /api/health`（二选一在实现时固定，并在 README 中注明。）

**响应 200（示例）**

```json
{
  "ok": true,
  "service": "graded-reading-platform"
}
```

用于探活，不参与业务。

---

## 2. 获取可选级别列表（推荐）

`GET /api/levels`

用于前端构建下拉/卡片；数据应与配置文件中的 level **一致**，避免写死在前端。

**响应 200（示例）**

```json
{
  "levels": [
    {
      "id": "level1",
      "name": "入门（Pre-A1 倾向）",
      "cefr": "Pre-A1",
      "lessonsPerLevel": 144
    },
    {
      "id": "level2",
      "name": "基础（A1）",
      "cefr": "A1",
      "lessonsPerLevel": 144
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 请求生成接口时使用的**级别标识**（如 `level2`）。 |
| `name` | string | 界面展示用中文或双语名称。 |
| `cefr` | string | 可选，欧框或课标等级展示。 |
| `lessonsPerLevel` | number | 可选，该级别课文槽位总数（如 1…144），来自 `defaults.lessonsPerLevel` 或级别覆盖。供前端与课程大纲对齐。 |

若配置中无数据，可返回 `levels: []`。

---

## 2.1 获取某级别课文课纲（主题表，可选）

`GET /api/levels/:levelId/lessons`

当仓库中存在 `server/config/lessons/{levelId}.json` 时，返回该文件 JSON（与前端「第几课 → 主题」关联）。**不存在**时返回 `404` 与错误体，前端可忽略并继续手填主题。

**响应 200（示例，节选）**

```json
{
  "level": "level3",
  "description": "28 themes, round-robin...",
  "themeCycle": ["Nature", "Animals"],
  "lessons": [
    { "lesson": 1, "theme": "Nature" },
    { "lesson": 2, "theme": "Animals" }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `lessons` | 与 `lesson` 序号 1…N 一一对应。每行含 `theme`（总主题/题材线），可选 `lessonTitle`（该课课文标题）、`suggestedFictionOrNonfiction`（`fiction` / `nonfiction`，用于前端默认）。`theme` 供生成时作 `topic` 默认，`lessonTitle` 作课文标题提示默认。 |
| `themeCycle` | 可选，该级别主题循环顺序说明。 |

---

## 2.2 编辑级别 Prompt（覆盖层，可选）

用于在**不直接改 Git 里 `levels.yaml`** 的情况下，通过 HTTP 把内容写入 `server/config/prompt-overrides.json`，与 YAML 默认**按字段合并**（有则覆盖）。**生产环境应对这些路径加鉴权。**

`GET /api/prompts/:levelId`

- 200：返回 `base`（仅 YAML）、`effective`（合并后）、`hasOverride`（是否已有覆盖文件）。

`PUT /api/prompts/:levelId`

- Body（JSON）：`{ "system": "...", "userTemplate": "..." }`；`level3` 可额外传 `referencePhases: { "early", "mid", "late" }`。
- 若某字段与 YAML 默认**相同**（去首尾空白后比较），该字段**不会**写入覆盖文件。

`DELETE /api/prompts/:levelId`

- 删除该级别的整段覆盖，恢复为 YAML 默认。

---

## 3. 生成分级阅读文本

`POST /api/generate`

**请求体（JSON）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | string | 是 | 与配置中的 id 一致，如 `level2`。 |
| `topic` | string | 否 | 主题/题材总线（与课纲的 `theme` 对应时可作为 umbrella topic）；未传由 Prompt 模板决定默认行为。 |
| `lessonTitle` | string | 否 | 该课具体课文标题，供模板 `{{lessonTitleBlock}}` 使用；可空。 |
| `wordCount` | number | 否 | 期望英文词数近似值；正整数。对 **level3** 且已配置 `referencePhases` 时，服务端按 `lesson` 带选择 **约 70 / 80 / 90** 词目标，**可忽略**请求中的 `wordCount`。 |
| `lesson` | number | 否 | 正整数，建议 1…144。`level3` 时用于选择**阶段**与参考范文：1–48、49–96、97–144 三档。未传时按第 1 课处理。 |
| `fictionOrNonfiction` | string | 否 | `fiction` 或 `nonfiction`。 |
| `structureType` | string | 否 | 叙事/结构类型，与前端一致。 |
| `tenseFocus` | string | 否 | 可选项。英文短说明（如 `past simple`），在提示中附加「时态重点」指令，用于在篇内突出该时态；不传或空字符串则不强调。 |
| `genreFocus` | string | 否 | 可选项。在「虚构/非虚构」之上进一步限定体裁/形式，英文短说明或短语（如 `a fairy tale`、`a fable (animal characters, simple moral)`）；不传或空则不加。 |

**请求示例**

```json
{
  "level": "level2",
  "topic": "A day at the park with my friend",
  "wordCount": 120
}
```

**响应 200（成功）**

```json
{
  "level": "level2",
  "cefr": "A1",
  "text": "The full generated English reading passage as plain text..."
}
```

- `cefr` 为可选，若配置中有则返回，便于界面展示。

对 **level3** 且已配置 `referencePhases` 时，成功响应中可额外包含 `level3WordCount`（便于前端展示词数是否落在带内及自动修订次数），例如：

```json
{
  "level": "level3",
  "cefr": "A1+",
  "text": "{ \"title\": \"...\", \"pages\": [ ... ] }",
  "level3WordCount": {
    "actual": 74,
    "min": 62,
    "max": 80,
    "target": 70,
    "inRange": true,
    "repairRounds": 1
  }
}
```

- `actual`：按各页 `text` 拼接后、以空白分词统计的英文词数。  
- `min` / `max`：与提示词中目标带一致；若首次生成超带，后端会追加多轮对话要求模型压缩/补足（`repairRounds` 为实际追加的修正轮数，最多 2 轮）。

**错误响应**

| HTTP 状态 | 条件 |
|-----------|------|
| 400 | 缺少 `level`、或 `level` 在配置中不存在、或 `wordCount` 非法。 |
| 502 / 503 | 上游 LLM 不可用、超时。 |
| 500 | 未预期服务端错误。 |

**错误体（建议统一）**

```json
{
  "error": "INVALID_LEVEL",
  "message": "Unknown level: level99"
}
```

- `error` 为**机器可读**的短码；`message` 可为给人看的说明。前端可据此做轻量提示，不必暴露内部细节。

---

## CORS

若浏览器直连后端域名，需在后端为前端 `Origin` 配置 CORS。本地开发用 Vite 代理时，可仍仅允许本机或内网 `Origin`，按团队规范选择。

## 与 LLM 的对应关系

后端将 `level` 解析为 `system` + `user` 消息后调用聊天补全接口，将模型返回的**第一条 assistant 内容**作为 `text` 填入上述成功响应。具体超参（`temperature` 等）由服务端配置或环境变量决定，**不**通过本 API 暴露给匿名客户端，以减少滥用面。
