# Graded Reading Platform

分级阅读英文文本生成平台：用户选择**阅读级别**，后端根据**级别绑定的 Prompt 模板**调用大语言模型，生成符合该级别（如 CEFR）要求的英文阅读文本。前后端分离，**独立后端**保护 API 密钥、集中管理级别配置。

## 技术栈（已定稿）

- **前端**：Vite + React + TypeScript（`web/`）
- **后端**：Node.js + TypeScript + Fastify（`server/`）
- **级别配置**：`server/config/levels.yaml`

## 目录结构

| 路径 | 说明 |
|------|------|
| `web/` | 选级别、主题、词数，调用 API，展示与复制结果 |
| `server/` | HTTP 接口、解析 prompt、调用 OpenAI 兼容接口 |
| `server/config/levels.yaml` | 各 `level` 的 `system` / `userTemplate` 与 CEFR 元数据 |
| `docs/` | 架构、API、级别配置说明 |
| `.env.example` | 环境变量模板 |

## 环境要求

- [Node.js](https://nodejs.org/) 20 LTS 或 22（建议 20+）
- 已注册的 LLM 服务账号与 **OpenAI 兼容** 的 Base URL 与 API Key

## 环境变量

1. 复制项目根目录下的 `.env.example` 为 `.env`（放在**项目根目录**或**server** 子目录均可；若两处都有，以 `server/.env` 后加载的项为准，即更具体的一侧可覆盖）。
2. 填写 `LLM_BASE_URL`、`LLM_API_KEY`、以及可选的 `LLM_MODEL`、`PORT`。

**切勿**将真实 `.env` 提交到 Git；仓库中已有 `.gitignore` 规则忽略 `.env`。

## 本地开发

在**两个终端**中分别执行：

**终端 1：后端**（需先 `cd` 到项目下的 `server` 目录）

```bash
cd server
npm install
npm run dev
```

默认监听 `http://127.0.0.1:3000`（由 `PORT` 控制）。若 3000 被占用，可设 `PORT=3010` 等。

若你改了后端端口，还应在 `web` 中创建 `.env`（可参照 `web/.env.example`），增加与后端一致的 `VITE_DEV_API_PORT=3010`，否则前端的 Vite 代理仍指向 3000。

**终端 2：前端**（`cd` 到 `web` 目录）

```bash
cd web
npm install
npm run dev
```

浏览器打开 Vite 提示的地址（一般为 `http://127.0.0.1:5173`）。开发环境下 Vite 会把以 `/api` 开头的请求**代理**到本机 `3000` 端口的后端，一般无需再配 CORS。

**依赖安装只需在前端、后端各执行一次** `npm install`；改代码时分别用 `npm run dev` 热更新。

## 构建（可选）

- 前端静态资源：`cd web && npm run build`，产物在 `web/dist/`，可交给任意静态托管。
- 后端先 `cd server && npx tsc` 再 `node dist/index.js`（或继续用 `tsx` 在服务器上跑 `src`）；生产环境需带上 `config/levels.yaml` 或等价挂载方式。

## API 与级别说明

与实现一致的约定见 [docs/API.md](./docs/API.md) 与 [docs/LEVELS.md](./docs/LEVELS.md)。健康检查：`GET /health` 与 `GET /api/health` 均可用。

## 安全与合规

- 密钥、费率与日志仅应在后端与可信基础设施中处理；对生产环境的 `/api/generate` 建议增加鉴权与**速率限制**。

## 许可证

由项目维护者决定；未确定前可不加 LICENSE。
