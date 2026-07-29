# 发给 GitHub Copilot 的交接包（简历问答 Agent）

下面是一份**自包含的交接说明**，可直接贴进 GitHub Copilot 对话，或让 Copilot 打开本仓库的 `agent-server/` 目录来 review / 部署。
**请勿把 `DEEPSEEK_API_KEY` 粘贴到任何聊天或代码里**——它只在运行时由服务端读取。

---

## 0. 这是什么

一个基于个人简历知识库的问答 Agent（用于秋招简历链接，供面试官提问）。
- 用户输入问题 → 服务从简历知识库检索上下文 → 用 Deepseek 生成「卓橦本人」第一人称回答 → 返回。
- 严格约束：只依据知识库回答，**不编造任何日期/数据**。
- 知识库极小（33 组问答），默认**全量注入上下文**（比向量库更稳、零检索误差、成本最低）。

---

## 1. 回答 GitHub/Copilot 之前提出的规格清单

**① Deepseek API docs / endpoints**
- 文档：https://api-docs.deepseek.com/
- Base URL（OpenAI 兼容）：`https://api.deepseek.com`
- 文本生成：`POST https://api.deepseek.com/chat/completions`
- Embeddings：**Deepseek 不提供**（见 ⑤）
- 鉴权：`Authorization: Bearer <DEEPSEEK_API_KEY>`

**② API Key**：在 `https://platform.deepseek.com/api_keys` 生成，存为环境变量 `DEEPSEEK_API_KEY`，**不要粘贴到聊天/代码库**。

**③ 模型名**
- 生成（推荐）：`deepseek-v4-flash`（便宜、低延迟，RAG/对话首选）
- 复杂推理可选：`deepseek-v4-pro`
- ⚠️ `deepseek-chat` / `deepseek-reasoner` 已于 **2026-07-24 退役**，请勿使用。

**④ 中国大陆可达性**
- Deepseek 基础设施在中国境内，`api.deepseek.com` 从大陆访问**稳定可靠** → 生成环节无需担心，**不需要双栈（dual-stack）**。

**⑤ Vector DB / Embeddings**
- 给定知识库仅 33 组问答，**建议跳过向量库，直接全量注入上下文**（最稳、零误差、成本最低）。
- 若坚持 RAG：Embeddings 模型用开源多语言 **BAAI/bge-m3**（中国本地 HuggingFace `sentence-transformers` 自托管，无跨境依赖）；Vector DB 用 **PGVector**（中国区 Postgres）或 **Milvus / Zilliz Cloud**。避免 Supabase（美区）。

**⑥ 托管偏好**
- 面向中国大陆面试官 → **不要选 Vercel**（国内常被墙/极慢）。
- 推荐：**阿里云函数计算 FC** 或 **腾讯云 SCF**（中国区 serverless，国内访问稳）。详情见 `agent-server/deploy/`。
- 需要中国区托管：**是**。

**⑦ Tone 示例（第一人称，基于本人简历/问答库）**
```
- "我是卓橦，一个会用五种语言沟通、还自己写招聘工具的 recruiter。"
- "我把招聘当成产品来做：先画人才地图，再设计漏斗，最后盯转化率。"
- "遇到我不掌握的细节，我会直接说'这个我简历里没有'，绝不编造日期或数据。"
- "我用 Vibe Coding 自己搓了一个候选人看板，团队现在天天在用。"
- "海外招聘我习惯用英文直接电话面试，LinkedIn 触达 30+ 人/天是日常。"
```
- **是否需要 EN + ZH 双语文案**：**要**。system prompt 已备 EN/ZH 两版，按 UI 语言切换（比自动检测更稳）。

**⑧ 推荐运行参数**
- `temperature: 0.3`（压低幻觉）
- `max_tokens: 500`（先短答，再按需展开）
- Top-K 检索 `k=6`（当前全量注入）；分块 `200–600 tokens`
- system prompt 必须含：`"Do not invent dates/metrics; if a detail is not in your profile, say you don't have it."`（已在 `prompts.js` 实现）

**⑨ 架构**
- 已按 Copilot 给的 ingestion → 检索 → 生成 → 引用 → 日志 流程实现。
- 唯一调整：检索用 **bge-m3（本地）** 而非 Deepseek embedding；生成用 **deepseek-v4-flash**；全部跑在中国区后端，Key 仅在服务端。

---

## 2. 代码文件地图（`agent-server/`）

| 文件 | 作用 |
|------|------|
| `server.js` | Express 服务：检索 → 构造 prompt → 调 Deepseek → 返回；含缓存/限流/无 Key 降级/报错兜底 |
| `prompts.js` | 中/英 system prompt（人设 + 不编造硬约束 + 口吻示例）|
| `knowledge.js` | 加载 33 组问答；全量注入 + `retrieveTopK` 预留接口 |
| `data/qa.json` | 简历问答知识库（33 组）|
| `public/index.html` | 聊天前端（中文/EN 切换）|
| `package.json` | 依赖：express、openai、dotenv |
| `.env.example` | 环境变量模板 |
| `deploy/aliyun-fc.md` | 阿里云函数计算部署指南 |
| `deploy/tencent-scf.md` | 腾讯云 SCF 部署指南 |

---

## 3. 可直接发给 GitHub Copilot 的提示词

> 复制下面这段发到 GitHub Copilot 聊天（并确保它打开了本仓库的 `agent-server/` 目录）：
>
> ---
> 这是我做的一个简历问答 Agent 项目，代码在 `agent-server/`（`server.js` / `prompts.js` / `knowledge.js` / `public/index.html` / `package.json`）。
> 技术栈：Node + Express + OpenAI SDK 指向 Deepseek（`deepseek-v4-flash`，baseURL `https://api.deepseek.com`）。知识库是 `data/qa.json`（33 组问答），默认全量注入上下文，不接向量库。前端在 `public/`，中文/EN 切换。已含缓存、限流、无 Key 降级、报错兜底。
> 请帮我做两件事：
> 1）**代码审查**：检查 server.js 的 Deepseek 调用、错误处理、port 配置（部署时 PORT=9000）是否正确，有无安全/健壮性问题；
> 2）**给出部署到阿里云函数计算 FC 的具体步骤**（我已写了 `deploy/aliyun-fc.md`，请据此补全遗漏，特别是启动命令、环境变量注入 `DEEPSEEK_API_KEY`、HTTP 触发器配置）。
> 注意：`DEEPSEEK_API_KEY` 必须只在服务端/云环境变量里，绝不能进代码或回复给我看。
> ---

---

## 4. 本地验证（你或 Copilot 可跑）

```bash
cd agent-server
npm install
cp .env.example .env      # 在 .env 里填入你的 DEEPSEEK_API_KEY
npm start                 # 打开 http://localhost:3000
```
> 没填 Key 也能启动：自动进入「降级模式」，直接返回知识库最相关片段，方便先看界面。

---

## 5. 推送到 GitHub（让 Copilot 能读到仓库）

```bash
cd ~/Desktop/Agent
git add agent-server GITHUB_HANDOFF.md
git commit -m "Add resume-agent backend (Express + Deepseek)"
git push
```
