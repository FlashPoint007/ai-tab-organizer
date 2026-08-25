# 本地模型部署指南（Ollama / LM Studio）

不想把标签数据发给云端？用本机模型跑 AI 分类，零成本、完全离线。

## 方案 A：Ollama（推荐）

### 1. 安装

- macOS / Linux：`curl -fsSL https://ollama.com/install.sh | sh`
- Windows：官网下载安装包 <https://ollama.com/download>
- macOS 也可用 Homebrew：`brew install ollama`

### 2. 启动服务并拉模型

```bash
ollama serve                # 一般安装后已自动在后台运行
ollama pull qwen2.5:3b     # 约 2GB，中文分类效果好；机器好可换 qwen2.5:7b
```

### 3. 在插件里配置

| 字段 | 值 |
|---|---|
| 服务商 | Ollama（本机） |
| Base URL | `http://localhost:11434/v1` |
| 模型 | `qwen2.5:3b`（与 pull 的名字一致） |
| API Key | 留空 |

点「授权并保存」→ 浏览器会请求访问 `http://localhost:11434` 的权限，允许即可。
然后点「测试连接」，看到「连接成功」就能在侧栏用「✨ AI 整理」了。

> 提示：首次分类本地模型要加载权重，可能比云端慢几秒到几十秒，属正常现象。

### 常用模型建议

| 模型 | 大小 | 说明 |
|---|---|---|
| `qwen2.5:3b` | ~2GB | 中文分类性价比首选 |
| `qwen2.5:7b` | ~4.7GB | 更准，需 8GB+ 内存 |
| `llama3.2:3b` | ~2GB | 英文场景好 |
| `deepseek-r1:7b` | ~4.7GB | 推理强但输出较慢 |

## 方案 B：LM Studio

1. 安装 LM Studio：<https://lmstudio.ai/>
2. 在其内置搜索里下载任意 instruct 模型（如 Qwen2.5 3B Instruct）
3. 打开 **Developer** 标签 → Start Server（默认 `http://localhost:1234/v1`）
4. 插件里选「LM Studio（本机）」，模型名填 LM Studio 显示的模型标识

## 常见问题

- **测试连接失败：网络请求失败** → 确认服务在跑（`curl http://localhost:11434/v1/models` 有返回）；确认浏览器已授权该域名（扩展设置页重新保存一次）
- **输出不是合法 JSON** → 换 instruct 系列模型；插件自带四级解析容错与规则兜底，个别失败不影响整体
- **速度慢** → 换更小的模型；或在设置里把批量大小从 30 调小，配合缓存命中逐步完成
