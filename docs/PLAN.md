# AI Tab Organizer（暂名）— 项目计划书

> 目标：做一个「浏览器标签页自动整理 + AI 智能分类」的浏览器插件。
> 参考对象：VertiTab（已逆向调研，见 §2）。核心差异化：**接入可自定义的大模型 API / 本地模型做语义级标签分类** —— VertiTab 只有规则分类，没有任何 AI。

---

## 1. 需求与范围

### 1.1 核心需求（用户原话拆解）
1. 自动整理浏览器网页标签（垂直侧边栏管理、一键分组/排序/清理）
2. 自动标签分类：用大模型按语义给每个标签页归类并自动分组
3. 可自定义接入的大模型 API（OpenAI / DeepSeek / Kimi / GLM / Qwen / OpenRouter 等 OpenAI 兼容端点）
4. 支持部署本地模型（Ollama / LM Studio / vLLM 等 OpenAI 兼容本地服务）
5. 用 Git 管理，托管到 GitHub（账号 FlashPoint007）

### 1.2 锁定的假设与默认值
| 假设 | 默认值 |
|---|---|
| 目标浏览器 | Chrome / Edge 优先（Chromium MV3），Firefox 后续适配（WXT 一键切目标） |
| UI 形态 | Side Panel 侧边栏为主界面 + Options 配置页；popup 仅作快捷入口 |
| 产品名 | 仓库 ai-tab-organizer，展示名后续可改 |
| 界面语言 | 中英双语（zh_CN 默认 + en），i18n 从第一天就做 |

### 1.3 不做什么（Non-goals for MVP）
- 不做云同步、账号体系、会员付费
- 不做 VertiTab 的 PiP 画中画、自动刷新、无痕清理等周边功能
- MVP 不读页面正文（只用 title+URL 分类），正文增强放 Phase 2

---

## 2. VertiTab 调研结论（逆向分析取证）

> 官方声明不开源：RabbitPair/vertitab_extension 只用于收集 issue。但该仓库 build/ 目录含完整构建产物和 source map，以下结论均来自对 manifest.json、CHANGELOG.md 与 sourcemap 内源码的直接取证。

### 2.1 技术栈
| 维度 | 结论 | 证据 |
|---|---|---|
| Manifest | MV3，Chrome >= 116 | manifest_version:3，minimum_chrome_version:'116' |
| 打包器 | Webpack（非 Vite/Rollup） | sourcemap 前缀 webpack://rabbitpair_extension/webpack/runtime/*；全局变量 webpackChunk |
| UI 框架 | React（JSX）函数组件 + Context Providers | 源文件 src/pages/App.jsx、SidePanel.jsx、Providers/{SettingsProvider,TranslationProvider,DndEnableProvider}.jsx |
| 状态管理 | 自研 store 单例模式（tabStore/siteStore/historyStore/snapshotStore/userStore 等），未用 redux/zustand/mobx | src/core/stores/*.js；三大状态库在 bundle 中 0 命中 |
| 工具库 | lodash-es | import { delay } from 'lodash-es' |
| i18n | i18next + 自研 TranslationProvider，70+ 语言包 | _locales/ 目录、bundle 中 i18next 特征 |
| 样式 | CSS/Sass（有 .css.map），未见 Tailwind 运行时特征 | css 目录、options.css.map |
| 存储 | chrome.storage 封装层（session/local 分离）+ unlimitedStorage | src/utils/chromeStorage.js、memoryStore.js、localCache.js |
| 云同步 | 自定义服务器 Provider + 加密 + 触发器管理（付费功能） | src/core/sync/{syncService, providers/customServerProvider, triggers/*} |

### 2.2 架构与权限
- 入口四件套：background.js(service_worker,module) + sidepanel.html/js + options.html/js + contentScript.js
- background 约 50 个模块：事件中枢 handleTabEvents.js（657 行）统一处理 tabs.onUpdated/onRemoved/onActivated 等；tabGroups.js 封装分组/折叠/排序；connectSidePanel.js 维持 SW 与 Panel 长连接保活
- contentScript 注入 all_urls + all_frames + document_start —— 用于媒体控制/PiP（bundle 体积大的主因）；另有 MAIN world 的 shadow.js 和 netflix.js 特判
- permissions: tabs, tabGroups, sidePanel, alarms, storage, unlimitedStorage, favicon；optional_permissions: history, search, bookmarks, readingList, cookies

### 2.3 「自动分组」原理 —— 关键发现：纯规则，无 AI
对四个 bundle 全文检索 openai / gpt / claude / gemini / anthropic / embedding / ollama 均 0 命中。它的分类实现：

1. 域名分组 groupTabsByDomain()：用 parseUrlGroupName(url) 取 hostname（去 www.）作为组名，同域聚合 chrome.tabs.group()，从 Chrome 预设 8 色轮询取色，再 chrome.tabGroups.update({title, color, collapsed:true})
2. 预设站点类别表：内置约 30 个内容品类（新闻/视频/电商/游戏/音乐/小说/教育/金融/招聘等，见 locale keys group_newsInformation 至 group_nsfw），靠内置站点清单匹配
3. 站点设置 Auto Join Group：用户手动为某站点指定固定分组，之后新开页面自动归组
4. 排序仅按域名/URL 字典序 sortTabsByDomain / sortTabsByURL

**结论：语义级「看标题就知道这页是干嘛的」分类能力是空白 —— 正是本项目的立足点。**

### 2.4 值得借鉴的实现细节
- SW 里维护 tabInfos: Map<tabId, TabInfo> 内存缓存 + chrome.storage 二级缓存，onUpdated 时 diff 更新
- 分组后 delay(50ms) + session 存储 ignoreEventsTabGroupIds，防止 onGrouped 回调风暴造成循环触发
- 快照 snapshot 机制：清理前保存标签集合，可恢复
- Side Panel 内容按需加载思路（长列表性能）
---
## 3. 本项目技术选型（决策记录）
| 决策点 | 选择 | 理由 |
|---|---|---|
| 扩展框架 | WXT（wxt.dev） | 当下最活跃的 WebExtension 构建框架：Vite 底座、HMR、约定式入口自动生成 manifest、多浏览器目标（chrome/firefox）、内置 zip 发布流。比照抄 VertiTab 的 Webpack 配置现代得多 |
| UI 框架 | React 18 + TypeScript | 生态最大、资料最多；类型化消息协议收益明显 |
| 样式 | Tailwind CSS | 快速出 UI，与 WXT 官方模板契合 |
| 包管理 | pnpm | 快、省盘 |
| 测试 | Vitest + @testing-library/react；SW 层逻辑抽纯函数便于单测 | 与 Vite 同源零配置 |
| LLM 接入 | OpenAI-compatible Chat Completions 统一协议 | OpenAI/DeepSeek/Kimi/GLM/Qwen/OpenRouter/Groq 及 Ollama/LM Studio/vLLM 本地服务全都兼容 POST {baseUrl}/chat/completions，一套客户端通吃 |
| 本地模型 | 文档引导 Ollama（http://localhost:11434/v1）为主，LM Studio 为辅 | 免 key、零成本、隐私 |
| 分类降级 | 规则引擎兜底 | 断网/无 key/超时时仍可用（借鉴 VertiTab 域名法） |
| 存储 | chrome.storage.local（设置/缓存）+ chrome.storage.session（运行态） | 无外部依赖 |

---
## 4. 系统架构

    ┌──────────────────────────── Browser ────────────────────────────┐
    │  [Side Panel React SPA]            [Options Page React]         │
    │   垂直标签列表/分组树/搜索          Provider·API Key·模型选择     │
    │   批量选择·拖拽·关闭·固定           分类类别管理·提示词微调        │
    │   [AI 整理]按钮·进度·结果预览       规则编辑·隐私开关·用量统计     │
    │        │                                  │                     │
    │        +──── typed RPC runtime.sendMessage ─────+               │
    │                                           │                      │
    │  [Background Service Worker module] <─────┘                      │
    │   · TabEventHub: onCreated/Updated/Activated/Removed/Grouped     │
    │   · TabRegistry: Map<tabId,TabMeta> 内存缓存+storage 持久缓存     │
    │   · OrganizerService:                                            │
    │       rules(域名/关键词兜底) → cache(URL→category) → LLM批量分类  │
    │   · GroupManager: tabs.group / tabGroups.update / move           │
    │   · SnapshotService: 清理前快照/恢复                              │
    │   · LlmClient: OpenAI 兼容 fetch,超时/退避重试/并发池/用量统计     │
    └──────────────────────────────┬───────────────────────────────────┘
                                   │ HTTPS 或 http://localhost:11434
                OpenAI · DeepSeek · Kimi · GLM · Qwen · Ollama(本地)

### 4.1 AI 分类管线（本项目的心脏）
0. 输入：当前窗口全部未分组标签
1. 过滤：pinned？chrome:// 内部页？用户忽略列表？隐身窗口默认跳过
2. 查缓存：URL 归一化（去 utm_* 等跟踪参数）→ sha1 → storage.local 的 URL→类别 缓存（TTL 14 天）
3. 未命中者批量送 LLM：
   prompt = 系统提示词（类别清单 + 严格 JSON 输出约束 + few-shot）+ 每行 {id, title, url}
   期望输出：{"assignments":[{"id":1,"category":"开发工具"},...]}
   解析失败→温度 0 重试至多 2 次；仍失败→该批降级规则引擎
4. 写回缓存
5. GroupManager 建组或并入同名 Chrome Tab Group（配色轮转）
6. 结果回传 Side Panel 预览 → 用户确认或自动应用（autoApply 可配置）

- 批大小默认 30 个标签/请求；并发 ≤ 2；单请求超时 30s
- Token 控制：title 截断 80 字符、URL 截断 120 字符；只发白名单字段

### 4.2 Provider 抽象接口（先定接口再实现）

    // src/lib/llm/types.ts
    interface LlmProviderConfig {
      id: string;            // uuid
      name: string;          // 'DeepSeek' / '本地 Ollama'
      baseUrl: string;       // https://api.deepseek.com/v1 | http://localhost:11434/v1
      apiKey?: string;       // 本地模型可为空
      model: string;         // deepseek-chat | qwen2.5:7b ...
      temperature?: number;  // 默认 0
      maxOutputTokens?: number;
    }
    interface LlmClient {
      chat(messages: ChatMessage[], opts?: { signal?: AbortSignal }): Promise<string>;
      testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
    }

内置预设：OpenAI / DeepSeek / Moonshot Kimi / Zhipu GLM / DashScope Qwen / OpenRouter / Ollama(local) / LM Studio(local) / 自定义。切换 provider = 改配置，不改代码。

### 4.3 数据模型（storage schema）

    settings: {
      activeProviderId, providers: LlmProviderConfig[],
      categories: string[],            // 默认 12 类，可增删改
      autoApply: boolean,              // true=AI 结果直接生效 false=预览确认
      autoOrganizeOnTrigger: 'off'|'manual'|'hotkey'|'interval',
      batch: { size: 30; concurrency: 2; timeoutMs: 30000 },
      privacy: { sendPageContent: boolean /* MVP 恒 false */, incognitoExempt: boolean },
      rules: DomainRule[],             // 手动规则，最高优先级
      theme, language,
    }
    categoryCache: Record<sha1(normUrl), { c: string; t: number }>   // TTL 14d
    snapshots: Array<{ id, createdAt, tabs: TabMeta[] }>
---
## 5. 目录结构规划

    ai-tab-organizer/
    ├── docs/
    │   ├── PLAN.md               # 本文档
    │   ├── vertitab-research.md  # VertiTab 调研纪要（由 PLAN §2 展开存档）
    │   └── local-model-guide.md  # Ollama/LM Studio 本地模型部署指南
    ├── src/
    │   ├── entrypoints/          # WXT 约定式入口
    │   │   ├── background.ts     # SW：事件中枢 + 服务装配
    │   │   ├── sidepanel/        # 主 UI（React）
    │   │   ├── options/          # 设置页（React）
    │   │   └── popup/            # 快捷入口
    │   ├── lib/
    │   │   ├── llm/              # client.ts presets.ts prompts.ts parser.ts
    │   │   ├── organizer/        # pipeline.ts rules.ts cache.ts categories.ts
    │   │   ├── browser/          # tabs.ts groups.ts windows.ts（薄封装可单测）
    │   │   ├── storage/          # settings.ts snapshot.ts
    │   │   └── messaging/        # 类型化消息协议 + zod 校验
    │   ├── components/           # 共享 UI 组件
    │   ├── i18n/                 # zh_CN / en
    │   └── utils/
    ├── tests/                    # vitest 单测（lib 层纯逻辑）
    ├── wxt.config.ts
    ├── package.json
    └── README.md

---
## 6. 权限设计（最小化原则）
| 权限 | 用途 | 必需性 |
|---|---|---|
| tabs / tabGroups | 读标签元数据、建组、移动、折叠 | 必须 |
| sidePanel | 主界面 | 必须 |
| storage (+unlimitedStorage) | 设置/缓存/快照 | 必须 |
| alarms | 定时自动整理、缓存 TTL | 必须 |
| favicon | 侧栏显示站点图标 | 必须 |
| contextMenus（Phase 2） | 右键「把此页加入分类」 | 可选 |
| host_permissions | 不申请 all_urls！LLM 请求走 SW fetch 即可 | — |

注：MVP 不注入 content script（不读正文），无 host_permissions —— 审核风险与隐私面都最小。

隐私红线：默认只发送 title + URL 到用户自己配置的 endpoint；无 key 时自动降级规则模式并在 UI 明示；隐身窗口默认跳过；API Key 只存 chrome.storage.local，不出设备。

---
## 7. 里程碑与验收标准

### M0 脚手架（0.5 天）
- [ ] WXT 初始化 + React+TS+Tailwind 模板，pnpm dev 加载插件跑通
- [ ] CI：GitHub Actions 跑 lint + test + build
- 验收：浏览器加载扩展，side panel 显示 Hello；pnpm compile && pnpm test 全绿

### M1 标签管理基座（对标 VertiTab 基础能力）（1–2 天）✅ 已完成
- [x] TabEventHub + TabRegistry（session 持久化、去抖广播、SW 休眠后对账恢复）
- [x] Side Panel：垂直列表、实时增删改、搜索过滤、批量多选、关闭/固定/静音
- [x] 域名分组 + 排序（借鉴 VertiTab 思路，代码自写）
- [x] 一键清理（关非活跃/重复 URL）+ 快照/恢复
- 验收：自动化部分全绿（lint/compile/32 单测/build）；**待人工**：浏览器加载 dist 后按附录 A 的实测清单验证

### M2 规则引擎（0.5–1 天）
- [ ] DomainRule：域名/关键词 → 类别映射 + UI 编辑器
- [ ] URL 归一化缓存层（sha1 + TTL）
- 验收：单测覆盖规则匹配矩阵；断网状态下分组仍工作

### M3 LLM 分类核心（2–3 天）★ 最关键
- [ ] LlmClient（OpenAI 兼容 fetch、AbortController 超时、指数退避重试 ×2、并发池）
- [ ] Provider 预设 + Options 配置表单 + testConnection 按钮
- [ ] Prompt 工程：系统提示词（类别清单+严格 JSON 输出）、鲁棒 JSON 解析（截断修复/正则提取）
- [ ] 分类管线串联：过滤→缓存→批量→解析→写回→预览 UI→应用
- [ ] 失败降级链：LLM 失败 → 该批走规则引擎 → UI 提示原因
- [ ] 用量统计面板（请求数/token/耗时）
- 验收：
  ① DeepSeek 真实 key 下 30 标签一次分对率抽查 ≥90%；
  ② Ollama qwen2.5:3b 本地全流程可跑；
  ③ 无 key/断网自动降级不崩溃；
  ④ 提示词注入样例（网页标题藏指令）不破坏输出结构

### M4 体验完善（1–2 天）
- [ ] 自动整理触发器（快捷键 commands / 定时间隔 alarms / 新标签累积阈值）
- [ ] 分类预览确认弹层（diff 视图：哪些标签将进哪个组，可逐个改）
- [ ] i18n zh/en、暗色主题、空态/错误态
- 验收：全键盘可达；语言切换即时生效

### M5 发布准备（0.5–1 天）
- [ ] wxt zip 产出商店包；图标/截图/商店文案
- [ ] Firefox 目标编译验证
- [ ] README 完整文档 + local-model-guide.md
- 验收：Chrome Web Store 开发者后台上传通过自动审核项

### 测试策略（贯穿全程）
- lib 层纯函数单测 ≥80%（Vitest）：parser/rules/cache/prompt 组装/消息协议
- LlmClient 用 mock HTTP 测试；真实环境手动 E2E checklist（M3/M4 各一份）

---
## 8. 风险与对策
| 风险 | 对策 |
|---|---|
| MV3 SW 随时休眠中断长任务 | 单批 ≤30s 天然适合；关键状态落 chrome.storage.session；alarm 唤醒续跑 |
| LLM 输出不合法 JSON | 温度 0 + 结构化提示 + 解析容错 + 重试 + 规则兜底 |
| API Key 泄露 | 仅存本地 storage；Options 脱敏显示；.env 进 .gitignore；文档警示 |
| 商店审核对远程代码敏感 | 我们仅调用用户配置的 HTTP API，不含远程托管代码，符合政策 |
| 大量标签 token 成本 | 缓存 + 批量合并 + 截断 + 本地模型选项 |
| WXT 迭代快 | 锁定版本号，升级走独立 PR |

---
## 9. Git 与协作约定
- 远程：git@github.com:FlashPoint007/ai-tab-organizer.git（首次 push 前需在 GitHub 创建同名空仓库，或授权我用 gh repo create 直接建）
- 分支：main 保护 + 功能分支 feat/M1-*；Conventional Commits（docs:/feat:/fix:/chore:）
- 每个里程碑打 tag：v0.1.0-m1 …
- 提交前检查：pnpm lint && pnpm test && pnpm compile 全绿

## 10. 下一步行动（按序）
1. ~~你确认本计划~~ 已确认，仓库已创建并推送
2. ~~我执行 M0~~ 已完成，见附录 A
3. 开始 M1 标签管理基座

---

## 附录 A：实施日志

### M0（已完成）
- 锁定版本：wxt 0.21.4 / @wxt-dev/module-react 1.2.2 / React 19.2.8 / TypeScript 7.0.2 / Tailwind 4.3.3 / Vitest 4.1.11 / pnpm 11.10.0
- 与计划的差异：
  1. ESLint 从 M0 推迟到 M1 —— 先保证 compile/test/build 三绿基线，lint 规则集随首个业务代码一起定稿
  2. 扩展代码统一用 `import { browser } from 'wxt/browser'` 的类型安全 API 替代裸 chrome.* 全局（pnpm 严格布局下全局类型链路不稳，且 browser 命名空间利于 Firefox 适配）
- 验证结果：`pnpm compile`（tsc --noEmit）✓ · `pnpm test` 9/9 ✓ · `pnpm build` chrome-mv3 共 203.6 KB ✓
- 产物结构：background.ts / sidepanel(React) / options(React)，manifest 由 WXT 按约定式入口自动生成

### M1（已完成）
- 架构落地：
  - 消息协议 `src/lib/messaging/protocol.ts`（zod 校验，Request×16 + Event 广播 + Result 信封，客户端可用 `RequestInput` 省略默认值字段）
  - 存储抽象 KVStorage（local/session/Memory 三实现，业务可注入便于单测）
  - TabRegistry：内存 Map + chrome.storage.session 防抖持久化；SW 冷启动先热身再与实时查询对账
  - EventHub：tabs.on*/tabGroups.on* → 注册表增量更新 → 120ms 合并广播；移动/跨窗/分组变化走「整窗实时对账」
  - SnapshotService：上限 10 份 FIFO；恢复前按归一化 URL 去重跳过
- Side Panel：搜索过滤 / 列表·域名双视图（域名视图复用纯函数 computeDomainGroups）/ 多选批量（关闭·固定·静音·建组）/ 清理重复与非活跃的两步确认（按钮上预显候选数）/ 快照弹窗（创建·恢复·删除）
- 质量基线：ESLint（typescript-eslint recommended + react-hooks + consistent-type-imports）0 错 0 警；CI 增加 lint 步骤
- 版本调整：TypeScript 固定 ~6.0.3 —— typescript-eslint 8.67 尚不支持 TS 7（升级路径见 typescript-eslint#10940）
- 兼容性备忘：chrome.tabs.group/updateGroup/ungroup 在类型上是回调式签名，已在 groupsWrap 用类型化 shim 固化为 Promise 形态
- **待人工验收清单**：① 加载 .output/chrome-mv3 ② 开 20+ 标签：新增/关闭/切换/固定/静音实时同步 ③ 按域名分组→排序→再开新标签不串组 ④ 清理重复→快照恢复→已打开页被跳过 ⑤ SW 手动停止(service worker 面板)后操作仍正常（注册表对账生效）
