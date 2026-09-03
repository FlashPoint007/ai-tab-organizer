# AI Tab Organizer

浏览器标签页 AI 自动整理插件：垂直侧边栏管理 + **大模型语义分类**，支持自定义云端 LLM API 与本机模型（Ollama / LM Studio）。

- 参考对象：VertiTab（规则式分组）。本项目在其基础能力之上加入 AI 分类管线。
- 最新版本：**v0.7.1** ｜ [下载安装包](https://github.com/FlashPoint007/ai-tab-organizer/releases/latest) ｜ 计划与路线图见 [docs/PLAN.md](docs/PLAN.md)

## 特性

- ✅ AI 自适应分类：先通读全部标签自行归纳细分类别（如「B站内部平台」「开发工具与监控」）再逐一分配；sha1 缓存省 token；没把握的自动回落规则
- ✅ 分类记忆：预览弹层里手动调整的类别自动沉淀为域名规则，同站点下次直接命中
- ✅ 实时归类：新标签打开后自动按 缓存 → 规则 → AI 归类入组，无需手动整理
- ✅ 多 Provider：DeepSeek / OpenAI / Kimi / GLM / Qwen / OpenRouter 云端预设 + 本机 **Ollama / LM Studio**（OpenAI 兼容协议一套通吃）
- ✅ 垂直标签侧边栏：搜索、列表/域名/分类三视图、多选批量（关闭/固定/静音/建组）、一键清理（重复/非活跃，自动存快照）、快照恢复
- ✅ 自动化：快捷键 Alt+Shift+O / 定时整理 / 未分组标签阈值三种触发器
- ✅ AI 整理预览确认弹层：逐条改类别、取消勾选后再应用
- ✅ 折叠组瘦身：折叠后组名压成窄色块（三档可选：缩写 / 只剩色点 / 全名）
- ✅ 备份导出导入：规则/分类/模型配置一键备份恢复（JSON）
- ✅ 界面：中英双语即时切换、暗色主题
- 🔒 隐私优先：安装时零 host 权限，调用模型前按域名动态请求授权；只发送标题与网址；API Key 仅存本地

## 安装

### 方式一：从 Release 下载（推荐，无需环境）

到 [Releases 页面](https://github.com/FlashPoint007/ai-tab-organizer/releases/latest) 下载对应安装包。

**Chrome / Edge**（Chrome 不支持双击 zip 安装，需解压后加载）：

1. 下载 `ai-tab-organizer-<版本>-chrome.zip` 并解压
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
3. 打开右上角「开发者模式」
4. 点「加载已解压的扩展程序」，选中解压出的文件夹

**Firefox**：

1. 下载 `ai-tab-organizer-<版本>-firefox.zip`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点「临时加载附加组件」，选中该 zip（或其中的 manifest.json）

### 方式二：本地构建

```
pnpm install
pnpm zip              # 产出 .output/ai-tab-organizer-<版本>-chrome.zip
pnpm zip -b firefox   # 产出 firefox 包
```

## 配置模型

装好扩展后，打开扩展的**设置页**（扩展管理页点「扩展选项」，或侧边栏内进入），在「AI 模型」区选择服务商并填写。两条路线任选：

### A. 云端 API（开箱即用，按量付费）

在设置页「服务商」下拉里选预设，`Base URL` 与默认模型会自动填好，只需粘贴自己的 **API Key**，点「授权并保存」→「测试连接」即可。

| 服务商 | Base URL | 默认模型 | API Key 申请入口 |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | <https://platform.deepseek.com/api_keys> |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | <https://platform.openai.com/api-keys> |
| Kimi（Moonshot） | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | <https://platform.moonshot.cn/console/api-keys> |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | <https://open.bigmodel.cn/usercenter/apikeys> |
| 阿里通义 Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | <https://bailian.console.aliyun.com/?apiKey=1> |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | <https://openrouter.ai/keys> |
| 自定义 | 自填 | 自填 | 任意 OpenAI 兼容端点 |

> 💡 **省钱/免费建议**：`glm-4-flash`（智谱）目前免费额度充足；DeepSeek `deepseek-chat` 单价极低，整理几十个标签通常不到一分钱。分类结果会按 URL 缓存（14 天 TTL），同一页面不重复计费。

**自定义端点**：任何兼容 OpenAI `POST /chat/completions` 协议的服务都能接——选「自定义…」，填入它的 `Base URL`（到 `/v1` 层级）、模型名和 Key 即可（如硅基流动、火山方舟、one-api 中转等）。

字段说明：

- **Base URL**：到 `/v1` 为止（GLM 例外，为 `/api/paas/v4`）；插件会自动拼接 `/chat/completions`。
- **模型**：填服务商的模型标识，可换成同家任意可用模型（如 DeepSeek 换 `deepseek-reasoner`）。
- **API Key**：仅保存在本地浏览器 `storage.local`，不会上传到任何第三方；保存时插件会按该域名动态申请访问授权（安装时零 host 权限）。
- **温度**：默认 0（分类任务追求稳定，不建议调高）。

### B. 本地模型（零成本、完全离线）

1. 安装并启动 [Ollama](https://ollama.com)，拉一个模型：`ollama pull qwen2.5:3b`
2. 设置页「服务商」选「Ollama（本机）」（`Base URL` 默认 `http://localhost:11434/v1`，无需 Key）→ 授权并保存 → 测试连接
3. LM Studio 同理：在其 Developer 标签启动本地服务（默认 `http://localhost:1234/v1`），服务商选「LM Studio（本机）」

详细步骤与模型推荐见 [docs/local-model-guide.md](docs/local-model-guide.md)。

## 使用

1. 点浏览器工具栏的扩展图标（或按快捷键 `Alt+Shift+O`）打开侧边栏
2. 侧栏点「✨ AI 整理」——默认会弹出**预览确认**：逐条可改类别、取消勾选，确认后按类别建 Chrome 标签组
3. 想全自动：设置页「自动整理与界面」里开「实时归类」（新标签自动归位）或「定时/阈值」触发器；也可勾「AI 整理直接生效」跳过预览
4. 分错了就在预览里改一下——**分类记忆**会把你的调整存成规则，同站点下次自动命中
5. 不想用 AI 时，「按域名分组」「按类别分组（规则）」纯本地可用，断网也能整理

其它：`清理重复`/`清理非活跃` 会先自动存快照可随时恢复；折叠标签组后组名会瘦身（设置页「折叠组名」可切换缩写/色点/全名）。

## 隐私说明

本扩展不收集、不上传任何数据到开发者服务器。AI 分类时**仅向你自行配置的模型服务**发送标签页的标题与网址；所有设置、分类缓存与快照仅存于本地浏览器。安装时不申请任何网站访问权限，只有在你保存某个模型端点时才按其域名动态申请授权。

## 开发

```
pnpm install
pnpm dev          # 开发模式（WXT HMR，浏览器加载扩展调试）
pnpm compile      # tsc --noEmit 类型检查
pnpm lint         # eslint
pnpm test         # vitest 单测
pnpm build        # 产出 .output/chrome-mv3
pnpm build -b firefox   # Firefox 目标（MV2 事件页）
pnpm zip          # 商店/发布打包 → .output/*.zip
node scripts/generate-icons.mjs   # 重新生成图标
```

## 架构一览

- Background SW：TabRegistry（session 持久化+对账）/ TabEventHub（防抖广播）/ 消息路由（zod 校验协议）/ 实时归类 / 折叠组管理 / 快照与自动触发器
- AI 管线：缓存命中 → 批量并发 → 四级容错解析 → 写回缓存 → 失败批次回落规则引擎
- LLM 客户端：OpenAI 兼容 fetch，超时 + 指数退避重试（遵从 Retry-After）+ 并发池
- UI：React 18 侧边栏 + Options；i18n zh/en；Tailwind 暗色主题

详见 [docs/PLAN.md](docs/PLAN.md)（含 VertiTab 逆向调研与全部里程碑记录）。

## License

MIT
