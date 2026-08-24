# AI Tab Organizer

浏览器标签页自动整理插件：垂直侧边栏管理 + **大模型语义分类**，支持自定义 LLM API 与本地模型（Ollama）。

- 参考对象：VertiTab（规则式分组）。本项目在其基础能力之上加入 AI 分类管线。
- 状态：**规划中** —— 详细计划见 [docs/PLAN.md](docs/PLAN.md)

## 特性（规划）
- 垂直标签侧边栏：搜索、多选、批量关闭、固定、域名分组、一键清理、快照恢复
- AI 自动分类：title+URL 批量送大模型，输出类别 → 自动建 Chrome Tab Group
- 多 Provider：OpenAI / DeepSeek / Kimi / GLM / Qwen / OpenRouter / 本地 Ollama（OpenAI 兼容协议一套通吃）
- 规则引擎兜底：无 key / 断网 / 超时时按域名规则分组
- 隐私：默认只发 title+URL；隐身窗口跳过；Key 仅存本地

## 开发（待 M0 脚手架落地后更新）
```
pnpm install
pnpm dev      # 加载开发版扩展
pnpm test
pnpm zip      # 商店打包
```

## License
MIT（暂定）