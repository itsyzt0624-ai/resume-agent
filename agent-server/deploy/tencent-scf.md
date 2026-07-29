# 部署到腾讯云 Serverless 云函数 SCF（国内区）

目标：把 `agent-server/` 跑在腾讯云 SCF + API 网关，拿到国内稳定访问的 HTTPS 地址。

## 0. 前置
- 腾讯云账号（实名认证）
- SCF 控制台：https://console.cloud.tencent.com/scf
- 地域选**国内**（如 广州 / 上海）

## 1. 准备
确保本地 `agent-server/` 含 `package.json`、`server.js`、`data/`、`public/` 等。
SCF Node.js 环境会在部署时自动 `npm install`，但建议本地先 `npm install` 验证依赖。

> SCF 的 Web 函数监听端口默认 `9000`。设置环境变量 `PORT=9000` 即可。

## 2. 创建函数（Web 函数 / Node.js）
1. 云函数 → 新建 → 选择「Web 函数」
2. 运行环境：Node.js 18
3. 上传：把 `agent-server/` 目录打包，或关联代码仓库（注意入口是 `server.js`）
4. 启动文件：`server.js`（Web 函数默认会执行 `package.json` 的 `start` 脚本：`node server.js`）

## 3. 配置环境变量（关键）
在函数「环境变量」里添加：
```
DEEPSEEK_API_KEY = sk-你的真实key
DEEPSEEK_MODEL   = deepseek-v4-flash
PORT             = 9000
```
> 不要上传 `.env` 文件；SCF 用控制台环境变量注入。

## 4. 绑定 API 网关（对外 HTTPS）
- 新建/关联一个 **API 网关**（公网服务），指向该 Web 函数。
- 得到形如 `https://xxx.apigw.tencentcs.com/release/` 的访问地址。
- 根路径 `/` 为聊天界面；`/api/ask` 为接口；`/health` 健康检查。

## 5. 验证
```bash
curl https://xxx.apigw.tencentcs.com/release/health
curl -X POST https://xxx.apigw.tencentcs.com/release/api/ask -H 'Content-Type: application/json' \
  -d '{"question":"What is your biggest strength as a recruiter?","lang":"en"}'
```

## 6. 成本 & 注意
- SCF 按调用+时长计费，空闲几乎零成本。
- 若面试官主要在海外，可在 API 网关前加 CloudFlare 做全球加速（但核心仍是国内源站，Deepseek 调用稳定）。
