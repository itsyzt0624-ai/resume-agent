# 简历问答 Agent（杨卓橦 / Zhuotong Yang）

一个基于个人简历知识库的问答 Agent：面试官/招聘官用自然语言提问，Agent 以「卓橦本人」第一人称、基于简历与问答库作答，**不编造任何日期/数据**。

- **生成模型**：Deepseek（`deepseek-v4-flash`，OpenAI 兼容协议）
- **知识库**：`data/qa.json`（33 组问答，已双语对齐）
- **检索**：知识库极小 → 默认**全量注入**（最稳、零检索误差、成本最低）；预留 `retrieveTopK` 便于未来切换到向量库
- **前端**：内置单页聊天 UI（中文/EN 切换）

> ⚠️ 注意：Deepseek 已于 2026-07-24 下线 `deepseek-chat` / `deepseek-reasoner`，本项目默认使用 `deepseek-v4-flash`。
> Deepseek 接口位于**中国境内**，`api.deepseek.com` 从大陆访问稳定，无需双栈。

---

## 一、本地运行（3 步）

```bash
cd agent-server
npm install
cp .env.example .env        # 然后编辑 .env，填入你的 DEEPSEEK_API_KEY
npm start
```

浏览器打开 http://localhost:3000 即可对话。

- 没填 Key 也能跑：服务会进入**降级模式**，直接返回知识库最相关片段（方便你先看界面、后接模型）。
- 接口：`POST /api/ask`  `{ "question": "...", "lang": "zh" | "en" }` → `{ "answer": "...", "degraded"?: true, "cached"?: true }`
- 健康检查：`GET /health`

---

## 二、环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `DEEPSEEK_API_KEY` | **必填**，服务端读取，不暴露前端 | 无 |
| `DEEPSEEK_MODEL` | 生成模型 | `deepseek-v4-flash` |
| `DEEPSEEK_BASE_URL` | 接口地址 | `https://api.deepseek.com` |
| `PORT` | 端口 | `3000` |
| `CACHE_TTL_MIN` | 重复问题缓存(分钟) | `30` |
| `RATE_LIMIT_PER_MIN` | 每 IP 限流 | `20` |

---

## 三、部署到国内云（面试官稳定访问）

GitHub/Vercel 在国内常被墙或极慢，**推荐部署到国内云**，详见：

- `deploy/aliyun-fc.md` —— 阿里云函数计算 FC（国内区，推荐）
- `deploy/tencent-scf.md` —— 腾讯云 Serverless 云函数 SCF

部署前请务必在云控制台/环境变量里配置 `DEEPSEEK_API_KEY`，**不要写进代码或提交到仓库**。

---

## 四、目录结构

```
agent-server/
├── server.js          # Express 后端：检索+生成+缓存+限流+兜底
├── prompts.js         # 中/英 system prompt（人设+边界+口吻）
├── knowledge.js       # 知识库加载、上下文构建、轻量检索
├── data/qa.json       # 33 组问答知识库
├── public/index.html  # 聊天前端（中/英切换）
├── .env.example       # 环境变量模板
├── package.json
└── deploy/            # 国内云部署指南
```

---

## 五、可调参数（已在 server.js 内给出推荐值）

- `temperature: 0.3`（压低幻觉）
- `max_tokens: 500`（先短答，再按需展开）
- Top-K 检索预留 `k=6` 接口；当前全量注入
- system prompt 内已强制：`Do not invent dates/metrics; if unsupported, say you don't have it.`
