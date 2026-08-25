# Chrome Web Store 上架素材

> 提交入口：<https://chrome.google.com/webstore/devconsole>
> 打包产物：`pnpm zip` → `.output/ai-tab-organizer-<version>-chrome.zip`

## 基本信息

- **名称**：AI Tab Organizer — AI 标签整理
- **简短描述**（132 字符内）：
  垂直标签侧边栏 + 大模型自动分类。支持 DeepSeek/OpenAI/Kimi/GLM/Qwen 与本机 Ollama，规则兜底，隐私优先。
- **分类**：生产力工具
- **语言**：中文（简体）、English

## 详细描述

AI Tab Organizer 把「一堆乱七八糟的标签页」变成「按语义分好类的标签组」。

✨ AI 语义分类
- 一键把当前窗口的标签按内容语义归类，自动建立 Chrome 标签组并配色
- 支持自定义类别清单，模型没把握的标签自动回落到本地规则，绝不瞎分
- URL 归一化缓存：同一页面不重复消耗 token

🤖 模型随便换
- 内置 DeepSeek / OpenAI / Kimi / GLM / 通义 Qwen / OpenRouter 预设
- 支持本机 Ollama / LM Studio——完全离线、零成本
- 全部走 OpenAI 兼容协议，任何兼容服务都能接

🗂 垂直标签管理
- 侧边栏垂直列表 / 域名分组双视图，实时同步
- 搜索过滤、多选批量操作（关闭/固定/静音/建组）
- 一键清理重复与不活跃标签，清理前自动存快照，可随时恢复

⚡ 自动化
- 快捷键 Alt+Shift+O 随时整理
- 定时整理、未分组标签达到阈值自动整理

🔒 隐私优先
- 安装时零网站权限；调用模型前才按域名请求授权
- 只发送标题与网址（可关闭）；API Key 仅存本地

## 单一用途说明

本扩展的单一用途是：整理与管理浏览器标签页（垂直列表、分组、清理与基于大模型的自动分类）。

## 权限使用说明

- `tabs` / `tabGroups`：读取标签元数据并建立/管理标签组（核心功能）
- `sidePanel`：在侧边栏展示标签管理界面
- `storage` / `unlimitedStorage`：本地保存设置、分类缓存与快照
- `alarms`：实现定时自动整理
- `favicon`：在列表中显示网站图标
- `optional_host_permissions`（动态申请）：仅在用户配置模型服务后，为该服务域名申请访问权限以调用其 API

## 隐私政策要点

- 不收集、不上传任何个人数据到开发者服务器
- 分类时仅向「用户自行配置的模型服务」发送标签页标题与网址
- 所有设置、缓存与快照仅存于本地浏览器

## 截图建议清单（1280×800）

1. 侧栏整体：分组后的标签列表 + 工具栏
2. AI 整理预览弹层
3. Options 的 AI 模型配置区（含 Ollama 本机示例）
4. 清理重复的两步确认
