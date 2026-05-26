# ChatWebUI 技术选型

本项目按“可运营的多模型 ChatWebUI”重构，前端 UI 保持现有视觉与交互为主，后端、数据库和配置体系按正式系统落地。

## 总体架构

```text
React/Vite Web
  -> Go HTTP API
  -> PostgreSQL 主数据库
  -> Redis 缓存/限流/轻量任务状态
  -> 本机 uploads 目录（头像等轻量文件）
  -> Provider Adapters（OpenAI-compatible / 其他协议）
```

## 固定选型

- 前端：React 18 + Vite + TypeScript。
- UI：保留现有自研 CSS tokens/styles，不引入大型 UI 框架。
- 聊天运行时：自研 React 聊天界面 + 后端 SSE，避免未接入运行时增加维护成本。
- 后端：Go 单体 API，标准库 HTTP 路由优先，按模块拆分 handler/service/store。
- 数据库：PostgreSQL，作为用户、会话、消息、模型配置、积分、审计的唯一事实来源。
- 缓存：Redis，用于限流、短期状态、后续异步任务队列。
- SQL：迁移文件固定在 `apps/api/migrations/`；业务代码使用 typed repository，避免散落 SQL。
- 密钥：Provider API Key 加密入库，前端只展示 masked key。
- 部署：本地可直接使用 PostgreSQL/Redis；VPS 使用 Docker Compose。

## 配置边界

`.env` 只允许保存基础设施配置：

- `DATABASE_URL`
- `REDIS_ADDR`
- `APP_SECRET`
- `UPLOAD_DIR`
- `HOST` / `PORT`
- `ADMIN_ACCOUNT` / `ADMIN_PASSWORD`
- `ANONYMOUS_CHAT_LIMIT`
- `SESSION_TTL_HOURS`
- CORS 白名单

`.env` 不保存供应商、模型、模型价格、默认模型等业务配置。业务配置必须进入 PostgreSQL，并由后台管理维护。

模型供应商、模型清单、默认模型、计费策略都由 PostgreSQL 保存，并通过后台模型服务维护；系统启动不依赖本地模型清单文件。

## 账号规则

- 用户注册：手机号或邮箱 + 密码 + 确认密码，不接短信/邮件验证码。
- 后台登录：账号密码，不接 2FA。
- 首次启动创建管理员。公网部署必须通过 `ADMIN_PASSWORD` 指定强密码，不允许使用开发默认密码。

## 本地开发环境

本机已确认：

- PostgreSQL：`127.0.0.1:5432`
- Redis：`127.0.0.1:6379`

本地开发数据库：

```text
DATABASE_URL=postgres://chatwebui:chatwebui_dev_2026@127.0.0.1:5432/chatwebui?sslmode=disable
REDIS_ADDR=127.0.0.1:6379
```

## 认证与权限

- 登录态使用 PostgreSQL `sessions` 表保存，前端只保存 Bearer Token，会话默认 168 小时过期。
- 注册、登录、健康检查是公开接口；用户端 API 必须携带有效用户 Token。
- 后台 API 必须携带有效管理员 Token，普通用户 Token 返回 403。
- 退出登录会删除服务端 session，不能只清理前端本地状态。
- 匿名聊天默认允许 3 次，使用 Redis 做短期限流；登录失败同样有短期限流。

## 验收原则

- 前端不再依赖 `data/mock.ts` 作为业务数据源。
- 生产后端不再使用 SQLite 或内存 store。
- 每个 API 有可运行测试覆盖。
- 积分策略只保留两类产品能力：按次计费与按 Token 计费。图片、语音默认归入按次计费，避免策略体系膨胀。
- 关键流程必须可真实跑通：注册、登录、模型导入、模型选择、聊天、会话历史、积分扣费、生成记录、后台统计。
