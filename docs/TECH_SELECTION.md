# ChatWebUI 技术架构

ChatWebUI 是一套多模型 AI 聊天、生图、语音与运营后台系统。系统采用前后端分离的 monorepo 结构，用户端和运营后台共用 React Web 应用，业务 API 由 Go 服务提供，核心业务数据保存在 PostgreSQL，短期状态和限流使用 Redis。

## 架构总览

```text
Browser
  -> React/Vite Web
  -> Nginx
  -> Go HTTP API
  -> PostgreSQL
  -> Redis
  -> Upload Volume
  -> External Model Providers
```

## 固定技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| Web | React 18、Vite、TypeScript | 用户端与运营后台 |
| UI | CSS Tokens、Lucide Icons、Markdown/Mermaid 渲染 | 统一界面和对话内容渲染 |
| API | Go HTTP Server | 鉴权、模型调用、计费、审计、后台管理 |
| Database | PostgreSQL | 用户、会话、消息、模型、积分、日志 |
| Cache | Redis | 匿名试用次数、登录失败限流、短期状态 |
| Deploy | Docker Compose、Nginx | VPS 部署与反向代理 |

## 数据职责

PostgreSQL 是系统唯一业务事实来源，保存以下数据：

- 用户账号、昵称、头像、方案、积分。
- 登录会话、登录历史、审计日志。
- 对话会话、消息内容、生成记录。
- 模型供应商、模型清单、默认模型、模型权重、连通性状态。
- 积分策略和积分流水。

Redis 只保存短期数据：

- 未登录匿名聊天次数。
- 登录失败次数限制。
- 后续可扩展的短期任务状态。

## 模型配置

模型供应商和模型清单通过后台模型服务维护，不依赖本地模型配置文件。Provider API Key 在服务端接收后加密写入 PostgreSQL，前端只显示脱敏值。

模型支持的能力类型：

- `chat`：文字对话。
- `image`：图片生成。
- `speech`：语音生成。
- `embedding`、`tool`、`vision`：扩展能力。

默认模型必须满足：

- 模型已启用。
- 模型对所有用户可见。
- 模型能力与默认角色匹配。

## 鉴权与权限

- 用户端和后台使用独立 Token 存储，避免前后台登录态互相覆盖。
- Token 由后端生成，数据库只保存 Token 哈希。
- 用户密码使用 bcrypt 哈希保存。
- Provider API Key 使用 `APP_SECRET` 派生密钥，通过 AES-GCM 加密保存。
- 后台接口必须使用管理员 Token；普通用户访问后台接口返回 403。
- 会话默认 168 小时过期，可通过 `SESSION_TTL_HOURS` 调整。

## 积分计费

积分策略分为两类：

- 按次计费：文字、图片、语音、其他能力分别配置单次积分。
- 按 Token 计费：根据输入和输出 Token 估算积分。

图片模型固定按次计费，避免不同供应商图片 Token 口径不一致造成费用不可控。

## 文件与上传

- 本地上传文件写入 `UPLOAD_DIR`。
- Docker 部署写入 `api-uploads` volume。
- 普通 JSON 请求体默认限制 4MB。
- multipart 上传默认限制 25MB。
- 头像接口请求体限制 10MB，头像单文件限制 8MB。
- 大附件、长期文件和公开资源可后续迁移到对象存储。

## 配置边界

项目只保留根目录一份 `.env.example`。`.env` 用于基础设施和安全配置，不保存模型供应商、模型列表、默认模型、计费策略等业务配置。

典型配置项：

- PostgreSQL：`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`
- Web：`WEB_PORT`、`VITE_API_BASE_URL`
- API 安全：`APP_SECRET`、`ADMIN_ACCOUNT`、`ADMIN_PASSWORD`
- 访问控制：`CORS_ALLOWED_ORIGINS`
- 运行策略：`ANONYMOUS_CHAT_LIMIT`、`SESSION_TTL_HOURS`

Docker Compose 使用 `POSTGRES_*` 拼接 API 容器内的 `DATABASE_URL`，并固定连接 Compose 内网的 Redis。非 Docker 本地开发可以按需额外设置 `DATABASE_URL`、`REDIS_ADDR`、`UPLOAD_DIR` 覆盖默认值。

## 部署形态

本地开发：

```text
Vite Dev Server -> Go API -> local PostgreSQL / Redis
```

Docker 部署：

```text
Nginx Web Container -> API Container -> PostgreSQL Container / Redis Container
```

生产环境建议使用 HTTPS 反向代理，并将 PostgreSQL、Redis 限制在内网访问。
