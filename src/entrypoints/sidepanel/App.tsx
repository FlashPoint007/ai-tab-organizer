import { useEffect, useState } from 'react';

import { browser } from 'wxt/browser';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; count: number }
  | { kind: 'error'; message: string };

async function loadTabCount(): Promise<LoadState> {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    return { kind: 'ready', count: tabs.length };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    loadTabCount().then(setState);
  }, []);

  return (
    <main className="flex h-screen flex-col gap-3 bg-neutral-950 p-4 text-neutral-100">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">AI Tab Organizer</h1>
        <p className="mt-0.5 text-xs text-neutral-400">M0 脚手架 · Side Panel 已就绪</p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
        {state.kind === 'loading' && <span className="text-neutral-500">读取标签中…</span>}
        {state.kind === 'ready' && (
          <span>
            当前窗口标签数：<strong className="text-emerald-400">{state.count}</strong>
          </span>
        )}
        {state.kind === 'error' && <span className="text-red-400">tabs API 不可用：{state.message}</span>}
      </section>

      <footer className="mt-auto rounded-lg border border-dashed border-neutral-800 p-3 text-xs leading-relaxed text-neutral-500">
        路线图：M1 标签管理基座 → M2 规则引擎 → M3 LLM 分类核心（自定义 API /
        本地模型）→ M4 体验完善 → M5 发布
      </footer>
    </main>
  );
}
