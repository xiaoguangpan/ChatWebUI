# UI 设计规范 · Design System

> 适用于"对话聊天 + 对话生图"Web 应用。**移动端优先**，PC 端在大屏幕下展开。整体风格参考 ChatGPT：深色为主、克制的高对比、圆润的卡片与按钮、留白充足。

---

## 1. 设计原则

1. **移动优先 (Mobile First)**：所有页面先在 320–430px 宽度下完成，再扩展到 PC。
2. **触控友好**：可点击区域 ≥ 44×44px,主要操作放在大拇指可及区域(屏幕底部)。
3. **少即是多**：颜色克制(以中性灰为主)、按钮形态统一、不过度装饰。
4. **状态明确**:hover/active/focus/disabled 必须有可见反馈。
5. **可主题化**:通过 CSS 变量切换 暗 / 亮 主题。

---

## 2. 色彩 (Color Tokens)

### 2.1 暗色主题(默认)

| Token | Hex | 用途 |
| --- | --- | --- |
| `--bg-canvas` | `#212121` | 主背景(对话区) |
| `--bg-sidebar` | `#181818` | 侧边栏背景 |
| `--bg-elevated` | `#2f2f2f` | 卡片、输入框、Modal |
| `--bg-hover` | `#2a2a2a` | 列表项 hover |
| `--bg-active` | `#3a3a3a` | 列表项选中 |
| `--bg-overlay` | `rgba(0,0,0,0.55)` | Modal 遮罩 |
| `--text-primary` | `#ECECEC` | 主要文本 |
| `--text-secondary` | `#B4B4B4` | 次要文本 |
| `--text-tertiary` | `#8E8E8E` | 占位、辅助说明 |
| `--text-disabled` | `#6B6B6B` | 禁用文本 |
| `--text-inverse` | `#0D0D0D` | 浅色按钮上的深色文字 |
| `--border-subtle` | `#2d2d2d` | 极淡分割线 |
| `--border-default` | `#3d3d3d` | 常规边框 |
| `--border-strong` | `#525252` | 强调边框、focus |

### 2.2 功能色 (Semantic)

| Token | Hex | 用途 |
| --- | --- | --- |
| `--brand` | `#10A37F` | 品牌强调、链接 |
| `--success` | `#22C55E` | 成功 |
| `--warning` | `#F0B72F` | 警告 |
| `--danger` | `#EF4444` | 错误、删除 |
| `--info` | `#3B82F6` | 信息 |

### 2.3 亮色主题(可选)

| Token | Hex |
| --- | --- |
| `--bg-canvas` | `#FFFFFF` |
| `--bg-sidebar` | `#F4F4F4` |
| `--bg-elevated` | `#F9F9F9` |
| `--text-primary` | `#0D0D0D` |
| `--text-secondary` | `#5D5D5D` |
| `--border-default` | `#E5E5E5` |

---

## 3. 字体 (Typography)

### 3.1 字体族

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
  "Helvetica Neue", Arial, sans-serif;
```

代码: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### 3.2 字号 / 行高 / 字重

| Token | Size | Weight | Line Height | 用途 |
| --- | --- | --- | --- | --- |
| `--fs-display` | 32px | 700 | 1.2 | 空状态主标题 |
| `--fs-h1` | 28px | 600 | 1.25 | 页面标题 |
| `--fs-h2` | 24px | 600 | 1.3 | 模块标题 |
| `--fs-h3` | 20px | 600 | 1.35 | 卡片标题 |
| `--fs-h4` | 18px | 600 | 1.4 | 列表分组 |
| `--fs-h5` | 16px | 600 | 1.5 | 强调小标题 |
| `--fs-body-lg` | 16px | 400 | 1.6 | 对话文本 |
| `--fs-body` | 14px | 400 | 1.6 | 正文、表单 |
| `--fs-body-sm` | 13px | 400 | 1.5 | 次要说明 |
| `--fs-caption` | 12px | 400 | 1.4 | 时间戳、标签 |

### 3.3 字间距

- 中文/正文:`letter-spacing: 0`
- 英文大标题:`letter-spacing: -0.01em`
- 全大写标签:`letter-spacing: 0.04em`

---

## 4. 间距 (Spacing) · 4px 基准

| Token | Value | Token | Value |
| --- | --- | --- | --- |
| `--sp-0` | 0 | `--sp-5` | 20px |
| `--sp-1` | 4px | `--sp-6` | 24px |
| `--sp-2` | 8px | `--sp-8` | 32px |
| `--sp-3` | 12px | `--sp-10` | 40px |
| `--sp-4` | 16px | `--sp-12` | 48px |

页面容器内边距:移动端 16px,PC 端 24–32px。

---

## 5. 圆角 / 阴影 / 层级

### 圆角

| Token | Value |
| --- | --- |
| `--radius-sm` | 6px |
| `--radius-md` | 10px |
| `--radius-lg` | 14px |
| `--radius-xl` | 20px |
| `--radius-2xl` | 28px |
| `--radius-pill` | 9999px |

### 阴影

| Token | Value |
| --- | --- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.2)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.28)` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,.36)` |

### Z-index

| Layer | Value |
| --- | --- |
| dropdown | 100 |
| sticky | 200 |
| drawer | 300 |
| modal | 400 |
| toast | 500 |

---

## 6. 断点 (Breakpoints)

```css
/* 移动优先 */
--bp-sm: 640px;   /* 大手机 / 小平板 */
--bp-md: 768px;   /* 平板竖屏 */
--bp-lg: 1024px;  /* 平板横屏 / 笔电 */
--bp-xl: 1280px;  /* 桌面 */
```

布局策略:
- `< 768px`: 单列、底部输入条、抽屉式侧边栏
- `≥ 1024px`: 左侧固定侧边栏(260px)、中间主区
- `≥ 1280px`: 主区限宽 768–820px 居中(对话最佳阅读宽度)

---

## 7. 组件规范

### 7.1 按钮

| 类型 | 视觉 | 用途 |
| --- | --- | --- |
| Primary | 白底黑字(`#fff`/`#0d0d0d`) | 提交、确认 |
| Secondary | 透明底 + 1px 边框 | 次操作 |
| Ghost | 无边框,hover 出现底色 | 工具栏、菜单 |
| Danger | 红字 / 红底 | 删除等危险操作 |
| Icon | 圆形 / 圆角方形,仅图标 | 工具按钮 |

| 尺寸 | 高度 | 横向内边距 | 字号 |
| --- | --- | --- | --- |
| sm | 32px | 12px | 13px |
| md | 40px | 16px | 14px |
| lg | 48px | 20px | 16px |

- 圆角:默认 `--radius-pill`(胶囊),表单内按钮可用 `--radius-md`
- 禁用:opacity 0.5,`cursor: not-allowed`
- focus:2px 外环 `var(--border-strong)`

### 7.2 输入框

- 高度:sm 36 / md 44 / lg 52(触控推荐 ≥44)
- 背景:`--bg-elevated`,边框:`--border-default`
- focus:边框变 `--border-strong`,无大幅阴影
- 圆角:常规 `--radius-md`,聊天输入条 `--radius-2xl`
- 占位文字:`--text-tertiary`
- 错误态:边框 `--danger`,下方 12px 红色说明

### 7.3 聊天输入条(核心组件)

- 圆角胶囊 28px,内边距 12px
- 左侧 "+" 按钮(附件),右侧:模式选择(`进阶 ▾`)、麦克风、语音圆按钮
- 多行自适应:最小 1 行,最大 8 行,超出滚动
- 移动端固定在底部,避开输入法(`env(safe-area-inset-bottom)`)

### 7.4 消息气泡

- 用户消息:右对齐,`--bg-elevated` 背景,圆角 18px
- AI 消息:左对齐,无背景,纯文本流(模仿 ChatGPT)
- 头像:32×32,圆形
- 最大宽度:对话区宽度的 90%(移动端),760px(PC)
- 消息间距:24px

### 7.5 卡片

- 背景:`--bg-elevated`
- 边框:`1px solid --border-default`(可选)
- 圆角:`--radius-lg`
- 内边距:移动端 16px,PC 端 20–24px

### 7.6 Modal / 弹框

- 居中,最大宽度 480px(确认类) / 720px(表单类)
- 圆角 `--radius-xl`,内边距 24px
- 标题 H3,关闭按钮右上角 icon 按钮
- 遮罩 `--bg-overlay`,点击关闭可选
- 移动端 < 640px 时改为 **底部抽屉**(bottom sheet),顶部带 4px 灰色把手

### 7.7 Toast

- 顶部居中(移动)/ 右上(PC),距边缘 16px
- 圆角 `--radius-md`,自动 3s 消失
- 类型:info / success / warning / danger,左侧 4px 色带

### 7.8 表格(管理后台)

- 行高 48px,单元格 padding 12px 16px
- 表头:`--text-secondary`,大写 12px,字间距 0.04em
- 斑马纹:可选,偶数行 `rgba(255,255,255,0.02)`
- 行 hover:`--bg-hover`
- 操作列右对齐,使用 Ghost / Danger 按钮

### 7.9 标签 / Badge

- 高度 22px,padding 0 8px,圆角 pill
- 字号 12px,字重 500
- 状态色:绿(在线/成功)、黄(待处理)、红(失败)、灰(默认)

### 7.10 导航

- **移动端顶栏**:52px,左 hamburger / 右 新建 + 用户
- **移动端底栏**(管理后台备选):64px,4 个图标项
- **PC 侧栏**:260px,纯色,顶部 logo + 折叠按钮,中部一级菜单 + 历史列表,底部用户卡片
- **管理后台侧栏**:240px,白/灰底,支持二级菜单展开

---

## 8. 图标

- 统一使用 **Lucide** 图标库(线性,1.5px stroke)
- 默认尺寸 20×20,小尺寸 16×16,大尺寸 24×24
- 颜色继承文本色 `currentColor`

---

## 9. 动效

- 时长:micro 120ms / base 200ms / large 320ms
- 缓动:`cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- 仅对 opacity / transform / color / background 做过渡,避免 layout
- 用户偏好:遵守 `prefers-reduced-motion: reduce`

---

## 10. 无障碍

- 文本与背景对比 ≥ 4.5:1(正文)、≥ 3:1(大字)
- 所有可交互元素可键盘聚焦,可见 focus ring
- 图标按钮必须有 `aria-label`
- 表单错误使用 `aria-invalid` + `aria-describedby`

---

## 11. 命名约定

- CSS 变量:`--<category>-<role>`,如 `--bg-canvas`、`--fs-h1`
- 组件类:`.c-<name>`(如 `.c-btn`、`.c-input`)
- 工具类:`.u-<name>`(如 `.u-flex`、`.u-mt-4`)
- 状态类:`.is-active`、`.is-disabled`、`.has-error`
- JS hook:`data-*` 属性,如 `data-action="open-modal"`
