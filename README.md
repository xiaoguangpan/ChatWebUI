# ChatWebUI

> 多模型 AI 聊天、生图、语音与运营后台系统 · React/Vite 用户端 + Go API + PostgreSQL + Redis。

ChatWebUI 是一套面向真实运行的 Chat WebUI 系统，包含用户端聊天、生图、个人中心、积分体系，以及后台模型服务、用户管理、生成记录、积分流水、系统日志等运营能力。

---

## 1. 快速开始

### 本地开发

本地需要准备 PostgreSQL、Redis、Node.js 和 Go。

```bash
npm --prefix apps/web install
npm run dev:api
npm run dev:web
```

默认访问地址：

```text
Web: http://127.0.0.1:5174
API: http://127.0.0.1:8787
```

本地 API 默认连接：

```text
DATABASE_URL=postgres://chatwebui:chatwebui_dev_2026@127.0.0.1:5432/chatwebui?sslmode=disable
REDIS_ADDR=127.0.0.1:6379
```

### Docker 部署

项目只保留根目录一份 `.env.example`，本地开发和 Docker 部署都从这份文件复制 `.env`。

```bash
cp .env.example .env
```

上线前必须先填写 `.env` 中的安全项；这些值在 `.env.example` 中保持为空，避免误用示例密码：

```text
POSTGRES_PASSWORD=
APP_SECRET=
ADMIN_PASSWORD=
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

填写完成后启动：

```bash
docker compose up -d --build
```

Docker 默认 Web 入口为 `http://127.0.0.1:8080`。PostgreSQL、Redis 只在 Compose 内网暴露，上传文件写入 `api-uploads` 卷。`VITE_API_BASE_URL` 默认为空，表示前端通过 Nginx 同源反代访问 `/api`；如果 Web 与 API 分离部署，再填入 API 外部地址。

---

## 2. 目录结构

```text
ChatWebUI/
├── apps/
│   ├── web/                         # React 18 + Vite + TypeScript 前端
│   │   ├── src/
│   │   │   ├── components/           # 通用 UI 组件、Shell、Modal、Tabs、图表
│   │   │   ├── routes/               # 用户端与后台页面
│   │   │   ├── routes/admin/         # 运营后台页面
│   │   │   └── styles/               # tokens/base/components/client/admin CSS
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── api/                         # Go 单体 API
│       ├── cmd/server/               # API 入口
│       ├── internal/server/          # Handler、Store、模型适配、鉴权、计费
│       ├── migrations/               # PostgreSQL 迁移
│       └── Dockerfile
├── docs/
│   ├── TECH_SELECTION.md             # 技术架构
│   └── design-system.md              # 产品界面规范
├── docker-compose.yml
├── package.json
└── go.work
```

---

## 3. 技术架构

```text
React/Vite Web
  -> Nginx
  -> Go HTTP API
  -> PostgreSQL
  -> Redis
  -> 本机 uploads 卷
  -> 外部模型供应商 OpenAI-compatible / 自定义适配器
```

固定技术选型：

- 前端：React 18 + Vite + TypeScript。
- UI：沿用自研 CSS tokens，不引入大型 UI 框架。
- 后端：Go 单体 API，标准库 HTTP 路由。
- 数据库：PostgreSQL，保存用户、会话、消息、模型、积分、审计日志。
- 缓存：Redis，用于匿名聊天次数、登录失败限流等短期状态。
- 部署：VPS 使用 Docker Compose。
- 模型配置：供应商、模型、默认模型、积分策略都存入 PostgreSQL，通过后台管理维护。

详细技术约束见 [docs/TECH_SELECTION.md](docs/TECH_SELECTION.md)。

---

## 4. 功能清单

### 用户端

- 账号注册与登录：手机号或邮箱 + 密码 + 确认密码。
- 未登录试用：默认允许 3 次匿名对话，可通过 `ANONYMOUS_CHAT_LIMIT` 调整。
- 多模型聊天：模型下拉显示模型 ID 和供应商。
- 流式对话体验：发送后显示生成中状态，支持历史会话恢复。
- 会话历史：最近列表、搜索、删除会话、删除单轮问答。
- Markdown 渲染：支持代码块、表格、Mermaid 图表、外链新窗口打开。
- 生图：选择图片模型、生成状态、历史记录、预览放大、重试、删除。
- 个人中心：个人资料、头像上传、积分流水、安全设置。

### 运营后台

- 仪表盘：用户、会话、积分、模型使用与系统健康。
- 模型服务：供应商接入、拉取模型、导入模型、分类列表、默认模型、权重排序、连通性测试。
- 积分策略：按次和按 Token 两类策略，按文字、图片、语音、其他分类计费。
- 用户管理：用户列表、详情、会话内容、登录历史、重置密码、积分调整、禁用/恢复。
- 生成记录：聊天、生图、语音记录与错误详情。
- 积分流水：全局积分变化查询与导出。
- 系统日志：真实访问日志、审计日志、模型调用日志。

---

## 5. 页面清单

### 用户端

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 聊天 | 未登录可试用，登录后保留会话历史 |
| `/c/:id` | 历史会话 | 加载并继续指定会话 |
| `/image` | 生图 | 图片生成、历史、预览、重试、删除 |
| `/image/:id` | 生图记录 | 查看指定生图记录 |
| `/profile` | 个人中心 | 用户资料、积分、安全入口 |
| `/profile/info` | 个人资料 | 昵称、账号、方案、头像 |
| `/profile/security` | 安全 | 修改密码 |
| `/points` | 积分流水 | 用户积分变化 |
| `/help` | 帮助中心 | 常见说明 |
| `/terms` | 服务条款 | 内置协议说明 |

### 运营后台

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/admin/login` | 后台登录 | 管理员账号密码登录 |
| `/admin/dashboard` | 仪表盘 | 运营数据与健康状态 |
| `/admin/model-service` | 模型服务 | 供应商、模型、积分策略 |
| `/admin/users` | 用户管理 | 用户列表、筛选、导出 |
| `/admin/users/:id` | 用户详情 | 资料、会话、生成、积分、登录历史 |
| `/admin/generations` | 生成记录 | 聊天、生图、语音记录 |
| `/admin/points-log` | 积分流水 | 全局积分流水 |
| `/admin/system-logs` | 系统日志 | 访问、审计、系统、模型日志 |

---

## 6. 配置说明

`.env` 只保存基础设施和安全配置，不保存供应商、模型、模型价格、默认模型等业务配置。Docker 部署使用 `POSTGRES_*` 生成 API 的 `DATABASE_URL`；本地非 Docker 开发如需覆盖默认连接，可额外设置 `DATABASE_URL`、`REDIS_ADDR` 和 `UPLOAD_DIR`。

| 变量 | 说明 |
| --- | --- |
| `WEB_PORT` | Docker Web 暴露端口，默认 `8080` |
| `POSTGRES_DB` | PostgreSQL 数据库名 |
| `POSTGRES_USER` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码，生产必须修改 |
| `APP_SECRET` | Provider Key 加密密钥，生产必须使用长随机值 |
| `ADMIN_ACCOUNT` | 初始管理员账号，默认 `admin` |
| `ADMIN_PASSWORD` | 初始管理员密码，生产必须设置强密码 |
| `CORS_ALLOWED_ORIGINS` | 允许访问 API 的前端域名白名单 |
| `ANONYMOUS_CHAT_LIMIT` | 未登录匿名聊天次数，默认 `3`，设为 `0` 可关闭 |
| `SEED_DEMO_USER` | 是否创建演示用户，默认 `false` |
| `SESSION_TTL_HOURS` | 登录会话有效期，默认 `168` 小时 |
| `VITE_API_BASE_URL` | 前端构建时 API 地址，Docker 同源反代模式保持空 |

---

## 7. 安全约定

- Provider API Key 使用 AES-GCM 加密存入 PostgreSQL，前端只展示脱敏值。
- 用户密码使用 bcrypt 哈希保存，数据库不保存明文密码。
- 登录 Token 只在浏览器保存原文，数据库保存 Token 哈希。
- 前后台 Token 分离存储，避免用户端和后台互相覆盖登录态。
- 后台 API 必须管理员 Token，普通用户访问返回 403。
- 生产公网监听时，弱 `APP_SECRET`、默认管理员密码、`*` CORS 会阻止 API 启动。
- 登录失败会限流，匿名聊天次数通过 Redis 限制。
- 普通 JSON 请求体默认限制 4MB；multipart 上传限制 25MB；头像单文件限制 8MB。
- 本地上传文件存入 `UPLOAD_DIR`，Docker 环境写入 `api-uploads` 卷。

---

## 8. 开发命令

```bash
npm --prefix apps/web install
npm run dev:api
npm run dev:web
npm run test:api
npm run test:web
npm run build:web
```

单独执行：

```bash
go test ./apps/api/...
npm --prefix apps/web run test
npm --prefix apps/web run build
```

---

## 9. 发布流程

1. 从根目录 `.env.example` 复制 `.env`。
2. 设置 `.env` 中的强密码和域名白名单。
3. 确认 VPS 已安装 Docker 和 Docker Compose。
4. 执行 `docker compose up -d --build`。
5. 访问 `/healthz` 确认 API、PostgreSQL、Redis 正常。
6. 使用管理员账号进入 `/admin/login`。
7. 在后台模型服务中新增供应商、拉取模型、导入模型并设置默认模型。
8. 完成一次真实聊天、生图、积分扣费和后台记录核对。

---

## 10. 走查清单

- 注册、登录、退出、修改密码可用。
- 未登录对话 3 次后弹出登录/注册弹窗。
- 登录后新会话进入最近列表，历史会话可继续对话。
- 模型服务可新增供应商、拉取模型、导入模型、单模型测试。
- 默认模型必须是所有人可见模型。
- 图片模型不会在“测试当前供应商非图片模型”中被批量测试。
- 生图记录可查看、放大、重试、删除。
- 用户详情能查看会话内容、生成记录、积分流水、登录历史。
- 系统日志显示真实访问、审计和模型调用记录。
- 浅色和深色模式下按钮、弹框、Markdown、Mermaid 图表显示正常。
