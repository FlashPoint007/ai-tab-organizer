# AI Tab Organizer

浏览器标签页自动整理插件：垂直侧边栏管理 + **大模型语义分类**，支持自定义 LLM API 与本地模型（Ollama / LM Studio）。

- 参考对象：VertiTab（规则式分组）。本项目在其基础能力之上加入 AI 分类管线。
- 状态：**M6 分类记忆/实时归类/备份 完成**（lint / typecheck / 89 单测 / Chrome+Firefox 构建全绿）—— 计划与路线图见 [docs/PLAN.md](docs/PLAN.md)

## 特性

- ✅ 垂直标签侧边栏：搜索、列表/域名双视图、多选批量（关闭/固定/静音/建组）、一键清理（重复/非活跃，自动存快照）、快照恢复
- ✅ AI 自动分类（自适应细分类）：先通读全部标签自行归纳类别（如「B站内部平台」「开发工具与监控」）再逐一分配；sha1 缓存省 token；没把握的自动回落规则
- ✅ 分类记忆：预览弹层里手动调整的类别自动沉淀为域名规则，同站点下次直接命中
- ✅ 实时归类：新标签打开后自动按 缓存→规则→AI 归类入组，无需手动整理
- ✅ 多 Provider：DeepSeek / OpenAI / Kimi / GLM / Qwen / OpenRouter 预设 + 本机 **Ollama / LM Studio**（OpenAI 兼容协议一套通吃）
- ✅ 自动化：快捷键 Alt+Shift+O / 定时整理 / 未分组标签阈值三种触发器
- ✅ AI 整理预览确认弹层：逐条改类别、取消勾选后再应用
- ✅ 备份导出导入：规则/分类/模型配置一键备份恢复（JSON）
- ✅ 界面：中英双语即时切换、暗色主题
- 🔒 隐私优先：安装时零 host 权限，调用模型前按域名动态请求授权；只发送标题与网址；API Key 仅存本地

## 快速开始（本地模型，零成本）

1. 安装并启动 [Ollama](https://ollama.com)，然后 `ollama pull qwen2.5:3b`
2. 加载本扩展 → 打开设置页 → 服务商选「Ollama（本机）」→ 授权并保存 → 测试连接
3. 侧栏点「✨ AI 整理」，预览确认后自动成组

详细步骤见 [docs/local-model-guide.md](docs/local-model-guide.md)；云端 Key（DeepSeek 等）在设置页选对应预设填 Key 即可。

## 开发

```
pnpm install
pnpm dev          # 开发模式（WXT HMR，浏览器加载扩展调试）
pnpm compile      # tsc --noEmit 类型检查
pnpm lint         # eslint
pnpm test         # vitest 单测
pnpm build        # 产出 .output/chrome-mv3
pnpm build -b firefox   # Firefox 目标（MV2 事件页）
pnpm zip          # 商店打包 → .output/*.zip
node scripts/generate-icons.mjs   # 重新生成图标
```

## 架构一览

- Background SW：TabRegistry（session 持久化+对账）/ TabEventHub（防抖广播）/ 消息路由（zod 校验协议）/ 快照与自动触发器
- AI 管线：缓存命中 → 批量并发 → 四级容错解析 → 写回缓存 → 失败批次回落规则引擎
- UI：React 18 侧边栏 + Options；i18n zh/en；Tailwind 暗色主题

详见 [docs/PLAN.md](docs/PLAN.md)（含 VertiTab 逆向调研与全部里程碑记录）。

## License

MIT
