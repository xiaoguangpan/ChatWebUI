# 智聊 · 静态 HTML 原型

> 对话聊天 + 对话生图 Web 应用 · **移动端优先** · 含用户端与运营后台共 17 个页面。
>
> 本仓库是技术选型前的**纯静态 HTML / CSS / 原生 JS** 原型,用于走查交互、信息架构与 UI 规范。

---

## 1. 快速开始

本项目是纯静态原型,不依赖后端服务。推荐从 `index.html` 进入导航页,再点击查看用户端、运营后台和设计资产。

### 方案一:直接静态打开

直接用浏览器打开项目根目录下的 `index.html`。

适合快速走查页面和离线预览。`UI 设计规范`、`Design Tokens (CSS 变量)`、`README` 已提供离线预览入口,无需启动本地服务。

### 方案二:使用 Python 内置静态服务

如果希望以本地 HTTP 地址访问,可在项目根目录执行:

```bash
python -m http.server 5500
```

然后打开 [http://localhost:5500](http://localhost:5500)。

---

## 2. 目录结构

```
ChatGPTWebUI/
├── index.html                      # 全部页面的导航入口 (推荐入口)
├── README.md
├── docs/
│   └── design-system.md            # ★ UI 设计规范 (色彩/字体/间距/组件)
├── assets/
│   ├── css/
│   │   ├── tokens.css              # Design Tokens (CSS 变量 + 暗/亮主题)
│   │   ├── base.css                # reset + 全局排版
│   │   ├── components.css          # 按钮、输入框、卡片、Modal、Toast...
│   │   ├── client.css              # 用户端聊天/生图布局
│   │   └── admin.css               # 管理后台布局
│   └── js/
│       └── common.js               # 主题切换 / Modal / Toast / SVG 图标 / 抽屉
├── client/                         # 用户端 (移动优先)
│   ├── chat.html                   # 新聊天 (居中欢迎语 + 输入条 + 快捷动作)
│   ├── conversation.html           # 对话进行中 (含 AI 回复 / 代码块 / 操作工具栏)
│   ├── image.html                  # 生成图片 (表单 + 历史作品网格)
│   ├── history.html                # 历史记录 (按日期分组)
│   ├── profile.html                # 我的 (含积分卡 / 设置 / 退出弹框)
│   ├── points.html                 # 积分流水
│   ├── login.html                  # 登录
│   └── register.html               # 注册
└── admin/                          # 运营后台
    ├── _partials.js                # 共享侧栏与顶栏 (无需重复粘贴)
    ├── login.html                  # 管理员登录 (含 2FA)
    ├── dashboard.html              # ★ 仪表盘 (含 Canvas 折线 + 环图)
    ├── ai-models.html              # AI 对话模型管理 (含编辑弹框)
    ├── image-models.html           # 生图模型管理
    ├── users.html                  # 用户管理 (含调整积分弹框)
    ├── user-detail.html            # 用户详情
    ├── generations.html            # 生成记录 (对话 + 生图)
    ├── points-log.html             # 积分流水
    ├── api-logs.html               # API 调用日志
    └── system-logs.html            # 系统日志 (控制台风格)
```

---

## 3. 设计要点

### 移动优先

- 所有页面先在 320–430px 宽度下完成,断点 ≥ 1024px 才出现侧栏 / 多列。
- 触控目标 ≥ 44×44px,主要操作贴底,留出 `env(safe-area-inset-bottom)`。
- Modal 在 < 640px 自动变身**底部抽屉**(顶部 4px 把手)。

### 暗色为默认

切换主题:页面右上角"切换主题"按钮,或 `localStorage.setItem('app-theme','light')`。

### Design Tokens 驱动

所有色彩、字号、间距、圆角都来自 `assets/css/tokens.css` 的 CSS 变量,
修改一处即可全局生效。详见 [`docs/design-system.md`](docs/design-system.md)。

### 零依赖

无任何外部 CDN / npm 包。SVG 图标内联于 `common.js`,折线图与环图为手写 Canvas,可离线运行。

---

## 4. 页面清单

### 用户端 (8)

| 页面 | 移动布局 | PC 布局 |
| --- | --- | --- |
| `chat.html` | 顶栏 + 中间欢迎语 + 底部三按钮 + 输入条 | 左侧栏 260px + 中间居中 |
| `conversation.html` | 全屏消息流 + 底部输入条 | 同上 + 内容限宽 768px |
| `image.html` | 表单卡 + 2 列作品网格 | 表单卡 + 3–4 列网格 |
| `history.html` | 搜索 + 分组列表 | 同上,内容居中限宽 |
| `profile.html` | 头像卡 + 积分卡 + 设置列表 | 同上,留白更大 |
| `points.html` | 积分卡 + Tab + 分组流水 | 同上 |
| `login.html` / `register.html` | 居中卡片 (max-width 400) | 同上 |

### 管理后台 (10)

| 页面 | 关键交互 |
| --- | --- |
| `login.html` | 账号 + 密码 + 2FA |
| `dashboard.html` | 4 项核心数据 · Canvas 折线 · 环图 · 系统健康 |
| `ai-models.html` | 卡片网格 · 启用开关 · 编辑弹框 (endpoint/key/价格/人设) |
| `image-models.html` | 同上,针对生图模型 |
| `users.html` | 表格 · 多筛选 · 调整积分弹框 |
| `user-detail.html` | 左侧资料 + 右侧多 Tab 数据 |
| `generations.html` | 完整记录,按对话/生图分类 |
| `points-log.html` | 全类型积分流水,4 项概览 |
| `api-logs.html` | 上游 API 调用,带方法/状态/耗时着色 |
| `system-logs.html` | 控制台样式 INFO/WARN/ERROR/DEBUG |

---

## 5. 后续技术选型建议

确认本套静态原型 UI 后,推荐演进路径(供决策时参考):

| 维度 | 推荐 | 备选 |
| --- | --- | --- |
| **前端框架** | Vue 3 + Vite (生态友好、模板贴近 HTML) | React 18 + Vite |
| **UI 库** | 自研基于本设计系统封装 + 引入 [Lucide](https://lucide.dev) 图标 | Naive UI / shadcn |
| **跨端方案** | [Tauri](https://tauri.app) → PC 安装包<br/>[Capacitor](https://capacitorjs.com) → Android/iOS 安装包 | Electron / React Native |
| **状态/请求** | Pinia + 原生 `fetch` + SSE | Tanstack Query |
| **样式** | 继续使用本 tokens.css + 组件 CSS,可选迁移到 UnoCSS / Tailwind | CSS-in-JS |
| **后端** | Node.js (NestJS) 或 Python (FastAPI) | Go (Gin) |
| **数据库** | PostgreSQL + Redis | MySQL |
| **图标** | Lucide (与 common.js 内置图标一致) | Tabler |
| **图表** | Chart.js / ECharts (替换 dashboard 中的手写 Canvas) | Recharts |
| **AI 接入** | OpenAI 兼容接口 + Anthropic SDK,流式 SSE | LangChain.js |
| **生图接入** | OpenAI Images / Replicate API / 本地 ComfyUI | SD-WebUI API |

### 包装为安装包

1. 将整个站点保持纯 HTML/CSS/JS 即可被 **Capacitor** 直接打包为 Android APK / iOS IPA。
2. PC 端使用 **Tauri**(体积约 5MB)或 Electron。
3. WebView 内通过 `window.bridge` 注入本地能力(如分享、文件保存)。

---

## 6. 已知约定

- 所有日期、用户名、对话内容均为**示例数据**。
- 所有 `<form>` 不会实际提交,登录按钮直接跳转到 `chat.html` / `dashboard.html` 以便走查。
- 切换主题保存在 `localStorage.app-theme`。
- 侧栏在窄屏下点击遮罩或主体外区域自动收起。

---

## 7. 走查清单 (建议)

- [ ] 在 iPhone SE / iPhone 15 / iPad / 1280 PC 四档屏幕分别走完所有页面
- [ ] 在 Chrome / Safari / 微信 H5 测试输入框聚焦后的虚拟键盘遮挡情况
- [ ] 切换暗色 / 亮色主题,确认对比度
- [ ] 验证表格在窄屏下是否横向滚动
- [ ] 验证 Modal 在 < 640px 是否变为底部抽屉
- [ ] 验证侧栏抽屉的开/关动画

走查无问题后即可进入正式技术选型与开发。
