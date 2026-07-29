# 部署到阿里云函数计算 FC（国内区，推荐）

目标：把 `agent-server/` 跑在阿里云函数计算上，拿到一个国内稳定访问的 HTTPS 地址，贴进简历。

## 0. 前置
- 阿里云账号（实名认证）
- 函数计算 FC 控制台：https://fc.console.aliyun.com
- 地域选**国内**（如 华东1 杭州 / 华南1 深圳），保证国内面试官访问快

## 1. 准备
确保本地 `agent-server/` 含：
- `package.json`、`server.js`、`prompts.js`、`knowledge.js`、`data/`、`public/`
- 已 `npm install` 生成 `node_modules`（FC 也可在线安装，但本地装好更稳）

> FC 自定义运行时监听的端口必须是 `9000`。本服务用 `process.env.PORT || 3000`，所以在 FC 里设置环境变量 `PORT=9000` 即可。

## 2. 创建函数（自定义运行时 / Node.js）
1. 函数计算 → 创建函数 → 选择「使用自定义运行时创建」或「事件函数（Node.js 18）」
2. 运行环境：Node.js 18
3. 监听端口：填 `9000`
4. 上传方式：把整个 `agent-server/` 文件夹打包 zip 上传，或关联代码仓库
5. 入口：默认 `server.js`（FC 会执行 `npm start` 或你配置的启动命令；在「启动命令」填 `node server.js`）

## 3. 配置环境变量（关键，别写进代码）
在函数「环境变量」里添加：
```
DEEPSEEK_API_KEY = sk-你的真实key
DEEPSEEK_MODEL   = deepseek-v4-flash
PORT             = 9000
```
> `.env` 已被 `.gitignore` 排除；FC 要用控制台环境变量，不要上传 `.env` 文件。

## 4. 触发器 / 访问
- 创建一个 **HTTP 触发器**（认证方式选「无需认证」），得到一个 `*.cn-shanghai.fcapp.run` 的 URL。
- 打开 `https://<你的域名>/` 即为聊天界面；`/api/ask` 为接口；`/health` 为健康检查。

## 5. 验证
```bash
curl https://<你的域名>/health
curl -X POST https://<你的域名>/api/ask -H 'Content-Type: application/json' \
  -d '{"question":"你为什么选择深耕招聘赛道？","lang":"zh"}'
```

## 6. 成本 & 注意
- 按调用计费，空闲不计费；33 组问答知识库极小，模型调用成本可忽略。
- 如需自定义域名（用自己的简历子域），在 FC/API 网关绑定即可。
