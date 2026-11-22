# Model Token Usage Monitor

[English](./README_en.md) | 简体中文

一款用于 Microsoft Edge / Chromium 浏览器的 Manifest V3 扩展程序，在统一的弹出面板中实时查看 **Antigravity**、**Gemini Web**、**腾讯云 TokenHub** 与 **鹅厂 Token（token.woa.com）** 的模型 Token 及配额使用率。

## 核心特性

- **多渠道统一看板**：双栏自适应布局，集中展示各渠道的配额使用进度条、剩余/已用额度、重置时间与状态标签。
- **即开即用与后台刷新**：打开 Popup 时优先展示本地缓存快照，同时静默拉取最新实时数据；支持全部刷新与单渠道独立刷新。
- **支持渠道**：
  - **Antigravity**：基于浏览器登录态 Cookie（`SAPISIDHASH` 鉴权）拉取 `GetUserQuotaSummary`，从官方客户端自动发现查询 API Key，按模型分组展示 5 小时窗口与周窗口配额，无需手动填写 Key。
  - **Gemini Web**：基于浏览器登录态拉取 `GEMINI_WEB_GRAPHQL` 用量信息，展示订阅等级与 5 小时 / 周窗口配额池使用率。
  - **腾讯云 TokenHub**：使用 TC3-HMAC-SHA256 签名直连 `DescribeTokenPlanPersonalPackage` 接口，支持 `TokenPlan 个人版`（`personal`）与 `TokenPlan 个人版 · 混元`（`personal-hunyuan`），并在设置页提供凭据连通性测试。
  - **鹅厂 Token**：复用浏览器 OA 登录态，优先在后台获取首页中的临时 `X-Page-Token` 并直接调用 `query-quota?platform=all`，无需打开看板网页。后台会话不可用时才在已登录标签页内查询；没有可用标签页时通过临时后台标签页恢复查询并自动关闭。展示本月全部产品的费用额度使用百分比及人民币已用/剩余额度。百分比使用看板的 `personal.usage_rate`，不是原始 Token 数量占比；接口未提供重置时间时不展示倒计时。
- **参数自动捕获（Auto-Capture）**：后台 Service Worker 会监听正常标签页对 Antigravity 与 Gemini Web 的请求，自动同步 `authUser`、`apiKey`、`querySignature`、`x-goog-ext-525001261-bin` 等动态参数，减少手动配置成本。
- **个性化配置**：支持在设置页开启/关闭特定渠道、调整渠道展示顺序，所有配置与缓存均保存在本地 `chrome.storage.local`。
- **开发者选项**：默认关闭，开启并保存后才显示渠道卡片中的「查看原始响应」折叠栏。

## 技术栈

- **前端框架**：React 19 + TypeScript + Tailwind CSS v4 + Lucide React
- **构建工具**：Vite（分别构建 Popup 与 Background Service Worker）
- **测试框架**：Vitest
- **扩展规范**：Manifest V3（`cookies`、`storage`、`declarativeNetRequestWithHostAccess`、`webRequest`、`scripting`）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建扩展

```bash
npm run build
```

构建产物将输出至 `dist/` 目录。开发调试时可使用监听模式：

```bash
npm run dev
```

### 3. 加载到浏览器（Edge / Chrome）

1. 打开 `edge://extensions`（或 `chrome://extensions`）。
2. 开启右上角 **开发人员模式（Developer mode）**。
3. 点击 **加载解压缩的扩展（Load unpacked）**，选择项目根目录下的 `dist/` 文件夹。
4. 点击浏览器工具栏中的扩展图标即可打开监控面板。

## 使用说明

- **Antigravity**：确保已在当前浏览器中登录对应网页版账号；若提示未认证或参数过期，访问一次对应网页触发请求后，扩展会自动捕获最新请求参数。
- **Gemini Web**：查询签名和客户端请求头默认留空，不内置固定值。安装扩展后，请在当前浏览器登录 Gemini，并打开或刷新其用量页面触发用量请求；扩展自动捕获参数后，刷新面板即可查询。缺少参数时会显示引导提示，已捕获的参数仅保存在本地浏览器中。
- **腾讯云 TokenHub**：点击面板右上角设置图标，填入腾讯云 `SecretId`、`SecretKey`、地域（默认 `ap-guangzhou`）并勾选需要查询的套餐类型，可点击测试按钮验证配置后保存。
- **鹅厂 Token**：在当前浏览器打开 `https://token.woa.com/` 完成 OA 登录后，刷新扩展即可查看，无需填写 API Key。该渠道默认开启，也可在设置中关闭或调整顺序。登录过期时提供登录入口；无限额度或额度隐藏时提示无法计算百分比。
- **升级现有扩展**：构建后在扩展管理页重新加载 `dist/`，并允许扩展访问 `token.woa.com` 和 `www.gstatic.com`。新增 `scripting` 权限用于在看板页面内查询，Google 官方静态资源权限用于自动获取 Antigravity 查询参数。

鹅厂 Token的正常刷新仅在后台进行两次 HTTP 请求：读取首页中的临时令牌，再调用配额 API，不需要打开标签页。配额接口会拒绝扩展后台生成的 `Sec-Fetch-Site: none`；DNR 规则仅对插件自身的这一配额请求移除该请求头，仍携带 OA Cookie 和 `X-Page-Token`。登录过期时仍需打开网页完成 OA 认证。

## 常用脚本

```bash
npm run typecheck   # TypeScript 类型检查 (tsc --noEmit)
npm test            # 运行 Vitest 单元测试
npm run build       # 类型检查并构建 Popup 与 Background 产物
```

## 目录结构

```text
├── public/                 # manifest.json 与扩展图标资源
├── src/
│   ├── background/         # Service Worker、DNR 请求头规则与参数自动捕获
│   ├── popup/              # Popup 界面与设置页组件
│   ├── providers/          # Antigravity / Gemini Web / TokenHub / 鹅厂 Token数据适配器
│   ├── types/              # 用量、渠道配置与消息通信类型定义
│   └── utils/              # 加密签名、格式化、布局分配与本地存储工具
├── tests/                  # Vitest 单元测试
├── vite.config.ts          # Popup 构建配置
└── vite.background.config.ts # Background Service Worker 构建配置
```

## 隐私与安全

所有凭据（如腾讯云 `SecretId` / `SecretKey`）及缓存数据均仅保存在浏览器本地存储（`chrome.storage.local`）中，扩展仅直接向对应官方接口发起查询请求，不经过任何第三方中转服务器。
