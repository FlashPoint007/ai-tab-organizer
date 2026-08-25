# AI Tab Organizer

浏览器标签页自动整理插件：垂直侧边栏管理 + **大模型语义分类**，支持自定义 LLM API 与本地模型（Ollama）。

- 参考对象：VertiTab（规则式分组）。本项目在其基础能力之上加入 AI 分类管线。
- 状态：**M4 体验完善完成**（lint / typecheck / 73 单测 / MV3 构建全绿）—— 计划与路线图见 [docs/PLAN.md](docs/PLAN.md)

## 特性
- ✅ 垂直标签侧边栏：搜索、列表/域名双视图、多选批量（关闭/固定/静音/建组）、一键清理（重复/非活跃，自动存快照）、快照恢复
- ✅ 规则引擎：域名/关键词规则 → 自定义分类，「按类别分组」一键归类（离线可用，Options 页可视化管理）
- ✅ AI 自动分类：title+URL 批量送大模型 → 自动建 Chrome Tab Group；支持 DeepSeek/OpenAI/Kimi/GLM/Qwen/OpenRouter 及本机 **Ollama/LM Studio**（OpenAI 兼容协议一套通吃）；sha1 缓存省 token，失败自动回落规则
- 🔒 隐私：安装时零 host 权限，调用模型前按域名动态请求授权；API Key 仅存本地
- ✅ 自动化与体验：快捷键 Alt+Shift+O / 定时 / 未分组阈值三种触发器；AI 整理预览确认弹层（可逐条改类别）；中英双语即时切换，暗色主题
- 规则引擎兜底：无 key / 断网 / 超时时自动降级为规则分组

## 开发
```
pnpm install
pnpm dev        # 开发模式（WXT HMR，浏览器加载扩展调试）
pnpm compile    # tsc --noEmit 类型检查
pnpm test       # vitest 单测
pnpm build      # 产出 .output/chrome-mv3
pnpm zip        # 商店打包（M5 起）
```

## License
MIT（暂定）