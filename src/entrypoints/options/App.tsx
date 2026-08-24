const PLANNED_SECTIONS = [
  { title: '模型 Provider', milestone: 'M3', desc: 'OpenAI 兼容端点：DeepSeek / Kimi / GLM / Ollama 本地等，含连接测试' },
  { title: '分类类别管理', milestone: 'M3', desc: '自定义类别清单，驱动 LLM 输出约束' },
  { title: '规则引擎', milestone: 'M2', desc: '域名/关键词规则，LLM 不可用时兜底' },
  { title: '隐私开关', milestone: 'M4', desc: '隐身窗口跳过、发送内容白名单控制' },
] as const;

export default function App() {
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-neutral-950 p-6 text-neutral-100">
      <h1 className="text-xl font-semibold tracking-tight">AI Tab Organizer · 设置</h1>
      <p className="mt-1 text-sm text-neutral-400">
        M0 占位页 —— 各配置分区将随里程碑逐步实现。
      </p>

      <ul className="mt-6 space-y-3">
        {PLANNED_SECTIONS.map((s) => (
          <li key={s.title} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{s.title}</h2>
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {s.milestone}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">{s.desc}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
